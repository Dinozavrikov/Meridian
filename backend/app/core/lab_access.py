"""Проверка доступа к сущностям, которые могут быть привязаны к лабе (lab_id):
владелец сущности видит/редактирует всегда; участник лабы — видит,
владелец/админ лабы — редактирует (добавляет гипотезы, источники, шкалы)."""
from typing import Literal, Optional

from fastapi import HTTPException
from sqlalchemy import select, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.social import LabMember
from sqlalchemy import true, false
from sqlalchemy.orm import aliased
from app.core.entity_registry import ENTITY_MODELS
from app.models.mixins import is_soft_deletable
from app.core.prediction_status import CLOSED_PREDICTION_STATUSES


def visibility_from_lab(lab_is_public: bool) -> str:
    """Видимость сущности, привязанной к лабе, полностью определяется публичностью
    лабы, а не собственным полем visibility — оно больше не задаётся вручную,
    пока сущность привязана к лабе (см. labs.py create_lab, tasks.py create/update_task)."""
    return "public" if lab_is_public else "lab"


async def _lab_role(db: AsyncSession, lab_id: int, user_id: int) -> str | None:
    m = await db.scalar(select(LabMember).where(LabMember.lab_id == lab_id, LabMember.user_id == user_id))
    return m.role if m else None


async def resolve_lab_attachment(db: AsyncSession, lab_id: int | None, requested_visibility: str, user_id: int) -> str:
    """Единая точка входа для полей lab_id/visibility при create/update сущности.
    Без lab_id — пользователь свободно выбирает visibility. С lab_id — лаба должна
    существовать, пользователь обязан быть её участником, а видимость выводится
    из lab.is_public (visibility_from_lab); requested_visibility в этом случае игнорируется."""
    if not lab_id:
        return requested_visibility
    from app.models.social import Lab
    lab = await db.get(Lab, lab_id)
    if not lab:
        raise HTTPException(404, "Лаборатория не найдена")
    if not await _lab_role(db, lab_id, user_id):
        raise HTTPException(403, "Вы не участник этой лаборатории")
    return visibility_from_lab(lab.is_public)


async def get_entity_for_view(db: AsyncSession, model, entity_id: int, user_id: int | None,
                               *, hide_as_404: bool = False, include_deleted: bool = False):
    """Владелец сущности, ИЛИ участник лабы, ИЛИ кто угодно — если сущность публична.
    user_id=None — гость: доступна только public-ветка ниже, свои записи и
    участие в лабе для гостя в принципе не имеют смысла.

    hide_as_404: по умолчанию недоступная сущность даёт 403 (палит факт
    существования, но не даёт доступ — так везде в проекте, осознанно, см.
    ACCESS_POLICY.md). Отдельные фичи (обсуждения в comments.py) намеренно
    не хотят подтверждать даже факт существования — для них hide_as_404=True
    превращает тот же 403 в 404. Логика проверки одна и та же в обоих
    случаях — различается только код ответа на отказ."""
    obj = await db.get(model, entity_id)
    if not obj or _hidden_as_deleted(obj, user_id, include_deleted):
        raise HTTPException(404, "Не найдено")
    if user_id is not None and obj.user_id == user_id:
        return obj
    if getattr(obj, "visibility", None) == "public":
        return obj
    if (
        user_id is not None
        and getattr(obj, "lab_id", None)
        and getattr(obj, "visibility", "lab") == "lab"
        and await _lab_role(db, obj.lab_id, user_id)
    ):
        return obj
    raise HTTPException(404 if hide_as_404 else 403, "Не найдено" if hide_as_404 else "Нет доступа")


async def get_entity_for_lab_manage(db: AsyncSession, model, entity_id: int, user_id: int,
                                    *, include_deleted: bool = False):
    """Владелец сущности ИЛИ владелец/админ лабы — может выполнять
    ОРГАНИЗАЦИОННЫЕ операции: привязка/отвязка гипотез, управление шкалами,
    expectations. НЕ даёт права редактировать содержимое самой сущности
    (текст, поля) — контент неприкосновенен для автора, даже для lab
    admin/owner. Это осознанное ограничение (документ п.8): лаборатория
    как контур организации исследования, не как право переписывать чужие
    записи — важно и для будущей федерации лабораторий, где чужой инстанс
    не сможет разрешить внешнему admin править содержимое."""
    obj = await db.get(model, entity_id)
    if not obj or _hidden_as_deleted(obj, user_id, include_deleted):
        raise HTTPException(404, "Не найдено")
    if obj.user_id == user_id:
        return obj
    if getattr(obj, "lab_id", None):
        role = await _lab_role(db, obj.lab_id, user_id)
        if role in ("owner", "admin"):
            return obj
    raise HTTPException(403, "Недостаточно прав — нужна роль администратора лабы")


