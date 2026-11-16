"""Снимки (checkpoint'ы) лабы: ПОЛНАЯ копия её содержимого на момент времени.

Копия, а не ссылки: снимок обязан пережить физическое удаление исходной записи (очистка корзины,
удаление лабы) — иначе «нотариальная» ценность ломается именно тогда, когда что-то стирают.

Устройство git-подобное — чтобы на нём можно было строить fork и merge:
  * item — одна копируемая строка + item_hash (хеш её содержимого и файла);
  * tree_hash — хеш отсортированных (object_key, item_hash);
  * commit_hash — хеш (версия формата, лаба, commit_hash РОДИТЕЛЯ, tree_hash, время, заголовок).
Родитель — предыдущий снимок этой лабы (цепочка линейна, это держат частичные уникальные индексы);
правка любого старого снимка меняет его хеши, verify_checkpoint() это видит. Алгоритм — в
services/checkpoint_hash.py.

В СНИМОК ВХОДИТ (живое на момент снимка): сама лаба; 6 базовых типов с lab_id этой лабы; «отметки
корзины» (тип+id без содержимого) для записей в корзине; Result лабы (кроме visibility='private' —
личный черновик автора) и их связи с источниками; Link и EntityHypothesis, оба конца которых в
снимке; дети живых записей (комментарии, теги, картинки и вложения С БАЙТАМИ, источники, стадии);
значения шкал ВЛАДЕЛЬЦА записи и пользовательские шкалы (ScaleDef), на которые они ссылаются;
состав участников лабы; шкалы задач (TaskScale) и их привязки к гипотезам; история статусов гипотез; посты ленты к гипотезам и наблюдениям и комментарии к постам гипотез.
НЕ ВХОДИТ: EXCLUDED_CHILD_KINDS (с причинами); комментарии-«выводы рефлексии»; вложения в корзине;
история версий вложений; миниатюры (производные).

Ограничения: операция синхронная (на нынешнем масштабе секунды, но nginx обрывает запрос через 60 с);
байты файлов копируются в тот же запрос; если транзакция упала после копирования, файлы остаются без
ссылок до чистки (этап 2)."""
import asyncio
import hashlib
import json
import os
import re
import tempfile
from dataclasses import dataclass
from datetime import timedelta

from sqlalchemy import func, or_, select
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.entity_registry import ENTITY_MODELS
from app.db.session import engine
from app.models.checkpoints import LabCheckpoint, LabCheckpointItem
from app.models.entities import (
    EntityAttachment, EntityHypothesis, EntityImage, EntityStage, EntityTag, Link, Result,
    ResultSourceLink, ScaleDef, ScaleValue, SourceDocument, Tag, HypStatusHistory, TaskScale, TaskScaleHypothesis,
)
from app.models.social import EntityComment, HypothesisPost, Lab, LabMember, ObservationPost, PostComment
from app.services import attachment_storage, image_processing
from app.services.checkpoint_hash import SCHEMA_VERSION, commit_hash, item_hash, tree_hash
from app.services.row_snapshot import serialize_row

# Потолок хранения на лабу считается в БАЙТАХ, а не в штуках: JSON-копии строк + файлы, уникальные по хешу.
# Снимки не удаляются поштучно, поэтому потолок нужен (диск конечен), но поднять его может только оператор
# (переменная окружения), а не пользователь. Частота ограничена отдельно — от спама, не от долгой жизни лабы.
LAB_BUDGET_BYTES = int(os.getenv("CHECKPOINT_LAB_BUDGET_BYTES", str(1024 * 1024 * 1024)))
BUDGET_WARN_FRACTION = 0.8
MAX_CHECKPOINTS_PER_HOUR = 30
MAX_CHECKPOINT_BLOB_BYTES = 500 * 1024 * 1024
TITLE_MAX_LEN = 120
CHECKPOINT_BLOB_DIR = "attachments/checkpoint_blobs"

