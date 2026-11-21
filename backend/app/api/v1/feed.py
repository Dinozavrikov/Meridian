from app.schemas._strict import StrictIn, Short16, Short32, Short255, LongText
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, and_, func, desc
from sqlalchemy.orm import aliased
from app.core.prediction_status import CLOSED_PREDICTION_STATUSES
from app.db.session import get_db
from app.models.entities import Observation, Hypothesis, Question, Prediction, Worldview, Link, Event, EntityHypothesis, EntityTag, Tag
from app.services.html_truncate import truncate_html
from app.services.feed_groups import Edge, Node, build_groups, star_around
from app.models.social import EntityComment
from app.models.social import Lab, LabMember, HypothesisPost, PostComment, ObservationPost, Repost
from app.models.user import User
from app.core.deps import get_current_user, get_current_user_optional
from app.services.repost import ENTITY_MODELS, extract_content, build_entity, compose_repost_body, split_comment_content
from app.core.lab_access import get_live, links_alive, parent_alive_subquery, get_entity_for_view
from app.core.personal_notes import personal_comment_ids
from app.services.events import emit_event
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
from collections import defaultdict, Counter
from math import ceil

router = APIRouter(prefix="/feed", tags=["feed"])


NOTES_PER_CARD = 3   # заметок к наблюдению на карточке; остальные — по note_count


class FeedNoteOut(BaseModel):
    """Заметка (блог-пост) к наблюдению. Видимость наследует от наблюдения: видна там и тогда, где видно его."""
    id: int
    title: str
    preview: str            # начало текста (HTML из редактора — фронт чистит теги)
    author_username: str
    author_display: str
    created_at: datetime


class FeedItem(BaseModel):
    id: int           # id записи (совпадает с entity_id)
    entity_id: int     # id самой сущности — для ссылок/репоста/связей (раньше это было единственным id)
    type: str        # observation | hypothesis | prediction | worldview | question | obs_post
    title: str
    preview: str
    author_username: str
    author_display: str
    author_avatar_url: Optional[str] = None
    visibility: str
    created_at: datetime
    lab_id: Optional[int] = None
    status: Optional[str] = None
    # число комментариев к записи (EntityComment)
    comment_count: int = 0
    # только для прогнозов — дата ожидаемой проверки (для VerifyTrack)
    expected_check_date: Optional[str] = None
    # реальный источник для кнопки «Репост» (для obs_post — вложенное наблюдение)
    repost_source_type: Optional[str] = None
    repost_source_id: Optional[int] = None
    # если запись создана репостом — атрибуция источника
    repost_of: Optional[dict] = None
    # только карточки-группы (/feed/groups/*): заметки к наблюдению
    note_count: int = 0
    notes: list[FeedNoteOut] = []


class PostIn(StrictIn):
    title: Short255 = ""
    content: LongText


class PostOut(BaseModel):
    id: int
    hypothesis_id: int
    author_id: int
    author_username: str
    author_display: str
    author_avatar_url: Optional[str] = None
    title: str
    content: str
    created_at: datetime
    model_config = {"from_attributes": True}


class ObsPostOut(BaseModel):
    id: int
    observation_id: int
    author_id: int
    author_username: str
    author_display: str
    author_avatar_url: Optional[str] = None
    title: str
    content: str
    created_at: datetime
    model_config = {"from_attributes": True}


class CommentIn(StrictIn):
    content: LongText


class CommentOut(BaseModel):
    id: int
    post_id: int
    author_id: int
    author_username: str
    author_display: str
    author_avatar_url: Optional[str] = None
    content: str
    created_at: datetime
    model_config = {"from_attributes": True}


async def _enrich(items, entity_type: str, db: AsyncSession) -> list[FeedItem]:
    result = []
    for item in items:
        user = await db.get(User, item.user_id)
        if not user:
            continue
        title = getattr(item, "title", None) or getattr(item, "name", None) or getattr(item, "belief", "")
        text  = getattr(item, "text", None) or getattr(item, "description", "") or ""
        fi = FeedItem(
            id=item.id, entity_id=item.id, type=entity_type,
            title=title[:128], preview=truncate_html(text, 256),
            author_username=user.username, author_display=user.display_name,
            author_avatar_url=user.avatar_url,
            visibility=item.visibility, created_at=item.created_at,
            lab_id=item.lab_id, status=getattr(item, "status", None),
        )
        fi.repost_source_type = entity_type
        fi.repost_source_id = item.id
        if entity_type == "prediction":
            fi.expected_check_date = getattr(item, "expected_check_date", None) or None
        result.append(fi)
    return result


async def _attach_comment_counts(items: list[FeedItem], db: AsyncSession) -> None:
    """Число комментариев ОБСУЖДЕНИЯ: личные заметки владельца (app.core.personal_notes) не считаются."""
    by_type: dict[str, set[int]] = defaultdict(set)
    for i in items:
        by_type[i.type].add(i.entity_id)
    if not by_type:
        return
    owners: dict[tuple[str, int], int] = {}
    for t, ids in by_type.items():
        model = ENTITY_MODELS.get(t)
        if model is not None:
            for eid, uid in (await db.execute(
                    select(model.id, model.user_id).where(model.id.in_(ids), model.deleted_at.is_(None))
                )).all():
                owners[(t, eid)] = uid
    conditions = [and_(EntityComment.entity_type == t, EntityComment.entity_id.in_(ids)) for t, ids in by_type.items()]
    grouped: dict[tuple[str, int], list[tuple]] = defaultdict(list)
    for cid, t, eid, author_id, parent_id, stance in (await db.execute(
        select(EntityComment.id, EntityComment.entity_type, EntityComment.entity_id,
               EntityComment.author_id, EntityComment.parent_id, EntityComment.stance).where(or_(*conditions))
    )).all():
        grouped[(t, eid)].append((cid, author_id, parent_id, stance))
    counts = {k: len(v) - len(personal_comment_ids(v, owners.get(k))) for k, v in grouped.items()}
    for item in items:
        item.comment_count = counts.get((item.type, item.entity_id), 0)