def entity_visibility_filter(model, user_id: int | None,
                              *, requested: set[str] | None = None, lab_id: int | None = None,
                              include_deleted: bool = False):
    """Условие для списков сущностей: собственные записи (любой видимости),
    ИЛИ публичные записи любого пользователя, ИЛИ записи, привязанные к лабе,
    где пользователь состоит И которые отданы лаборатории (visibility=='lab'; приватная
    запись с lab_id не в счёт, публичная с lab_id идёт по ветке public).
    user_id=None — гость: видит только публичные записи.

    requested/lab_id — доп. сужение для страниц статистики (users.py):
    requested ограничивает набор уровней видимости (например, только
    {"public"}); lab_id сужает лаб-ветку до конкретной лабы, не трогая
    private/public строки. Раньше это была отдельная копия той же логики
    в users.py::_visibility_filter — базовое условие (own/public/lab-
    членство) там было тождественно этому; сведено в одну функцию."""
    if user_id is None:
        base = model.visibility == "public"
    else:
        member_lab_ids = select(LabMember.lab_id).where(LabMember.user_id == user_id)
        base = or_(
            model.user_id == user_id,
            model.visibility == "public",
            # через лабораторию видно только то, что отдано лаборатории; приватная запись с lab_id не в счёт
            and_(model.visibility == "lab", model.lab_id.in_(member_lab_ids)),
        )
    if requested:
        base = and_(base, model.visibility.in_(requested))
    if lab_id:
        base = and_(base, or_(model.visibility != "lab", model.lab_id == lab_id))
    if is_soft_deletable(model) and not include_deleted:  # include_deleted — только для калибровки
        base = and_(base, model.deleted_at.is_(None))
    return base


async def can_link(db: AsyncSession, model, entity_id: int, user_id: int):
    """Единая политика для операции LINK (документ, п.10 / п.16.2 —
    EntityAccessPolicy): создавая связь на чужую сущность (EntityHypothesis,
    Prediction.hypothesis_id, graph Link и т.п.), инициатор обязан видеть
    целевую сущность — линк трактуется как осознанная публикация связи,
    а не приватный внутренний указатель.

    Отдельной операции CONTRIBUTE намеренно нет (была get_entity_for_contribute,
    удалена — неиспользуемый мёртвый код): "добавить вклад в чужую сущность"
    уже реализуется этим же паттерном — своя сущность + can_link, без мутации
    чужих данных. Это осознанный архитектурный выбор под будущую федерацию
    лабораторий: каждый инстанс пишет только свои сущности, линк — просто
    ссылка, без distributed write conflicts. Настоящее совместное редактирование
    одной записи (не через линк) — отдельная, пока не начатая задача.

    can_edit/can_attach остаются в get_entity_for_lab_manage/
    resolve_lab_attachment до отдельного решения по остальным клеткам."""
    return await get_entity_for_view(db, model, entity_id, user_id)


# ── Soft-delete ──────────────────────────────────────────────────────────
# Запись в корзине (deleted_at IS NOT NULL) для всех, кроме владельца, не
# существует — 404, а не 403 (не подтверждаем даже факт существования). Сам
# владелец видит её только при явном include_deleted=True (restore/permanent).

def _is_deleted(obj) -> bool:
    return getattr(obj, "deleted_at", None) is not None


def _hidden_as_deleted(obj, user_id: int | None, include_deleted: bool) -> bool:
    """True — запись надо отдать как 404."""
    if not _is_deleted(obj):
        return False
    return not (include_deleted and user_id is not None and obj.user_id == user_id)