# Ключи POLYMORPHIC_CHILD_MODELS (app/core/entity_registry.py) -> что с ними делает снимок. Новый вид
# ребёнка в реестре обязан попасть в один из двух списков: это проверяет тест (иначе тихо
# не попадёт в снимок, а то и утечёт личное).
INCLUDED_CHILD_KINDS = frozenset({"comment", "tag", "image", "attachment", "source", "stage", "scale_value"})
EXCLUDED_CHILD_KINDS: dict[str, str] = {
    "comment_seen": "личное состояние «прочитано», не содержимое",
    "embedding": "производное (вектор), пересчитывается; чтение векторов вне services/embeddings.py запрещено",
    "reflection": "личные диалоги рефлексии (raw_dialogue_text) — не для общего снимка",
    "reflection_insight": "то же",
    "content_translation": "кэш машинного перевода — производное",
}
FILE_KINDS = frozenset({"image", "attachment"})
# Виды «структурных» элементов (не дети полиморфных таблиц): тест требует, чтобы каждый был виден постороннему
# по белому списку или явно скрыт.
STRUCTURAL_KINDS = frozenset({"lab", "entity", "trashed", "result", "result_source_link", "link", "entity_hypothesis",
                              "scale_def", "lab_member", "task_scale", "task_scale_hypothesis", "hyp_status_history", "post",
                              "post_comment"})


class CheckpointError(Exception):
    def __init__(self, detail: dict):
        super().__init__(detail["code"])
        self.detail = detail


class CheckpointRateLimit(CheckpointError):
    def __init__(self, per_hour: int):
        super().__init__({"code": "checkpoint_rate_limit", "per_hour": per_hour})


class CheckpointBudget(CheckpointError):
    def __init__(self, used: int, needed: int, budget: int):
        super().__init__({"code": "checkpoint_budget_exceeded", "used_bytes": used, "needed_bytes": needed, "budget_bytes": budget})


class CheckpointTooLarge(CheckpointError):
    def __init__(self, total: int, limit: int):
        super().__init__({"code": "checkpoint_too_large", "bytes": total, "limit": limit})


def is_chain_conflict(exc: DBAPIError) -> bool:
    """Два снимка одной лабы создавались одновременно: нарушен частичный уникальный индекс цепочки
    (23505) либо сериализация транзакции (40001). Для пользователя — 409 «повторите»."""
    code = getattr(exc.orig, "sqlstate", None) or getattr(exc.orig, "pgcode", None)
    return code in ("23505", "40001")


@dataclass
class Item:
    kind: str
    object_key: str
    entity_type: str
    entity_id: int | None
    data: dict
    blob_src: str | None = None
    blob_sha256: str | None = None
    blob_size: int | None = None
    item_hash: str = ""


def _safe_path(resolver, name: str | None) -> str | None:
    if not name:
        return None
    try:
        return resolver(name)
    except ValueError:
        return None