async def _attach_repost_info(items: list[FeedItem], db: AsyncSession) -> None:
    """Помечает элементы ленты, созданные репостом, атрибуцией источника + цитатой оригинала.
    Batch-запросы: один SELECT на всех авторов, один на все источники (по типам)."""
    ids_by_type: dict[str, set[int]] = defaultdict(set)
    for i in items:
        ids_by_type[i.type].add(i.entity_id)
    if not ids_by_type:
        return
    conditions = [and_(Repost.new_type == t, Repost.new_id.in_(ids)) for t, ids in ids_by_type.items()]
    reposts = (await db.execute(select(Repost).where(or_(*conditions)))).scalars().all()
    if not reposts:
        return

    by_new = {(r.new_type, r.new_id): r for r in reposts}

    # Batch: все авторы за один запрос
    author_ids = {r.source_author_id for r in reposts if r.source_author_id}
    authors = {}
    if author_ids:
        rows = (await db.execute(select(User).where(User.id.in_(author_ids)))).scalars().all()
        authors = {u.id: u for u in rows}

    # Batch: все источники по типам за один запрос на тип
    source_ids_by_type: dict[str, set[int]] = defaultdict(set)
    for r in reposts:
        if r.source_type in ENTITY_MODELS:
            source_ids_by_type[r.source_type].add(r.source_id)
    sources: dict[tuple[str, int], object] = {}
    for stype, sids in source_ids_by_type.items():
        model = ENTITY_MODELS[stype]
        rows = (await db.execute(select(model).where(model.id.in_(sids), model.deleted_at.is_(None)))).scalars().all()
        for obj in rows:
            sources[(stype, obj.id)] = obj

    for item in items:
        r = by_new.get((item.type, item.entity_id))
        if not r:
            continue
        author = authors.get(r.source_author_id)
        info = {
            "source_type": r.source_type,
            "source_id": r.source_id,
            "source_author": author.display_name if author else "неизвестный автор",
            "comment": r.comment,
        }
        source_obj = sources.get((r.source_type, r.source_id))
        if source_obj:
            content = extract_content(r.source_type, source_obj)
            info["source_title"] = content["title"][:120]
            info["source_preview"] = content["text"][:200]
        item.repost_of = info


# Whitelist типов событий, которые считаются активностью записи в ленте.
# "updated"/"deleted" (ORM-audit-log для будущего version control,
# см. Event Log — Шаг 1) НИКОГДА не должны просочиться в выдачу —
# это техническая правка, а не действие для показа пользователю.
# Явно перечислено, а не NOT IN, чтобы будущий новый тип события
# по умолчанию НЕ показывался в ленте, пока кто-то сознательно не
# добавит его сюда.
FEED_EVENT_TYPES = {"created", "linked", "competing_hypothesis", "status_changed", "repost"}
# Лента-группы (/feed/groups/*) считает активностью записи и эти события: они поднимают карточку (публикация),
# но сами карточек не рождают: карточка строится из записи.
GROUP_ACTIVITY_EVENT_TYPES = FEED_EVENT_TYPES | {"visibility_changed"}


def _events_alive():
    """Событие ленты показывается, только если ни сама запись, ни связанная (related_*)
    не лежат в корзине. Фильтр на уровне SQL по events, а не пост-фильтр после догрузки
    сущностей: иначе total, страницы и счётчики вкладок считали бы события мёртвых записей,
    а в ленте появлялись бы «дыры». soft_deleted/restored в FEED_EVENT_TYPES не входят."""
    return and_(
        parent_alive_subquery(Event.entity_type, Event.entity_id),
        or_(Event.related_type.is_(None), parent_alive_subquery(Event.related_type, Event.related_id)),
    )


def _entity_in_scope(entity_type_col, entity_id_col, lab_id, *, allow_public: bool, member: bool = True):
    """Условие для .where(): полиморфная запись (type, id) СЕЙЧАС видна в этой ленте.
    Публичная лента — visibility == public. Лента лабы — запись сейчас в этой лабе и не private
    (приватная запись с lab_id в счёт не идёт); allow_public дополнительно пускает публичные записи
    других лаб — для «связанной» стороны, чьё название публично и так.
    Типы вне ENTITY_MODELS (obs_post и т.п.) условием не отсекаются.
    member=False — зритель не участник лабы: ему видны только публичные записи
    (публичная лаборатория не делает записи публичными)."""
    def _ok(model):
        p = aliased(model)
        if lab_id is None:
            cond = p.visibility == "public"
        elif member:
            cond = and_(p.lab_id == lab_id, p.visibility != "private")
            if allow_public:
                cond = or_(cond, p.visibility == "public")
        else:
            cond = p.visibility == "public"
            if not allow_public:
                cond = and_(cond, p.lab_id == lab_id)
        return select(p.id).where(p.id == entity_id_col, cond).exists()
    return or_(
        ~entity_type_col.in_(list(ENTITY_MODELS)),
        *[and_(entity_type_col == etype, _ok(model)) for etype, model in ENTITY_MODELS.items()],
    )