async def get_live(db: AsyncSession, model, entity_id: int):
    """db.get(), который не возвращает soft-deleted запись (None вместо неё).
    Для мест, где раньше было `obj = await db.get(Model, id); if not obj: ...` —
    без проверки прав, только «жива ли»."""
    obj = await db.get(model, entity_id)
    if obj is not None and _is_deleted(obj):
        return None
    return obj


def parent_alive_subquery(entity_type, entity_id_col):
    """Условие для .where(): у полиморфного родителя (entity_type, entity_id)
    НЕТ soft-deleted записи. Использовать везде, где EntityComment/EntityTag/
    EntityImage/EntityAttachment/SourceDocument/EntityStage/... читаются по
    entity_type/entity_id, чтобы дети мёртвой сущности не были доступны в
    обход неё. Дети не помечаются и не трогаются — скрываются только здесь.

    entity_type — колонка (EntityComment.entity_type) или строка; entity_id_col —
    колонка. Работает и для Link: parent_alive_subquery(Link.from_type, Link.from_id).
    Семантика именно «нет мёртвого родителя», а не «есть живой»: дети родителей
    вне ENTITY_MODELS (Lab у EntityStage) и уже осиротевшие строки не пропадают
    из выдачи молча. Родитель берётся через aliased() — иначе при внешнем join
    на ту же модель подзапрос теряет FROM по auto-correlation и падает."""
    def _dead(model):
        p = aliased(model)
        return select(p.id).where(p.id == entity_id_col, p.deleted_at.is_not(None)).exists()

    if isinstance(entity_type, str):
        model = ENTITY_MODELS.get(entity_type)
        return true() if model is None else ~_dead(model)
    return ~or_(*[and_(entity_type == etype, _dead(model)) for etype, model in ENTITY_MODELS.items()])


def links_alive():
    """Условие для .where() по Link: ни одна из сторон (from/to) не в корзине.
    Так графы/подсчёты/сервисы не показывают связи с мёртвой записью и не
    оставляют висячих рёбер. Сами Link не трогаются — при restore связи
    возвращаются вместе с записью."""
    from app.models.entities import Link
    return and_(parent_alive_subquery(Link.from_type, Link.from_id),
                parent_alive_subquery(Link.to_type, Link.to_id))


def not_deleted(model):
    """model.deleted_at IS NULL для soft-deletable моделей, true() для остальных
    (Result и др. deleted_at не имеют): для generic-кода, который не знает наперёд,
    какая модель ему придёт."""
    return model.deleted_at.is_(None) if is_soft_deletable(model) else true()


async def trashed_ids(db: AsyncSession, model, ids) -> set[int]:
    """Какие из ids лежат в корзине — чтобы не рисовать рёбра/ссылки на мёртвую запись."""
    ids = {i for i in ids if i is not None}
    if not ids:
        return set()
    return set((await db.execute(
        select(model.id).where(model.id.in_(ids), model.deleted_at.is_not(None))
    )).scalars().all())


def links_alive_sql(alias: str = "l") -> str:
    """То же, что links_alive(), но SQL-фрагментом — для сырых text()-запросов (дашборд):
    ни одна из сторон связи не лежит в корзине. Строится по ENTITY_MODELS, а не списком
    таблиц вручную. Значения — из реестра, не пользовательский ввод."""
    parts = []
    for etype, model in ENTITY_MODELS.items():
        for side in ("from", "to"):
            parts.append(
                f"({alias}.{side}_type = '{etype}' AND EXISTS "
                f"(SELECT 1 FROM {model.__tablename__} x WHERE x.id = {alias}.{side}_id AND x.deleted_at IS NOT NULL))"
            )
    return "NOT (" + " OR ".join(parts) + ")"


def can_undo(obj, user_id: int | None) -> bool:
    """Право откатывать правки полей записи (services/undo.py). Сейчас — только автор:
    контент 6 базовых типов редактирует один владелец (PUT везде фильтрует user_id ==
    user.id, docstring get_entity_for_lab_manage запрещает админу лабы править чужое
    содержимое). Единая точка — при появлении совместного редактирования меняется
    одно место, а не каждый эндпоинт."""
    return user_id is not None and getattr(obj, "user_id", None) == user_id