async def collect_items(db: AsyncSession, lab_id: int) -> list[Item]:
    lab = await db.get(Lab, lab_id)
    if lab is None:
        raise LookupError("лаборатория не найдена")
    items: list[Item] = [Item("lab", f"lab:{lab.id}", "lab", lab.id, serialize_row(lab))]

    live: dict[str, list] = {}
    for entity_type, model in ENTITY_MODELS.items():
        rows = (await db.execute(select(model).where(model.lab_id == lab_id, model.deleted_at.is_(None)))).scalars().all()
        live[entity_type] = list(rows)
        for row in rows:
            items.append(Item("entity", f"entity:{entity_type}:{row.id}", entity_type, row.id, serialize_row(row)))
        trashed = (await db.execute(select(model.id).where(model.lab_id == lab_id, model.deleted_at.is_not(None)))).scalars().all()
        for tid in trashed:
            items.append(Item("trashed", f"trashed:{entity_type}:{tid}", entity_type, tid,
                              {"entity_type": entity_type, "entity_id": tid}))

    ids_by_type = {t: [r.id for r in rows] for t, rows in live.items()}
    owners = {(t, r.id): r.user_id for t, rows in live.items() for r in rows}
    targets = {t: ids for t, ids in ids_by_type.items() if ids}
    stage_targets = {**targets, "lab": [lab.id]}
    live_set = set(owners)

    async def poly(child_model, tg: dict, *where):
        for etype, ids in tg.items():
            stmt = select(child_model).where(child_model.entity_type == etype, child_model.entity_id.in_(ids), *where)
            for row in (await db.execute(stmt)).scalars().all():
                yield etype, row

    from app.core.personal_notes import personal_comment_ids
    comment_rows = [(etype, row) async for etype, row in poly(
        EntityComment, targets, or_(EntityComment.source.is_(None), EntityComment.source != "reflection_followup"))]
    per_entity: dict[tuple, list] = {}
    for etype, row in comment_rows:
        per_entity.setdefault((etype, row.entity_id), []).append((row.id, row.author_id, row.parent_id, row.stance))
    # личные заметки владельца не материал лаборатории (app.core.personal_notes): в снимок, который видят участники, не идут
    hidden = set().union(*(personal_comment_ids(v, owners.get(k)) for k, v in per_entity.items())) if per_entity else set()
    for etype, row in comment_rows:
        if row.id not in hidden:
            items.append(Item("comment", f"comment:{row.id}", etype, row.entity_id, serialize_row(row)))
    async for etype, row in poly(EntityImage, targets):
        items.append(Item("image", f"image:{row.id}", etype, row.entity_id, serialize_row(row),
                          blob_src=_safe_path(image_processing.resolve_image_path, row.filename)))
    async for etype, row in poly(EntityAttachment, targets, EntityAttachment.deleted_at.is_(None)):
        items.append(Item("attachment", f"attachment:{row.id}", etype, row.entity_id, serialize_row(row),
                          blob_src=_safe_path(attachment_storage.resolve_attachment_path, row.storage_path)))
    async for etype, row in poly(SourceDocument, targets):
        items.append(Item("source", f"source:{row.id}", etype, row.entity_id, serialize_row(row)))
    async for etype, row in poly(EntityStage, stage_targets):
        items.append(Item("stage", f"stage:{etype}:{row.entity_id}", etype, row.entity_id, serialize_row(row)))

    for etype, ids in targets.items():
        tag_rows = (await db.execute(
            select(EntityTag, Tag).join(Tag, Tag.id == EntityTag.tag_id)
            .where(EntityTag.entity_type == etype, EntityTag.entity_id.in_(ids))
        )).all()
        for et, tag in tag_rows:
            items.append(Item("tag", f"tag:{etype}:{et.entity_id}:{tag.id}", etype, et.entity_id, {
                "entity_type": etype, "entity_id": et.entity_id, "tag_id": tag.id, "name": tag.name, "tag_user_id": tag.user_id,
            }))

    scale_ids: set[str] = set()
    async for etype, row in poly(ScaleValue, targets):
        if owners.get((etype, row.entity_id)) != row.user_id:
            continue  # значения шкал ЧУЖИХ людей на этой записи в снимок не входят
        scale_ids.add(row.scale_id)
        items.append(Item("scale_value", f"scale_value:{etype}:{row.entity_id}:{row.user_id}:{row.scale_id}",
                          etype, row.entity_id, serialize_row(row)))
    def_ids = {int(m.group(1)) for sid in scale_ids if (m := re.fullmatch(r"custom_(\d+)", sid))}
    if def_ids:
        for sd in (await db.execute(select(ScaleDef).where(ScaleDef.id.in_(def_ids), ScaleDef.builtin_key.is_(None)))).scalars().all():
            items.append(Item("scale_def", f"scale_def:{sd.id}", "scale_def", sd.id, serialize_row(sd)))

    for etype, ids in targets.items():
        for link in (await db.execute(select(Link).where(Link.from_type == etype, Link.from_id.in_(ids)))).scalars().all():
            if (link.to_type, link.to_id) in live_set:
                items.append(Item("link", f"link:{link.id}", "link", link.id, serialize_row(link)))

    live_hyps = ids_by_type.get("hypothesis", [])
    for ptype in ("task", "question"):
        pids = ids_by_type.get(ptype, [])
        if not pids or not live_hyps:
            continue
        for eh in (await db.execute(
            select(EntityHypothesis).where(EntityHypothesis.parent_type == ptype, EntityHypothesis.parent_id.in_(pids),
                                           EntityHypothesis.hypothesis_id.in_(live_hyps))
        )).scalars().all():
            items.append(Item("entity_hypothesis", f"entity_hypothesis:{ptype}:{eh.parent_id}:{eh.hypothesis_id}",
                              "entity_hypothesis", eh.parent_id, serialize_row(eh)))

    post_hyp: dict[int, int] = {}  # id поста гипотезы -> id гипотезы (для комментариев к постам)
    for ptype, pmodel, fk in (("hypothesis", HypothesisPost, HypothesisPost.hypothesis_id),
                              ("observation", ObservationPost, ObservationPost.observation_id)):
        pids = ids_by_type.get(ptype, [])  # посты только ЖИВЫХ записей этой лабы: корзина и чужие в снимок не идут
        if not pids:
            continue
        for post in (await db.execute(select(pmodel).where(fk.in_(pids)))).scalars().all():
            items.append(Item("post", f"post:{ptype}:{post.id}", ptype, getattr(post, f"{ptype}_id"), serialize_row(post)))
            if ptype == "hypothesis":
                post_hyp[post.id] = post.hypothesis_id

    if post_hyp:  # комментарии к постам гипотез (у постов наблюдений своей таблицы комментариев нет)
        for pc in (await db.execute(select(PostComment).where(PostComment.post_id.in_(list(post_hyp))))).scalars().all():
            items.append(Item("post_comment", f"post_comment:{pc.id}", "hypothesis", post_hyp[pc.post_id], serialize_row(pc)))

    for m in (await db.execute(select(LabMember).where(LabMember.lab_id == lab_id))).scalars().all():
        items.append(Item("lab_member", f"lab_member:{m.user_id}", "lab", lab.id, serialize_row(m)))  # кто имел доступ тогда

    task_ids = ids_by_type.get("task", [])
    if task_ids:
        scales = (await db.execute(select(TaskScale).where(TaskScale.task_id.in_(task_ids)))).scalars().all()
        scale_task = {s.id: s.task_id for s in scales}
        for s in scales:
            items.append(Item("task_scale", f"task_scale:{s.id}", "task", s.task_id, serialize_row(s)))
        if scale_task and live_hyps:  # привязка — только к гипотезе, живой и в этой лабе (как EntityHypothesis)
            for th in (await db.execute(select(TaskScaleHypothesis).where(
                    TaskScaleHypothesis.task_scale_id.in_(list(scale_task)),
                    TaskScaleHypothesis.hypothesis_id.in_(live_hyps)))).scalars().all():
                items.append(Item("task_scale_hypothesis", f"task_scale_hypothesis:{th.task_scale_id}:{th.hypothesis_id}",
                                  "task", scale_task[th.task_scale_id], serialize_row(th)))
    if live_hyps:
        for hh in (await db.execute(select(HypStatusHistory).where(HypStatusHistory.hypothesis_id.in_(live_hyps)))).scalars().all():
            items.append(Item("hyp_status_history", f"hyp_status_history:{hh.id}", "hypothesis", hh.hypothesis_id, serialize_row(hh)))

    results = (await db.execute(select(Result).where(Result.lab_id == lab_id, Result.visibility != "private"))).scalars().all()
    for r in results:
        items.append(Item("result", f"result:{r.id}", "result", r.id, serialize_row(r)))
    if results:
        for rl in (await db.execute(select(ResultSourceLink).where(ResultSourceLink.result_id.in_([r.id for r in results])))).scalars().all():
            items.append(Item("result_source_link", f"result_source_link:{rl.result_id}:{rl.source_document_id}",
                              "result", rl.result_id, serialize_row(rl)))

    items.sort(key=lambda i: i.object_key)
    keys = [i.object_key for i in items]
    if len(set(keys)) != len(keys):
        raise RuntimeError("дубли object_key в снимке")
    return items