def _events_current(lab_id: Optional[int], member: bool = True):
    """Событие ленты хранит visibility/lab_id НА МОМЕНТ создания, а название и превью берутся у записи
    в её нынешнем виде. Поэтому после «публичное -> приватное» или выхода из лабы старое событие
    оставалось в ленте (утечка), а удалённая связь оставляла карточку «привязал(а) запись».
    Условие сверяет событие с ТЕКУЩИМ состоянием: сама запись и (если есть) связанная сейчас видны
    в этой ленте, а для linked связь ещё существует. Как и _events_alive — на уровне SQL, иначе
    total, страницы и счётчики вкладок считали бы скрытое."""
    own = _entity_in_scope(Event.entity_type, Event.entity_id, lab_id, allow_public=False, member=member)
    rel = or_(Event.related_type.is_(None),
              _entity_in_scope(Event.related_type, Event.related_id, lab_id, allow_public=True, member=member))
    link_exists = select(Link.id).where(
        or_(
            and_(Link.from_type == Event.entity_type, Link.from_id == Event.entity_id,
                 Link.to_type == Event.related_type, Link.to_id == Event.related_id),
            and_(Link.to_type == Event.entity_type, Link.to_id == Event.entity_id,
                 Link.from_type == Event.related_type, Link.from_id == Event.related_id),
        ),
        links_alive(),
    ).exists()
    return and_(own, rel, or_(Event.type != "linked", link_exists))


def _parse_types(types: Optional[str]) -> Optional[set[str]]:
    if not types:
        return None
    return {t.strip() for t in types.split(",") if t.strip()}


# — Лента карточками-группами: из самих записей, а не из событий —

class FeedGroupMemberOut(BaseModel):
    item: FeedItem
    relation: str                  # тип связи с ядром карточки


class FeedRefOut(BaseModel):
    type: str
    entity_id: int
    title: str
    translatable: bool = False   # в title настоящий заголовок записи (его можно переводить), а не слепок превью
    author_username: str = ""    # свои записи не переводятся — решает фронт по этому полю


class FeedInternalLinkOut(BaseModel):
    a: FeedRefOut
    b: FeedRefOut
    kind: str                      # связь между двумя спутниками карточки (не через ядро)


class FeedGroupOut(BaseModel):
    key: str                       # "hypothesis:12" — ключ ядра, уникален в ленте
    core: FeedItem
    members: list[FeedGroupMemberOut]
    internal: list[FeedInternalLinkOut]
    outside: list[FeedRefOut]         # связано с записями из других карточек
    activity: datetime             # последняя активность в карточке — по ней порядок
    size: int
    topics: list[str]


class TopicCountOut(BaseModel):
    name: str
    count: int


class FeedGroupsPage(BaseModel):
    groups: list[FeedGroupOut]
    page: int
    page_size: int
    total: int
    total_pages: int
    type_counts: dict[str, int] = {}   # число карточек, где есть запись этого типа
    topics: list[TopicCountOut] = []


def _utc(dt: datetime) -> datetime:
    """created_at записей наивный, у events — с часовым поясом: приводим к UTC-aware, иначе сравнение падает."""
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


def _event_scope(lab_id: Optional[int]):
    return Event.lab_id == lab_id if lab_id is not None else Event.visibility == "public"


def _record_item(etype: str, obj, user, *, full: bool = False) -> FeedItem:
    """FeedItem из самой записи (а не из события): видимость и текст — как сейчас."""
    content = extract_content(etype, obj)
    ecd = getattr(obj, "expected_check_date", None)
    return FeedItem(
        id=obj.id, entity_id=obj.id, type=etype,
        title=(content["title"] or "") if full else (content["title"] or "")[:128],
        preview=(content["text"] or "") if full else truncate_html(content["text"] or "", 256),
        author_username=user.username if user else "", author_display=(user.display_name if user else "") or "",
        author_avatar_url=user.avatar_url if user else None,
        visibility=obj.visibility, created_at=_utc(obj.created_at), lab_id=obj.lab_id,
        status=getattr(obj, "status", None),
        expected_check_date=(ecd.isoformat() if hasattr(ecd, "isoformat") else (str(ecd) if ecd else None)),
        repost_source_type=etype, repost_source_id=obj.id,
    )


def _pair_in(ids_by_type: dict[str, set[int]], type_col, id_col):
    return or_(*[and_(type_col == t, id_col.in_(ids)) for t, ids in ids_by_type.items()])


async def _edges_for(db: AsyncSession, ids_by_type: dict[str, set[int]]) -> list[Edge]:
    """Связи ТОЛЬКО между перечисленными записями: через запись вне списка (приватную, чужую) ничего не склеивается.
    Link плюс «конкурирующая гипотеза» (EntityHypothesis: задача/вопрос <-> гипотеза, в links её нет)."""
    if not ids_by_type:
        return []
    edges = [Edge((ft, fi), (tt, ti), lt or "связано") for ft, fi, tt, ti, lt in (await db.execute(
        select(Link.from_type, Link.from_id, Link.to_type, Link.to_id, Link.link_type)
        .where(_pair_in(ids_by_type, Link.from_type, Link.from_id),
               _pair_in(ids_by_type, Link.to_type, Link.to_id), links_alive())
    )).all()]
    hyp_ids = ids_by_type.get("hypothesis")
    if hyp_ids:
        edges += [Edge((pt, pi), ("hypothesis", hid), stance or "связано") for pt, pi, hid, stance in (await db.execute(
            select(EntityHypothesis.parent_type, EntityHypothesis.parent_id,
                   EntityHypothesis.hypothesis_id, EntityHypothesis.stance)
            .where(_pair_in(ids_by_type, EntityHypothesis.parent_type, EntityHypothesis.parent_id),
                   EntityHypothesis.hypothesis_id.in_(hyp_ids))
        )).all()]
    return edges