async def visible_results_stmt(db: AsyncSession, user_id: int | None, lab_id: int | None = None):
    """Единый запрос «какие Result видит этот зритель» (участник — всё в лабе,
    остальные — по правилам публикации, см. docstring results.py). Его используют
    и список GET /results, и счётчик results_count в GET /labs/{id}: так бейдж на
    вкладке физически не может разойтись со списком."""
    from app.models.entities import Result
    from app.models.social import Lab
    published_in_public_lab = and_(
        Result.is_published == True,
        Result.visibility == "lab",
        Result.lab_id.in_(select(Lab.id).where(Lab.is_public == True)),
    )
    # Те же правила, что у get_result/get_entity_for_view: своё, публичное, «лабораторное» для участника,
    # опубликованное в публичной лаборатории. lab_id у результата заполнен всегда, поэтому одного членства
    # недостаточно (так показывались чужие приватные черновики), а связи (reachable) результат не публикуют.
    visible = [published_in_public_lab, Result.visibility == "public"]
    if user_id is not None:
        member_lab_ids = select(LabMember.lab_id).where(LabMember.user_id == user_id)
        visible += [Result.user_id == user_id, and_(Result.visibility == "lab", Result.lab_id.in_(member_lab_ids))]
    stmt = select(Result).where(or_(*visible))
    if lab_id is not None:
        stmt = stmt.where(Result.lab_id == lab_id)
    return stmt


# ── Открытие записи через связь ──────────────────────────────────────────
# Только ЧТЕНИЕ. can_link и все операции записи по-прежнему идут через строгий get_entity_for_view.
def _edges_subquery():
    """Все рёбра «запись A связана с записью B» от трёх источников (в обе стороны) с автором ребра:
    Link (автор Link.user_id), прогноз<->гипотеза (автор = владелец прогноза), EntityHypothesis (автора нет: NULL)."""
    from sqlalchemy import Integer, cast, literal_column, null, union_all
    from app.models.entities import EntityHypothesis, Link, Prediction
    HYP, PRED = literal_column("'hypothesis'"), literal_column("'prediction'")
    def edge(at, ai, bt, bi, au):
        return select(at.label("a_type"), ai.label("a_id"), bt.label("b_type"), bi.label("b_id"), au.label("author"))
    no_author = cast(null(), Integer)
    parts = [
        edge(Link.from_type, Link.from_id, Link.to_type, Link.to_id, Link.user_id),
        edge(Link.to_type, Link.to_id, Link.from_type, Link.from_id, Link.user_id),
        edge(PRED, Prediction.id, HYP, Prediction.hypothesis_id, Prediction.user_id).where(
            Prediction.hypothesis_id.is_not(None), Prediction.deleted_at.is_(None)),
        edge(HYP, Prediction.hypothesis_id, PRED, Prediction.id, Prediction.user_id).where(
            Prediction.hypothesis_id.is_not(None), Prediction.deleted_at.is_(None)),
        edge(EntityHypothesis.parent_type, EntityHypothesis.parent_id, HYP, EntityHypothesis.hypothesis_id, no_author),
        edge(HYP, EntityHypothesis.hypothesis_id, EntityHypothesis.parent_type, EntityHypothesis.parent_id, no_author),
    ]
    return union_all(*parts).subquery()


def open_triples_query(model, entity_type: str):
    """Тройки (id записи N, лаборатория, тип R, id R, владелец N), для которых связь по правилу открывала бы N участникам
    лаборатории (без учёта согласия и зрителя). Единый источник и для условия чтения, и для бэкфилла согласий."""
    from sqlalchemy import literal_column, union_all
    e = _edges_subquery()
    n = aliased(model)
    owner_m = aliased(LabMember)
    parts = []
    for rtype, rmodel in ENTITY_MODELS.items():
        r = aliased(rmodel)
        parts.append(
            select(n.id.label("n_id"), r.lab_id.label("lab_id"), literal_column(f"'{rtype}'").label("via_type"),
                   r.id.label("via_id"), n.user_id.label("owner"))
            .select_from(e)
            .join(n, n.id == e.c.a_id)
            .join(r, r.id == e.c.b_id)
            .join(owner_m, and_(owner_m.lab_id == r.lab_id, owner_m.user_id == n.user_id))   # владелец N состоит в лаборатории R
            .where(e.c.a_type == entity_type, e.c.b_type == rtype, r.visibility == "lab",
                   r.deleted_at.is_(None), n.deleted_at.is_(None),
                   or_(e.c.author == n.user_id, and_(e.c.author.is_(None), r.user_id == n.user_id)))
        )
    return union_all(*parts)