def _blob_path(sha: str) -> str:
    return os.path.join(CHECKPOINT_BLOB_DIR, sha[:2], sha)


def store_blob(src: str) -> tuple[str, int]:
    """Копирует файл в хранилище снимков под именем-хешем содержимого (один и тот же файл в десяти
    снимках хранится один раз). Запись через временный файл и os.replace: читатель никогда не видит
    недописанный блоб."""
    os.makedirs(CHECKPOINT_BLOB_DIR, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=CHECKPOINT_BLOB_DIR, prefix=".tmp-")
    digest, size = hashlib.sha256(), 0
    try:
        with os.fdopen(fd, "wb") as out, open(src, "rb") as fin:
            while chunk := fin.read(1024 * 1024):
                digest.update(chunk)
                out.write(chunk)
                size += len(chunk)
        sha = digest.hexdigest()
        dest = _blob_path(sha)
        if os.path.exists(dest):
            os.remove(tmp)
            os.utime(dest, None)  # свежая отметка: чистка блобов не тронет файл, на который вот-вот сошлётся этот снимок
        else:
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            os.replace(tmp, dest)
    except BaseException:
        if os.path.exists(tmp):
            os.remove(tmp)
        raise
    return sha, size


def _total_bytes(items: list[Item]) -> int:
    return sum(os.path.getsize(i.blob_src) for i in items if i.blob_src and os.path.isfile(i.blob_src))