async def _edges_around(db: AsyncSession, etype: str, eid: int) -> list[Edge]:
    """ВСЕ прямые связи одной записи (Link и EntityHypothesis), без проверки видимости соседей —
    её делает вызывающий: здесь только список кандидатов."""
    out = [Edge((ft, fi), (tt, ti), lt or "связано") for ft, fi, tt, ti, lt in (await db.execute(
        select(Link.from_type, Link.from_id, Link.to_type, Link.to_id, Link.link_type)
        .where(or_(and_(Link.from_type == etype, Link.from_id == eid),
                   and_(Link.to_type == etype, Link.to_id == eid)), links_alive())
    )).all()]
    mine = [and_(EntityHypothesis.parent_type == etype, EntityHypothesis.parent_id == eid)]
    if etype == "hypothesis":
        mine.append(EntityHypothesis.hypothesis_id == eid)
    out += [Edge((pt, pi), ("hypothesis", hid), stance or "связано") for pt, pi, hid, stance in (await db.execute(
        select(EntityHypothesis.parent_type, EntityHypothesis.parent_id,
               EntityHypothesis.hypothesis_id, EntityHypothesis.stance).where(or_(*mine))
    )).all()]
    return out


async def _tags_for(db: AsyncSession, ids_by_type: dict[str, set[int]]) -> dict[tuple[str, int], set[str]]:
    """Теги публичной записи публичны вместе с ней (решение Алексея, 7.11): у записи один владелец тегов — автор."""
    tags_of: dict[tuple[str, int], set[str]] = defaultdict(set)
    if not ids_by_type:
        return tags_of
    for t, i, name in (await db.execute(
        select(EntityTag.entity_type, EntityTag.entity_id, Tag.name)
        .join(Tag, Tag.id == EntityTag.tag_id).where(_pair_in(ids_by_type, EntityTag.entity_type, EntityTag.entity_id))
    )).all():
        tags_of[(t, i)].add(name)
    return tags_of


async def _load_objs(db: AsyncSession, keys, *, visible=None) -> dict:
    """Живые записи по ключам; visible(model) — дополнительное условие видимости."""
    need: dict[str, set[int]] = defaultdict(set)
    for t, i in keys:
        need[t].add(i)
    objs = {}
    for t, ids in need.items():
        model = ENTITY_MODELS[t]
        q = select(model).where(model.id.in_(ids), model.deleted_at.is_(None))
        if visible is not None:
            q = q.where(visible(model))
        for o in (await db.execute(q)).scalars().all():   # удалена между сбором узлов и сборкой карточек — не попадает
            objs[(t, o.id)] = o
    return objs


async def _items_from(db: AsyncSession, objs: dict, full=()) -> dict:
    users = {}
    if objs:
        users = {u.id: u for u in (await db.execute(
            select(User).where(User.id.in_({o.user_id for o in objs.values()})))).scalars().all()}
    return {k: _record_item(k[0], o, users.get(o.user_id), full=k in full) for k, o in objs.items()}


async def _attach_notes(db: AsyncSession, card_items: list[FeedItem], limit: int) -> None:
    obs_cards = [it for it in card_items if it.type == "observation"]
    if not obs_cards:   # заметки наследуют видимость наблюдения: оно уже прошло фильтр
        return
    oids = [it.entity_id for it in obs_cards]
    counts = dict((await db.execute(
        select(ObservationPost.observation_id, func.count())
        .where(ObservationPost.observation_id.in_(oids)).group_by(ObservationPost.observation_id)
    )).all())
    rn = func.row_number().over(partition_by=ObservationPost.observation_id,
                                order_by=ObservationPost.created_at.desc()).label("rn")
    inner = (
        select(ObservationPost.id.label("id"), ObservationPost.observation_id.label("oid"),
               ObservationPost.title.label("title"), ObservationPost.content.label("content"),
               ObservationPost.created_at.label("created_at"),
               User.username.label("username"), User.display_name.label("display"), rn)
        .join(User, User.id == ObservationPost.author_id)
        .where(ObservationPost.observation_id.in_(oids)).subquery()
    )
    notes: dict[int, list[FeedNoteOut]] = defaultdict(list)
    for r in (await db.execute(
        select(inner).where(inner.c.rn <= limit).order_by(inner.c.oid, inner.c.rn)
    )).all():
        notes[r.oid].append(FeedNoteOut(
            id=r.id, title=r.title or "", preview=truncate_html(r.content, 300),
            author_username=r.username, author_display=r.display or "", created_at=_utc(r.created_at)))
    for it in obs_cards:
        it.note_count = counts.get(it.entity_id, 0)
        it.notes = notes.get(it.entity_id, [])


async def _decorate(db: AsyncSession, card_items: list[FeedItem], notes_limit: int) -> None:
    """Счётчик комментариев, репост, заметки наблюдений. Счётчиков связей нет: они считали и приватные связи владельца."""
    await _attach_comment_counts(card_items, db)
    await _attach_repost_info(card_items, db)
    await _attach_notes(db, card_items, notes_limit)


def _ref_out(k, items: dict) -> FeedRefOut:
    it = items.get(k)
    return FeedRefOut(type=k[0], entity_id=k[1], title=((it.title or it.preview[:60]) if it else ""),
                      translatable=bool(it and it.title), author_username=(it.author_username if it else ""))


def _group_out(g, topics, items: dict) -> Optional[FeedGroupOut]:
    if g.core not in items:
        return None   # запись удалили между запросами
    return FeedGroupOut(
        key=f"{g.core[0]}:{g.core[1]}", core=items[g.core],
        members=[FeedGroupMemberOut(item=items[m], relation=g.relation[m]) for m in g.members if m in items],
        internal=[FeedInternalLinkOut(a=_ref_out(a, items), b=_ref_out(b, items), kind=kind)
                  for a, b, kind in g.internal if a in items and b in items],
        outside=[_ref_out(o, items) for o in g.outside if o in items],
        activity=g.activity, size=g.size, topics=sorted(topics),
    )