def opened_via_link_condition(model, entity_type: str, user_id: int, lab_id: int | None = None):
    """SQL-условие «запись открыта зрителю через связь»: правило open_triples_query (живая связь, автор связи = владелец N,
    R отдана лаборатории, владелец N в ней состоит, ни N, ни R не в корзине) И строка согласия record_shares И зритель
    состоит в лаборатории. Согласие нужно, чтобы смена видимости соседней записи или вступление автора в лабораторию
    ничего не открывали молча. R обязана быть лабораторной сама, поэтому дальше одного шага это не течёт.
    Удалили связь, и доступ исчез без пересчёта."""
    from app.models.entities import RecordShare
    t = open_triples_query(model, entity_type).subquery()
    sh, me = aliased(RecordShare), aliased(LabMember)
    inner = (select(t.c.n_id).select_from(t)
             .join(sh, and_(sh.entity_type == entity_type, sh.entity_id == t.c.n_id, sh.lab_id == t.c.lab_id,
                            sh.via_type == t.c.via_type, sh.via_id == t.c.via_id))
             .join(me, and_(me.lab_id == t.c.lab_id, me.user_id == user_id)))
    if lab_id is not None:   # только записи, открытые именно этой лаборатории
        inner = inner.where(t.c.lab_id == lab_id)
    return and_(not_deleted(model), model.id.in_(inner))


def lab_scope_condition(model, entity_type: str, user_id: int | None, lab_id: int, include_opened: bool = False):
    """Сужение списка по лаборатории.
    include_opened=False: строго model.lab_id == lab_id.
    include_opened=True (при user_id не None): + записи, открытые именно этой лабе через связь
    (record_shares + зритель — участник); чужие лабы не протекают, потому что внутри
    opened_via_link_condition — t.c.lab_id == lab_id. user_id=None (гость) — strict."""
    strict = model.lab_id == lab_id
    if not include_opened or user_id is None:
        return strict
    return or_(strict, opened_via_link_condition(model, entity_type, user_id, lab_id=lab_id))


async def can_read_via_link(db: AsyncSession, model, entity_id: int, user_id: int | None) -> bool:
    etype = next((t for t, m in ENTITY_MODELS.items() if m is model), None)
    if etype is None or user_id is None:
        return False
    row = await db.scalar(select(model.id).where(model.id == entity_id, opened_via_link_condition(model, etype, user_id)))
    return row is not None


async def get_entity_for_read(db: AsyncSession, model, entity_id: int, user_id: int | None, *, hide_as_404: bool = False):
    """get_entity_for_view + запись, открытая через связь. Только для эндпоинтов ЧТЕНИЯ: для записи и can_link
    остаётся строгий get_entity_for_view (открытие не даёт прав на запись)."""
    try:
        return await get_entity_for_view(db, model, entity_id, user_id, hide_as_404=hide_as_404)
    except HTTPException as e:
        if e.status_code in (403, 404) and user_id is not None and await can_read_via_link(db, model, entity_id, user_id):
            return await db.get(model, entity_id)
        raise


def opened_via_link_or_never(model, entity_type: str, user_id: int | None):
    """Для списков: условие «открыта через связь»; гостю (user_id=None) не открывается ничего."""
    return opened_via_link_condition(model, entity_type, user_id) if user_id is not None else false()


# ── Согласие на открытие записи лаборатории ──────────────────────────────
ShareChoice = Optional[Literal["me", "lab", "public"]]


def _share_options(n_type: str, n, r_is_public: bool) -> list[str]:
    """Кому можно показать приватную запись N, связанную с лабораторной R: me — никому (связь видит только автор);
    lab — участникам закрытой лаборатории через связь (record_shares); public — всем, если лаборатория публичная
    (запись становится публичной, lab_id пуст). Закрытому прогнозу видимость менять нельзя: его вклад уже в сигнале."""
    from app.core.prediction_status import CLOSED_PREDICTION_STATUSES
    if not r_is_public:
        return ["me", "lab"]
    if n_type == "prediction" and getattr(n, "status", None) in CLOSED_PREDICTION_STATUSES:
        return ["me"]
    return ["me", "public"]