async def _store_blobs(items: list[Item]) -> None:
    for it in items:
        if not it.blob_src:
            continue
        try:
            it.blob_sha256, it.blob_size = await asyncio.to_thread(store_blob, it.blob_src)
        except FileNotFoundError:
            it.blob_sha256 = it.blob_size = None  # файл исчез между проверкой и копированием: честно «нет файла»


def snapshot_session_maker() -> async_sessionmaker:
    """Сессии со своим уровнем изоляции: сущность и её дети должны быть из ОДНОГО момента. Обычная
    сессия запроса уже начала транзакцию, менять в ней уровень поздно — поэтому отдельная."""
    return async_sessionmaker(engine.execution_options(isolation_level="REPEATABLE READ"), expire_on_commit=False)


async def lab_storage_bytes(db: AsyncSession, lab_id: int) -> int:
    """Сколько места занимают снимки лабы: JSON-копии строк (pg_column_size) + файлы, уникальные по хешу
    (один файл в разных снимках лежит на диске один раз и считается один раз)."""
    json_bytes = (await db.execute(
        select(func.coalesce(func.sum(func.pg_column_size(LabCheckpointItem.snapshot_data)), 0))
        .select_from(LabCheckpointItem)
        .join(LabCheckpoint, LabCheckpoint.id == LabCheckpointItem.checkpoint_id)
        .where(LabCheckpoint.lab_id == lab_id))).scalar_one()
    per_blob = (select(func.max(LabCheckpointItem.blob_size).label("size"))
                .select_from(LabCheckpointItem)
                .join(LabCheckpoint, LabCheckpoint.id == LabCheckpointItem.checkpoint_id)
                .where(LabCheckpoint.lab_id == lab_id, LabCheckpointItem.blob_sha256.is_not(None))
                .group_by(LabCheckpointItem.blob_sha256).subquery())
    blob_bytes = (await db.execute(select(func.coalesce(func.sum(per_blob.c.size), 0)))).scalar_one()
    return int(json_bytes) + int(blob_bytes)