async def _group_feed(db: AsyncSession, *, lab_id: Optional[int], is_member: bool, page: int, page_size: int,
                      types: Optional[set[str]], topic: Optional[str]) -> FeedGroupsPage:
    """Видимость читается у самой записи (не из копии в events), поэтому «сделал приватной», «вышла из лабы»,
    «удалена» не оставляют следов. События дают только время активности — и только те, что видны сейчас.
    Лента лабы: участник видит lab+public записи лабы, не-участник публичной лабы — только public."""
    created: dict[tuple[str, int], datetime] = {}
    for etype, model in ENTITY_MODELS.items():
        q = select(model.id, model.created_at).where(model.deleted_at.is_(None))
        if lab_id is None:
            q = q.where(model.visibility == "public")
        else:
            q = q.where(model.lab_id == lab_id,
                        model.visibility.in_(("lab", "public") if is_member else ("public",)))
        for rid, ts in (await db.execute(q)).all():
            created[(etype, rid)] = _utc(ts)
    if not created:
        return FeedGroupsPage(groups=[], page=page, page_size=page_size, total=0, total_pages=1)

    ids_by_type: dict[str, set[int]] = defaultdict(set)
    for t, i in created:
        ids_by_type[t].add(i)

    def _in(type_col, id_col):
        return or_(*[and_(type_col == t, id_col.in_(ids)) for t, ids in ids_by_type.items()])

    activity = dict(created)
    for t, i, ts in (await db.execute(
        select(Event.entity_type, Event.entity_id, func.max(Event.created_at))
        .where(_event_scope(lab_id), Event.type.in_(GROUP_ACTIVITY_EVENT_TYPES), _events_alive(), _events_current(lab_id, is_member),
               _in(Event.entity_type, Event.entity_id))
        .group_by(Event.entity_type, Event.entity_id)
    )).all():
        ts = _utc(ts)
        if (t, i) in activity and ts > activity[(t, i)]:
            activity[(t, i)] = ts

    obs_ids = ids_by_type.get("observation")
    if obs_ids:   # новая заметка к наблюдению — тоже активность карточки
        for oid, ts in (await db.execute(
            select(ObservationPost.observation_id, func.max(ObservationPost.created_at))
            .where(ObservationPost.observation_id.in_(obs_ids)).group_by(ObservationPost.observation_id)
        )).all():
            ts = _utc(ts)
            if ts > activity[("observation", oid)]:
                activity[("observation", oid)] = ts

    edges = await _edges_for(db, ids_by_type)   # только между записями этой ленты
    tags_of = await _tags_for(db, ids_by_type)

    info = []
    for g in build_groups([Node(k, ts) for k, ts in activity.items()], edges):
        keys = (g.core, *g.members)
        info.append((g, {k[0] for k in keys}, set().union(*(tags_of.get(k, set()) for k in keys))))

    type_counts = Counter(t for _, ts, _ in info for t in ts)
    topic_counts = Counter(n for _, _, tg in info for n in tg)
    topics = [TopicCountOut(name=n, count=c)
              for n, c in sorted(topic_counts.items(), key=lambda x: (-x[1], x[0]))[:30]]

    want_topic = topic.strip().lower() if topic else None
    shown = [x for x in info if (not types or x[1] & types) and (not want_topic or want_topic in x[2])]
    total = len(shown)
    page_infos = shown[(page - 1) * page_size: page * page_size]

    objs = await _load_objs(db, [k for g, _, _ in page_infos for k in (g.core, *g.members, *g.outside)])
    items = await _items_from(db, objs)
    await _decorate(db, [items[k] for g, _, _ in page_infos for k in (g.core, *g.members) if k in items],
                    NOTES_PER_CARD)
    out = [o for g, _, tg in page_infos if (o := _group_out(g, tg, items)) is not None]
    return FeedGroupsPage(
        groups=out, page=page, page_size=page_size, total=total,
        total_pages=max(1, ceil(total / page_size)), type_counts=dict(type_counts), topics=topics,
    )


@router.get("/groups/public", response_model=FeedGroupsPage)
async def public_feed_groups(page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=50),
                             types: Optional[str] = Query(None, description="Через запятую: observation,hypothesis,..."),
                             topic: Optional[str] = Query(None),
                             db: AsyncSession = Depends(get_db)):
    return await _group_feed(db, lab_id=None, is_member=False, page=page, page_size=page_size,
                             types=_parse_types(types), topic=topic)


@router.get("/groups/lab/{lab_id}", response_model=FeedGroupsPage)
async def lab_feed_groups(lab_id: int, page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=50),
                          types: Optional[str] = Query(None), topic: Optional[str] = Query(None),
                          user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    member = await db.scalar(select(LabMember).where(LabMember.lab_id == lab_id, LabMember.user_id == user.id))
    lab = await db.get(Lab, lab_id)
    if not lab or (not lab.is_public and not member):
        raise HTTPException(403, "Нет доступа")
    return await _group_feed(db, lab_id=lab_id, is_member=bool(member), page=page, page_size=page_size,
                             types=_parse_types(types), topic=topic)


# — Репост: любая сущность → любая сущность, в личное или в лабораторию —

class RepostIn(StrictIn):
    source_type: Short32
    source_id: int
    target_type: Short32
    target: Short16 = "personal"       # personal | lab
    lab_id: Optional[int] = None
    comment: LongText = ""
    expected_check_date: Optional[datetime] = None  # обязателен, если target_type == "prediction"