def _title_of(obj) -> str:
    return (getattr(obj, "title", None) or getattr(obj, "name", None) or (getattr(obj, "belief", "") or "")[:80] or "")[:120]


async def publication_impact(db: AsyncSession, a, b, author_id: int | None, *, same_owner_only: bool = False) -> list[dict]:
    """Что откроет связь между a и b = (тип, запись): те же условия, что в opened_via_link_condition, но для ОДНОЙ новой связи.
    Запись N открывается, если R лабораторная, владелец N состоит в этой лаборатории, N ей ещё не видна, и автор связи =
    владелец N (same_owner_only: у связи нет автора, EntityHypothesis; тогда нужен один владелец у обеих сторон).
    Пусто = ничего не открывается, согласие не нужно. Записи могут быть ещё не сохранены (нужны только user_id/visibility/lab_id)."""
    from sqlalchemy import func
    from app.models.social import Lab
    out: list[dict] = []
    for (n_type, n), (r_type, r) in ((a, b), (b, a)):
        if n is None or r is None:
            continue
        if getattr(n, "deleted_at", None) is not None or getattr(r, "deleted_at", None) is not None:
            continue
        if r.visibility not in ("lab", "public") or not r.lab_id:
            continue
        if same_owner_only:
            if n.user_id != r.user_id:
                continue
        elif n.user_id != author_id:
            continue
        if n.visibility == "public" or (n.visibility == "lab" and n.lab_id == r.lab_id):
            continue
        lab = await db.get(Lab, r.lab_id)
        # Не участник может помочь публичной лаборатории: записи R он видит, и ему можно выбрать «Всем» (без lab_id, без сигнала).
        # Закрытая лаборатория для постороннего недоступна вовсе (can_link не пустит).
        if await _lab_role(db, r.lab_id, n.user_id) is None and not (r.visibility == "public" and lab and lab.is_public):
            continue
        members = await db.scalar(select(func.count()).select_from(LabMember).where(LabMember.lab_id == r.lab_id))
        out.append({"entity_type": n_type, "entity_id": getattr(n, "id", None), "title": _title_of(n), "owner_id": n.user_id,
                    "lab_id": r.lab_id, "lab_name": lab.name if lab else "", "lab_is_public": bool(lab and lab.is_public),
                    "open_join": bool(lab and lab.open_join), "members": members or 0,
                    "options": _share_options(n_type, n, r.visibility == "public"),
                    "via_type": r_type, "via_id": getattr(r, "id", None), "via_title": _title_of(r)})
    return out


def ensure_prediction_visibility_not_frozen(pred, new_visibility, new_lab_id) -> None:
    """У закрытого прогноза лаборатория и видимость заморожены: вклад в сигнал лаборатории считается по lab_id,
    вынос из лаборатории или смена видимости стёрли бы его (track record не «улучшить»). Единая проверка для
    PUT /predictions/{id} и PUT /{type}/{id}/visibility."""
    if pred.status in CLOSED_PREDICTION_STATUSES and (new_lab_id != pred.lab_id or new_visibility != pred.visibility):
        raise HTTPException(400, "Нельзя менять лабораторию и видимость закрытого прогноза: его вклад уже учтён в сигнале лаборатории")