def storage_status(used: int) -> dict:
    return {"used_bytes": used, "budget_bytes": LAB_BUDGET_BYTES, "warn": used >= LAB_BUDGET_BYTES * BUDGET_WARN_FRACTION}


async def create_checkpoint(lab_id: int, user_id: int, title: str | None) -> int:
    """Создаёт снимок, возвращает его id. LookupError — лаба исчезла; CheckpointError — лимиты;
    DBAPIError с is_chain_conflict — параллельное создание (вызывающий отвечает 409)."""
    async with snapshot_session_maker()() as db:
        now = (await db.execute(select(func.now()))).scalar_one()  # ПЕРВЫЙ запрос: он же задаёт снимок БД
        recent = (await db.execute(select(func.count()).select_from(LabCheckpoint).where(
            LabCheckpoint.lab_id == lab_id, LabCheckpoint.created_at > now - timedelta(hours=1)))).scalar_one()
        if recent >= MAX_CHECKPOINTS_PER_HOUR:
            raise CheckpointRateLimit(MAX_CHECKPOINTS_PER_HOUR)
        used = await lab_storage_bytes(db, lab_id)
        parent = (await db.execute(
            select(LabCheckpoint).where(LabCheckpoint.lab_id == lab_id).order_by(LabCheckpoint.id.desc()).limit(1)
        )).scalar_one_or_none()

        items = await collect_items(db, lab_id)
        total = _total_bytes(items)
        if total > MAX_CHECKPOINT_BLOB_BYTES:
            raise CheckpointTooLarge(total, MAX_CHECKPOINT_BLOB_BYTES)  # до копирования: ни байта лишнего на диск
        # Оценка нового снимка консервативна: все файлы считаются новыми, хотя часть уже лежит в блобах лабы
        # (used считается точно, с дедупликацией). Проверка ДО копирования файлов: отказ ничего не пишет.
        need = total + sum(len(json.dumps(it.data, ensure_ascii=False).encode()) for it in items)
        if used + need > LAB_BUDGET_BYTES:
            raise CheckpointBudget(used, need, LAB_BUDGET_BYTES)
        await _store_blobs(items)

        for it in items:
            it.item_hash = item_hash(it.kind, it.object_key, it.data, it.blob_sha256)
        th = tree_hash((it.object_key, it.item_hash) for it in items)
        cp = LabCheckpoint(
            lab_id=lab_id, created_by=user_id, parent_id=parent.id if parent else None,
            parent_commit_hash=parent.commit_hash if parent else None, title=title,
            schema_version=SCHEMA_VERSION, tree_hash=th, item_count=len(items),
            blob_bytes=sum(it.blob_size or 0 for it in items), created_at=now,
            commit_hash=commit_hash(lab_id=lab_id, parent_commit_hash=parent.commit_hash if parent else None,
                                    tree=th, created_at=now, title=title),
        )
        db.add(cp)
        await db.flush()
        db.add_all(LabCheckpointItem(
            checkpoint_id=cp.id, kind=it.kind, entity_type=it.entity_type, entity_id=it.entity_id,
            object_key=it.object_key, snapshot_data=it.data, item_hash=it.item_hash,
            blob_sha256=it.blob_sha256, blob_size=it.blob_size,
        ) for it in items)
        await db.commit()
        return cp.id