@router.post("/repost")
async def repost_entity(body: RepostIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if body.source_type not in ENTITY_MODELS or body.target_type not in ENTITY_MODELS:
        raise HTTPException(400, "Неизвестный тип сущности")
    if body.target not in ("personal", "lab"):
        raise HTTPException(400, "target должен быть personal или lab")
    if body.target == "lab" and not body.lab_id:
        raise HTTPException(400, "Не указана лаборатория")
    if body.target_type == "prediction" and not body.expected_check_date:
        raise HTTPException(400, "Для прогноза нужна дата проверки")

    source = await get_live(db, ENTITY_MODELS[body.source_type], body.source_id)
    if not source:
        raise HTTPException(404, "Исходная запись не найдена")
    if source.visibility == "private" and source.user_id != user.id:
        raise HTTPException(403, "Нет доступа к записи")
    if source.visibility == "lab":
        member = await db.scalar(select(LabMember).where(
            LabMember.lab_id == source.lab_id, LabMember.user_id == user.id))
        if not member:
            raise HTTPException(403, "Нет доступа к записи")

    if body.target == "lab":
        member = await db.scalar(select(LabMember).where(
            LabMember.lab_id == body.lab_id, LabMember.user_id == user.id))
        if not member:
            raise HTTPException(403, "Вы не участник этой лаборатории")

    content = extract_content(body.source_type, source)
    body_text = compose_repost_body(body.comment, content["title"], content["text"])
    target_visibility = "lab" if body.target == "lab" else "private"

    new_entity = await build_entity(
        db, body.target_type, title=content["title"], text=body_text,
        user_id=user.id, visibility=target_visibility,
        lab_id=body.lab_id if body.target == "lab" else None,
        expected_check_date=body.expected_check_date,
    )
    db.add(new_entity)
    await db.flush()
    await emit_event(db, type="created", actor_id=user.id, entity_type=body.target_type,
                      entity_id=new_entity.id, lab_id=new_entity.lab_id, visibility=new_entity.visibility,
                      meta={"repost_of": {"type": body.source_type, "id": body.source_id}})

    db.add(Repost(
        user_id=user.id, comment=body.comment,
        source_type=body.source_type, source_id=body.source_id,
        source_author_id=source.user_id,
        new_type=body.target_type, new_id=new_entity.id,
        target=body.target, lab_id=body.lab_id if body.target == "lab" else None,
    ))
    await db.commit()
    await db.refresh(new_entity)

    return {"ok": True, "new_type": body.target_type, "new_id": new_entity.id}


# — Репост комментария: текст комментария → новая сущность любого типа —

class RepostCommentIn(StrictIn):
    comment_id: int
    target_type: Short32
    target: Short16 = "personal"
    lab_id: Optional[int] = None
    comment: LongText = ""
    keep_attachments: bool = True
    expected_check_date: Optional[datetime] = None  # обязателен, если target_type == "prediction"


@router.post("/repost-comment")
async def repost_comment_entity(body: RepostCommentIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if body.target_type not in ENTITY_MODELS:
        raise HTTPException(400, "Неизвестный тип сущности")
    if body.target not in ("personal", "lab"):
        raise HTTPException(400, "target должен быть personal или lab")
    if body.target == "lab" and not body.lab_id:
        raise HTTPException(400, "Не указана лаборатория")
    if body.target_type == "prediction" and not body.expected_check_date:
        raise HTTPException(400, "Для прогноза нужна дата проверки")

    source_comment = await db.get(EntityComment, body.comment_id)
    if not source_comment:
        raise HTTPException(404, "Комментарий не найден")

    # комментарий существует только в контексте публичной страницы обсуждения —
    # но на всякий случай проверяем видимость сущности, к которой он привязан
    parent_model = ENTITY_MODELS.get(source_comment.entity_type)
    if parent_model:
        parent = await get_live(db, parent_model, source_comment.entity_id)
        if not parent or parent.visibility != "public":
            raise HTTPException(403, "Нет доступа к исходной записи")

    if body.target == "lab":
        member = await db.scalar(select(LabMember).where(
            LabMember.lab_id == body.lab_id, LabMember.user_id == user.id))
        if not member:
            raise HTTPException(403, "Вы не участник этой лаборатории")

    text_part, attachments = split_comment_content(source_comment.content)
    final_text = text_part
    if body.keep_attachments and attachments:
        final_text = (final_text + "\n" if final_text else "") + "\n".join(attachments)

    body_text = compose_repost_body(body.comment, "", final_text)
    target_visibility = "lab" if body.target == "lab" else "private"

    new_entity = await build_entity(
        db, body.target_type, title="", text=body_text,
        user_id=user.id, visibility=target_visibility,
        lab_id=body.lab_id if body.target == "lab" else None,
        expected_check_date=body.expected_check_date,
    )
    db.add(new_entity)
    await db.flush()
    await emit_event(db, type="created", actor_id=user.id, entity_type=body.target_type,
                      entity_id=new_entity.id, lab_id=new_entity.lab_id, visibility=new_entity.visibility,
                      meta={"repost_of_comment": body.comment_id})

    db.add(Repost(
        user_id=user.id, comment=body.comment,
        source_type="comment", source_id=source_comment.id,
        source_author_id=source_comment.author_id,
        new_type=body.target_type, new_id=new_entity.id,
        target=body.target, lab_id=body.lab_id if body.target == "lab" else None,
    ))
    await db.commit()
    await db.refresh(new_entity)

    return {"ok": True, "new_type": body.target_type, "new_id": new_entity.id}


# — Тизер глобального графа —
# ПРИБЛИЖЁННАЯ оценка: nodes = публичные сущности, edges = все связи в системе.
# Полноценный глобальный граф (агрегация связей именно между публичными узлами,
# с учётом производительности на масштабе) — отдельная задача, здесь не реализована.

@router.get("/public/recently-confirmed", response_model=list[FeedItem])
async def public_recently_confirmed(limit: int = Query(3, ge=1, le=10), db: AsyncSession = Depends(get_db)):
    """Недавно закрытые публичные прогнозы — доказательство калибровки для гостя,
    не только свежесть. Переиспользует _enrich, как и основная лента."""
    rows = (await db.execute(
        select(Prediction)
        .where(
            Prediction.visibility == "public",
            Prediction.deleted_at.is_(None),
            Prediction.status.in_(CLOSED_PREDICTION_STATUSES),
        )
        .order_by(Prediction.updated_at.desc())
        .limit(limit)
    )).scalars().all()
    return await _enrich(rows, "prediction", db)


@router.get("/public/graph-teaser")
async def public_graph_teaser(db: AsyncSession = Depends(get_db)):
    async def count_public(model):
        return await db.scalar(select(func.count()).where(model.visibility == "public", model.deleted_at.is_(None))) or 0

    nodes = sum([
        await count_public(Observation), await count_public(Hypothesis),
        await count_public(Prediction), await count_public(Worldview),
        await count_public(Question),
    ])
    from app.api.v1.global_graph import global_graph_overview   # те же публичные пары, что в обзоре графа: приватные связи не считаем
    edges = sum(e["weight"] for e in (await global_graph_overview(db))["superedges"])
    return {"nodes": nodes, "edges": edges, "approximate": True}


# Типы записей для sitemap: у убеждений нет заголовка, их страница обсуждения закрыта от индекса (noindex).
SITEMAP_TYPES = ("observation", "hypothesis", "prediction", "question", "task")


@router.get("/public/sitemap")
async def public_sitemap(limit: int = Query(5000, ge=1, le=10000), db: AsyncSession = Depends(get_db)):
    """Перечень публичных записей для sitemap: только тип, id и время изменения, без текстов и авторов.
    Отбор тот же, что у публичной ленты: visibility == public и не удалена."""
    out: list[dict] = []
    for etype in SITEMAP_TYPES:
        model = ENTITY_MODELS[etype]
        stamp = func.coalesce(model.updated_at, model.created_at) if hasattr(model, "updated_at") else model.created_at
        rows = (await db.execute(
            select(model.id, stamp)
            .where(model.visibility == "public", model.deleted_at.is_(None))
            .order_by(stamp.desc()).limit(limit)
        )).all()
        out += [{"type": etype, "id": rid, "updated_at": _utc(ts).isoformat()} for rid, ts in rows]
    out.sort(key=lambda x: x["updated_at"], reverse=True)
    return out[:limit]


@router.get("/groups/entity/{entity_type}/{entity_id}", response_model=FeedGroupOut)
async def feed_group_of_entity(entity_type: str, entity_id: int,
                               user: Optional[User] = Depends(get_current_user_optional),
                               db: AsyncSession = Depends(get_db)):
    """Карточка ОДНОЙ записи для её страницы обсуждения: запись целиком в центре, все прямые связи вокруг.
    Соседи не шире самой записи: у публичной — только public, у лабораторной — public и lab той же лаборатории.
    Личной записи карточки нет даже у владельца (404)."""
    model = ENTITY_MODELS.get(entity_type)
    if not model:
        raise HTTPException(400, "Неизвестный тип сущности")
    obj = await get_entity_for_view(db, model, entity_id, user.id if user else None, hide_as_404=True)
    if obj.deleted_at is not None or obj.visibility not in ("public", "lab"):
        raise HTTPException(404, "Не найдено")
    core = (entity_type, obj.id)
    if obj.visibility == "lab":
        lab_id = obj.lab_id

        def visible(m):
            return or_(m.visibility == "public", and_(m.visibility == "lab", m.lab_id == lab_id))
    else:
        def visible(m):
            return m.visibility == "public"
    near = {k for e in await _edges_around(db, *core) for k in (e.a, e.b) if k != core and k[0] in ENTITY_MODELS}
    objs = await _load_objs(db, near, visible=visible)
    objs[core] = obj
    ids_by_type: dict[str, set[int]] = defaultdict(set)
    for t, i in objs:
        ids_by_type[t].add(i)
    edges = await _edges_for(db, ids_by_type)
    tags_of = await _tags_for(db, ids_by_type)
    g = star_around(core, [Node(k, _utc(o.created_at)) for k, o in objs.items()], edges)
    keys = (g.core, *g.members)
    items = await _items_from(db, objs, full={core})
    await _decorate(db, [items[k] for k in keys], 50)
    return _group_out(g, set().union(*(tags_of.get(k, set()) for k in keys)), items)


# — Блог-посты гипотезы (легаси, без изменений — используется отдельно) —

@router.get("/hypothesis/{hyp_id}/posts", response_model=list[PostOut])
async def get_posts(hyp_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    hyp = await get_live(db, Hypothesis, hyp_id)
    if not hyp:
        raise HTTPException(404)
    if hyp.visibility == "private" and hyp.user_id != user.id:
        raise HTTPException(403)
    if hyp.visibility == "lab":
        member = await db.scalar(select(LabMember).where(LabMember.lab_id == hyp.lab_id, LabMember.user_id == user.id))
        if not member:
            raise HTTPException(403)
    rows = (await db.execute(select(HypothesisPost).where(HypothesisPost.hypothesis_id == hyp_id).order_by(HypothesisPost.created_at.desc()))).scalars().all()
    result = []
    for p in rows:
        author = await db.get(User, p.author_id)
        result.append(PostOut(
            id=p.id, hypothesis_id=p.hypothesis_id, author_id=p.author_id,
            author_username=author.username if author else "",
            author_display=author.display_name if author else "",
            author_avatar_url=author.avatar_url if author else None,
            title=p.title, content=p.content, created_at=p.created_at,
        ))
    return result


@router.post("/hypothesis/{hyp_id}/posts", response_model=PostOut)
async def create_post(hyp_id: int, body: PostIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    hyp = await get_live(db, Hypothesis, hyp_id)
    if not hyp:
        raise HTTPException(404)
    if hyp.visibility == "private" and hyp.user_id != user.id:
        raise HTTPException(403)
    if hyp.visibility == "lab":
        member = await db.scalar(select(LabMember).where(LabMember.lab_id == hyp.lab_id, LabMember.user_id == user.id))
        if not member:
            raise HTTPException(403)
    post = HypothesisPost(hypothesis_id=hyp_id, author_id=user.id, title=body.title, content=body.content)
    db.add(post)
    await db.commit()
    await db.refresh(post)
    return PostOut(
        id=post.id, hypothesis_id=post.hypothesis_id, author_id=post.author_id,
        author_username=user.username, author_display=user.display_name,
        author_avatar_url=user.avatar_url,
        title=post.title, content=post.content, created_at=post.created_at,
    )


@router.get("/posts/{post_id}/comments", response_model=list[CommentOut])
async def get_comments(post_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    post = await db.get(HypothesisPost, post_id)
    if not post:
        raise HTTPException(404)
    hyp = await get_live(db, Hypothesis, post.hypothesis_id)
    if hyp:
        if hyp.visibility == "private" and hyp.user_id != user.id:
            raise HTTPException(403)
        if hyp.visibility == "lab":
            member = await db.scalar(select(LabMember).where(LabMember.lab_id == hyp.lab_id, LabMember.user_id == user.id))
            if not member:
                raise HTTPException(403)
    rows = (await db.execute(select(PostComment).where(PostComment.post_id == post_id).order_by(PostComment.created_at))).scalars().all()
    rows = (await db.execute(select(PostComment).where(PostComment.post_id == post_id).order_by(PostComment.created_at))).scalars().all()
    result = []
    for c in rows:
        author = await db.get(User, c.author_id)
        result.append(CommentOut(
            id=c.id, post_id=c.post_id, author_id=c.author_id,
            author_username=author.username if author else "",
            author_display=author.display_name if author else "",
            author_avatar_url=author.avatar_url if author else None,
            content=c.content, created_at=c.created_at,
        ))
    return result


@router.post("/posts/{post_id}/comments", response_model=CommentOut)
async def create_comment(post_id: int, body: CommentIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    post = await db.get(HypothesisPost, post_id)
    if not post:
        raise HTTPException(404)
    hyp = await get_live(db, Hypothesis, post.hypothesis_id)
    if hyp:
        if hyp.visibility == "private" and hyp.user_id != user.id:
            raise HTTPException(403)
        if hyp.visibility == "lab":
            member = await db.scalar(select(LabMember).where(LabMember.lab_id == hyp.lab_id, LabMember.user_id == user.id))
            if not member:
                raise HTTPException(403)
    comment = PostComment(post_id=post_id, author_id=user.id, content=body.content)
    comment = PostComment(post_id=post_id, author_id=user.id, content=body.content)
    db.add(comment)
    await db.commit()
    await db.refresh(comment)
    return CommentOut(
        id=comment.id, post_id=comment.post_id, author_id=comment.author_id,
        author_username=user.username, author_display=user.display_name,
        author_avatar_url=user.avatar_url,
        content=comment.content, created_at=comment.created_at,
    )


# — Блог-посты наблюдения (легаси, без изменений — используется в PublishModal) —

@router.get("/observation/{obs_id}/posts")
async def get_obs_posts(obs_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    obs = await get_live(db, Observation, obs_id)
    if not obs:
        raise HTTPException(404)
    posts = (await db.execute(select(ObservationPost).where(ObservationPost.observation_id == obs_id).order_by(ObservationPost.created_at.desc()))).scalars().all()
    result = []
    for p in posts:
        author = await db.get(User, p.author_id)
        result.append({"id": p.id, "observation_id": p.observation_id, "author_id": p.author_id,
            "author_username": author.username if author else "", "author_display": author.display_name if author else "",
            "author_avatar_url": author.avatar_url if author else None,
            "title": p.title, "content": p.content, "created_at": p.created_at.isoformat()})
    return result


@router.post("/observation/{obs_id}/posts")
async def create_obs_post(obs_id: int, body: PostIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    obs = await get_live(db, Observation, obs_id)
    if not obs:
        raise HTTPException(404)
    if obs.visibility == "private" and obs.user_id != user.id:
        raise HTTPException(403)
    if obs.visibility == "lab":
        member = await db.scalar(select(LabMember).where(LabMember.lab_id == obs.lab_id, LabMember.user_id == user.id))
        if not member:
            raise HTTPException(403)
    post = ObservationPost(observation_id=obs_id, author_id=user.id, title=body.title, content=body.content)
    db.add(post)
    await db.flush()
    # obs_post исторически всегда visibility="public" —
    # сохраняем то же поведение здесь, а не выводим его из чего-то ещё
    await emit_event(db, type="created", actor_id=user.id, entity_type="obs_post",
                      entity_id=post.id, lab_id=obs.lab_id, visibility="public")
    await db.commit()
    await db.refresh(post)
    return {"id": post.id, "observation_id": post.observation_id, "author_id": post.author_id,
        "author_username": user.username, "author_display": user.display_name,
        "author_avatar_url": user.avatar_url,
        "title": post.title, "content": post.content, "created_at": post.created_at.isoformat()}