async def require_publication_consent(db: AsyncSession, a, b, author_id: int | None, share: ShareChoice, *, same_owner_only: bool = False):
    """Точка входа для каждой операции, которая может раскрыть приватную запись, связанную с записью лаборатории.
    Есть что раскрывать, а share не выбран: 409 needs_consent (в impacts у каждой записи options: me / lab / public).
    Открывала бы запись не её владелец (админ лаборатории привязал чужое): 403. share вне options: 400.
    me: связь без раскрытия. lab: вернёт impacts для grant_publication (чтение участникам через связь).
    public: запись становится публичной в той же транзакции (lab_id остаётся пустым), grant не нужен.
    Если раскрыть можно только «никому» (закрытый прогноз в публичной лаборатории), спрашивать не о чем."""
    impacts = await publication_impact(db, a, b, author_id, same_owner_only=same_owner_only)
    if not impacts:
        return impacts
    if any(i["owner_id"] != author_id for i in impacts):
        raise HTTPException(403, "Открыть запись лаборатории может только её владелец")
    asking = [i for i in impacts if i["options"] != ["me"]]
    if not asking:
        return []
    if share is None:
        raise HTTPException(409, detail={"code": "needs_consent", "impacts": asking})
    if any(share not in i["options"] for i in asking):
        raise HTTPException(400, f"Вариант «{share}» недоступен для этой связи")
    if share == "me":
        return []
    if share == "public":
        for i in asking:
            for t, obj in (a, b):
                if obj is not None and t == i["entity_type"] and getattr(obj, "id", None) == i["entity_id"]:
                    obj.visibility = "public"
        return []
    return asking


async def grant_publication(db: AsyncSession, impacts: list[dict], author_id: int, new_id: int | None = None) -> None:
    """Записывает согласие (record_shares) для того, что require_publication_consent разрешил открыть.
    Вызывать после того, как у записи есть id (new_id: id только что созданной записи). Не коммитит."""
    from app.models.entities import RecordShare
    for i in impacts:
        eid = i["entity_id"] or new_id
        vid = i["via_id"] or new_id
        if eid is None or vid is None:
            continue
        if await db.scalar(select(RecordShare.id).where(
                RecordShare.entity_type == i["entity_type"], RecordShare.entity_id == eid, RecordShare.lab_id == i["lab_id"],
                RecordShare.via_type == i["via_type"], RecordShare.via_id == vid)) is None:
            db.add(RecordShare(entity_type=i["entity_type"], entity_id=eid, lab_id=i["lab_id"],
                               via_type=i["via_type"], via_id=vid, granted_by=author_id))


async def revoke_shares(db: AsyncSession, a: tuple[str, int], b: tuple[str, int]) -> None:
    """Связь между a и b исчезла: согласие на открытие через неё снимается (в обе стороны). Не коммитит.
    Если между парой осталась другая связь, запись закроется до нового согласия: безопасное направление."""
    from sqlalchemy import delete
    from app.models.entities import RecordShare as RS
    (at, ai), (bt, bi) = a, b
    await db.execute(delete(RS).where(or_(
        and_(RS.entity_type == at, RS.entity_id == ai, RS.via_type == bt, RS.via_id == bi),
        and_(RS.entity_type == bt, RS.entity_id == bi, RS.via_type == at, RS.via_id == ai))))


async def reset_shares_on_visibility_change(db: AsyncSession, entity_type: str, obj, new_visibility: str,
                                            new_lab_id: int | None, *, actor_id: int,
                                            reverts_event_id: int | None = None) -> None:
    """Видимость или лаборатория записи меняются: согласия record_shares, выданные для прежнего состояния, снимаются
    (возврат в private не воскрешает доступ). Вызывать ДО присваивания новых значений. Не коммитит.
    Пишет событие visibility_changed (только db.add, без flush: иначе автосброс разрежет изменения на два события updated —
    см. test_update_single_event). Оно поднимает запись в ленте-группах при публикации и несёт видимость НОВОГО состояния;
    при переходе в private оно приватное и без lab_id (как share_closed) — факт сокрытия не светится."""
    if (new_visibility, new_lab_id) == (obj.visibility, obj.lab_id):
        return
    from sqlalchemy import delete
    from app.models.entities import RecordShare
    await db.execute(delete(RecordShare).where(RecordShare.entity_type == entity_type, RecordShare.entity_id == obj.id))
    from app.services.events import emit_event
    await emit_event(
        db, type="visibility_changed", actor_id=actor_id, entity_type=entity_type, entity_id=obj.id,
        lab_id=None if new_visibility == "private" else new_lab_id, visibility=new_visibility,
        meta={"old_visibility": obj.visibility, "new_visibility": new_visibility,
              "old_lab_id": obj.lab_id, "new_lab_id": new_lab_id,
              **({"reverts_event_id": reverts_event_id} if reverts_event_id is not None else {})},
    )