async def verify_checkpoint(db: AsyncSession, checkpoint_id: int, *, check_blobs: bool = False) -> list[str]:
    """Пересчитывает хеши из того, что СЕЙЧАС лежит в базе, и сверяет с записанными. Пустой список —
    снимок цел. Проблемы: "item:<object_key>", "item_count", "tree", "commit", "parent", "blob:<sha>"."""
    cp = await db.get(LabCheckpoint, checkpoint_id)
    if cp is None:
        raise LookupError("снимок не найден")
    rows = (await db.execute(select(LabCheckpointItem).where(LabCheckpointItem.checkpoint_id == checkpoint_id)
                             .order_by(LabCheckpointItem.object_key))).scalars().all()
    problems: list[str] = []
    entries: list[tuple[str, str]] = []
    for it in rows:
        h = item_hash(it.kind, it.object_key, it.snapshot_data, it.blob_sha256)
        if h != it.item_hash:
            problems.append(f"item:{it.object_key}")
        entries.append((it.object_key, h))
        if check_blobs and it.blob_sha256 and not os.path.isfile(_blob_path(it.blob_sha256)):
            problems.append(f"blob:{it.blob_sha256}")
    if cp.item_count != len(rows):
        problems.append("item_count")
    th = tree_hash(entries)
    if th != cp.tree_hash:
        problems.append("tree")
    if cp.parent_id is not None:  # родитель на месте: его хеш обязан совпасть с записанным в этом снимке
        parent = await db.get(LabCheckpoint, cp.parent_id)
        if parent is None or parent.commit_hash != cp.parent_commit_hash:
            problems.append("parent")
    if commit_hash(lab_id=cp.lab_id, parent_commit_hash=cp.parent_commit_hash, tree=cp.tree_hash,
                   created_at=cp.created_at, title=cp.title) != cp.commit_hash:
        problems.append("commit")
    return problems


def group_items(rows: list[LabCheckpointItem]) -> dict:
    """Плоские элементы снимка -> «как всё выглядело тогда»: записи по типам, дети внутри."""
    lab_block = None
    entities: dict[str, list[dict]] = {}
    results: list[dict] = []
    links, entity_hypotheses, scale_defs, trashed = [], [], [], []
    index: dict[tuple[str, int], dict] = {}
    children: list[LabCheckpointItem] = []
    for it in rows:
        if it.kind == "lab":
            lab_block = {"data": it.snapshot_data, "children": {}}
            index[("lab", it.entity_id)] = lab_block
        elif it.kind == "entity":
            node = {"entity_id": it.entity_id, "data": it.snapshot_data, "children": {}}
            entities.setdefault(it.entity_type, []).append(node)
            index[(it.entity_type, it.entity_id)] = node
        elif it.kind == "result":
            node = {"entity_id": it.entity_id, "data": it.snapshot_data, "children": {}}
            results.append(node)
            index[("result", it.entity_id)] = node
        elif it.kind == "trashed":
            trashed.append({"entity_type": it.entity_type, "entity_id": it.entity_id})
        elif it.kind == "link":
            links.append(it.snapshot_data)
        elif it.kind == "entity_hypothesis":
            entity_hypotheses.append(it.snapshot_data)
        elif it.kind == "scale_def":
            scale_defs.append(it.snapshot_data)
        else:
            children.append(it)
    for it in children:
        node = index.get((it.entity_type, it.entity_id))
        if node is None:
            continue
        entry = {"object_key": it.object_key, "data": it.snapshot_data}
        if it.kind in FILE_KINDS:
            entry.update(item_id=getattr(it, "id", None), blob_sha256=it.blob_sha256, blob_size=it.blob_size,
                         file_missing=it.blob_sha256 is None)
        node["children"].setdefault(it.kind, []).append(entry)
    for nodes in entities.values():
        nodes.sort(key=lambda n: n["entity_id"])
    results.sort(key=lambda n: n["entity_id"])
    trashed.sort(key=lambda t: (t["entity_type"], t["entity_id"]))
    return {"lab": lab_block, "entities": entities, "results": results, "links": links,
            "entity_hypotheses": entity_hypotheses, "scale_defs": scale_defs, "trashed": trashed}


blob_path = _blob_path  # публичное имя: API скачивания и чистка блобов


def sha256_file(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def download_name(item) -> str:
    """Имя файла для скачивания: оригинальное имя вложения; у картинок на диске uuid, поэтому имя по id."""
    data = item.snapshot_data
    if item.kind == "attachment" and data.get("filename"):
        return data["filename"]
    ext = os.path.splitext(data.get("filename") or "")[1]
    return f"{item.kind}-{data.get('id')}{ext}"
