"""Точечный откат одного события Event(type="updated") на живой записи.

Не про корзину (soft-delete/restore — services/soft_delete.py) и не про
checkpoints/diff-UI: только «вернуть поля ОДНОГО события к значению "до"».

Три осознанные защиты:

1. ALLOWLIST откатываемых полей на тип. Голое `obj.field = old` обходит всё,
   что обычный PUT делает помимо записи колонки: HypStatusHistory при смене
   status, resolve_lab_attachment при visibility/lab_id,
   invalidate_evidence_diversity при confirms_hypothesis_if_true, а откат
   deleted_at == restore в обход корзины и slug-проверки. Новая колонка по
   умолчанию НЕ откатывается, пока её сюда не добавили осознанно — ошибка
   выглядит как «кнопка недоступна», а не как порча данных. Событие, где есть
   хоть одно поле вне allowlist, блокируется ЦЕЛИКОМ (частичный откат даёт
   несогласованную историю).

2. Конфликт определяется по ЗНАЧЕНИЮ, не по порядку событий: откат разрешён,
   только если текущее значение каждого поля == "new" из откатываемого
   события (как git revert: строку после коммита никто не трогал). Порядок
   Event.id — локальная последовательность одной БД; при будущих fork/merge
   между инстансами он перестанет быть причинным. Вся проверка живёт в
   evaluate_undo() — когда появятся правила мерджа, меняется одна функция.

3. ЗНАЧЕНИЯ ШКАЛ (таблица scale_values) живут вне колонок записи, но попадают в журнал тем же
   событием updated: ключ в changed_fields — "scale:<scale_id>" (services/scale_values.py).
   Вердикт по-прежнему один — здесь. Откат разрешён, если шкала ещё существует (custom_<id>
   удаляется вместе со значениями — иначе откат воскресил бы строку-сироту) и текущее значение
   == "new". Состояние шкал приходит параметром (ScaleContext): evaluate_undo остаётся чистой
   функцией, БД читает только load_scale_context().

4. ВИДИМОСТЬ (visibility + lab_id) откатывается парой и только по тем же правилам, что обычная смена: целевое
   состояние (старые значения) должно оставаться достижимым — лаборатория существует, её публичность не
   изменилась (visibility_from_lab), пользователь по-прежнему участник; закрытый прогноз заморожен. Состояние
   лабораторий приходит параметром (VisibilityContext), evaluate_undo остаётся чистой функцией. Сам откат
   (api/v1/undo.py) идёт через reset_shares_on_visibility_change — она снимает согласия и пишет visibility_changed;
   голое присваивание обошло бы и то, и другое.
"""
from dataclasses import dataclass
from datetime import date, datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.prediction_status import CLOSED_PREDICTION_STATUSES
from app.core.lab_access import visibility_from_lab
from app.models.entities import ScaleDef, ScaleValue
from app.models.social import Lab, LabMember
from app.services.scale_values import SCALE_FIELD_PREFIX

# Чистый контент: то, что PUT записывает простым присваиванием, без побочных
# эффектов. Сознательно НЕТ: status (HypStatusHistory + status_changed),
# slug, deleted_at, hypothesis_id (can_link), confirms_hypothesis_if_true (invalidate_evidence_diversity).
# visibility/lab_id здесь тоже нет — они откатываются отдельным путём (VISIBILITY_FIELDS, см. пункт 4 докстринга).
UNDOABLE_FIELDS: dict[str, frozenset[str]] = {
    "observation": frozenset({"date", "author", "title", "text", "importance"}),
    "hypothesis":  frozenset({"name", "description", "falsification_criteria", "date_created",
                              "stability", "research_load", "maturity", "risk"}),
    "prediction":  frozenset({"title", "text", "date_created", "expected_check_date",
                              "confidence", "result_notes"}),
    "worldview":   frozenset({"date", "belief", "confirming_data", "refuting_data", "confidence"}),
    "question":    frozenset({"title", "text", "priority", "importance", "answer", "date_created"}),
    "task":        frozenset({"name", "description", "progress"}),
}


@dataclass(frozen=True)
class UndoVerdict:
    ok: bool
    code: str | None = None          # not_updated_event | malformed_event | field_not_undoable | prediction_closed | scale_missing | conflict | lab_state_changed | not_lab_member
    fields: tuple[str, ...] = ()     # какие поля вызвали блокировку (ключи шкал — с префиксом "scale:")


@dataclass(frozen=True)
class ScaleContext:
    """Состояние шкал владельца для вердикта (читается из БД в load_scale_context)."""
    values: dict[str, float]         # scale_id -> текущее значение у ЭТОЙ записи (нет ключа — значения нет)
    custom_ids: frozenset[str]       # "custom_<id>" существующих пользовательских шкал владельца


EMPTY_SCALES = ScaleContext({}, frozenset())

# Откатываются парой и не через простое присваивание (см. пункт 4 докстринга).
VISIBILITY_FIELDS = frozenset({"visibility", "lab_id"})


@dataclass(frozen=True)
class VisibilityContext:
    """Состояние лабораторий для вердикта об откате видимости (читается в load_visibility_context)."""
    lab_public: dict[int, bool]       # lab_id -> is_public (нет ключа — лаборатории нет)
    member_labs: frozenset[int]       # лаборатории, где пользователь участник


EMPTY_VISIBILITY = VisibilityContext({}, frozenset())


def _from_json(column, value):
    """Обратная операция к event_log._json_safe для полей allowlist: в meta лежат
    строки (isoformat), а колонка ждёт datetime/date. Наивный datetime считаем UTC —
    иначе сравнение с aware-значением из БД давало бы ложный конфликт."""
    if value is None:
        return None
    try:
        py = column.type.python_type
    except NotImplementedError:
        return value
    if py is datetime:
        dt = datetime.fromisoformat(value)
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    if py is date:
        return date.fromisoformat(value)
    return value


def _changed_fields(event) -> dict | None:
    changed = (event.meta or {}).get("changed_fields")
    if not isinstance(changed, dict) or not changed:
        return None
    if not all(isinstance(ch, dict) and "old" in ch and "new" in ch for ch in changed.values()):
        return None
    return changed


def evaluate_undo(obj, entity_type: str, event, scales: ScaleContext | None = None,
                  visibility: VisibilityContext | None = None) -> UndoVerdict:
    """Единственное место, решающее «можно ли откатить событие». Используется и
    эндпоинтом undo, и списком истории (undoable/blocked_code) — UI не дублирует логику.
    scales — состояние шкал владельца (load_scale_context); без него события со шкалами
    блокируются, а не откатываются вслепую. visibility — состояние лабораторий (load_visibility_context); без него
    откат возврата В лабораторию блокируется (lab_state_changed), а не выполняется вслепую."""
    if event.type != "updated":
        return UndoVerdict(False, "not_updated_event")
    changed = _changed_fields(event)
    if changed is None:
        return UndoVerdict(False, "malformed_event")

    col_changed = {f: ch for f, ch in changed.items() if not f.startswith(SCALE_FIELD_PREFIX)}
    scale_changed = {f[len(SCALE_FIELD_PREFIX):]: ch for f, ch in changed.items() if f.startswith(SCALE_FIELD_PREFIX)}

    allowed = UNDOABLE_FIELDS.get(entity_type, frozenset())
    forbidden = tuple(sorted(f for f in col_changed if f not in allowed and f not in VISIBILITY_FIELDS))
    if forbidden:
        return UndoVerdict(False, "field_not_undoable", forbidden)

    # Закрытый прогноз уже учтён в калибровке по confidence на момент закрытия — откат
    # разошёл бы карточку с тем, по чему тебя оценили. PUT запрещает то же самое.
    # То же заморожено для видимости и лаборатории: вклад закрытого прогноза в сигнал лаборатории уже учтён
    # (ensure_prediction_visibility_not_frozen в PUT и в PUT /{type}/{id}/visibility).
    if entity_type == "prediction" and obj.status in CLOSED_PREDICTION_STATUSES:
        frozen = tuple(sorted(f for f in col_changed if f in {"confidence", "visibility", "lab_id"}))
        if frozen:
            return UndoVerdict(False, "prediction_closed", frozen)

    ctx = scales if scales is not None else EMPTY_SCALES
    missing = tuple(sorted(
        f"{SCALE_FIELD_PREFIX}{sid}" for sid in scale_changed
        if sid.startswith("custom_") and sid not in ctx.custom_ids
    ))
    if missing:
        return UndoVerdict(False, "scale_missing", missing)

    columns = type(obj).__mapper__.columns
    conflicts = [
        f for f, ch in col_changed.items()
        if _from_json(columns[f], ch["new"]) != getattr(obj, f)
    ]
    conflicts += [
        f"{SCALE_FIELD_PREFIX}{sid}" for sid, ch in scale_changed.items()
        if ctx.values.get(sid) != ch["new"]
    ]
    if conflicts:
        return UndoVerdict(False, "conflict", tuple(sorted(conflicts)))

    target = visibility_target(obj, event)
    if target is not None:   # целевое состояние видимости должно быть достижимо теми же правилами, что обычная смена
        vis, lab = target
        vctx = visibility if visibility is not None else EMPTY_VISIBILITY
        if lab is None:
            if vis == "lab":
                return UndoVerdict(False, "lab_state_changed", ("lab_id",))
        else:
            is_public = vctx.lab_public.get(lab)
            if is_public is None or visibility_from_lab(is_public) != vis:
                return UndoVerdict(False, "lab_state_changed", ("lab_id",))
            if lab not in vctx.member_labs:
                return UndoVerdict(False, "not_lab_member", ("lab_id",))
    return UndoVerdict(True)


def apply_undo(obj, event) -> list[str]:
    """Только присваивание колонок: событие updated (generic diff) породит before_flush-листенер,
    как для любой правки. Ключи шкал пропускаются — их возвращает scale_undo_values() через
    set_scale_value. Вызывать ПОСЛЕ evaluate_undo(...).ok. Возвращает ВСЕ откатанные поля."""
    columns = type(obj).__mapper__.columns
    changed = event.meta["changed_fields"]
    for field, ch in changed.items():
        if field.startswith(SCALE_FIELD_PREFIX) or field in VISIBILITY_FIELDS:
            continue   # шкалы и видимость возвращает эндпоинт своим путём (set_scale_value / reset_shares_on_visibility_change)
        setattr(obj, field, _from_json(columns[field], ch["old"]))
    return sorted(changed)


def scale_undo_values(event) -> dict[str, float | None]:
    """scale_id -> значение «до» для каждого шкального ключа события (None — значения не было)."""
    return {
        f[len(SCALE_FIELD_PREFIX):]: ch["old"]
        for f, ch in event.meta["changed_fields"].items() if f.startswith(SCALE_FIELD_PREFIX)
    }


async def load_scale_context(db: AsyncSession, user_id: int, entity_type: str, entity_id: int) -> ScaleContext:
    """Единственное чтение БД в этом модуле: текущие значения шкал владельца у записи и
    список его существующих пользовательских шкал (builtin_key IS NULL — не переопределения)."""
    rows = (await db.execute(
        select(ScaleValue.scale_id, ScaleValue.value).where(
            ScaleValue.user_id == user_id,
            ScaleValue.entity_type == entity_type,
            ScaleValue.entity_id == entity_id,
        )
    )).all()
    custom = (await db.execute(
        select(ScaleDef.id).where(ScaleDef.user_id == user_id, ScaleDef.builtin_key.is_(None))
    )).scalars().all()
    return ScaleContext({sid: val for sid, val in rows}, frozenset(f"custom_{i}" for i in custom))


def visibility_target(obj, event) -> tuple[str, int | None] | None:
    """Состояние (visibility, lab_id), в которое вернёт откат события, или None, если событие видимости не касается.
    Поле, которого нет в событии, не менялось — берётся текущее значение. Считать ДО присваиваний."""
    changed = (event.meta or {}).get("changed_fields") or {}
    if not any(f in changed for f in VISIBILITY_FIELDS):
        return None
    vis = changed["visibility"]["old"] if "visibility" in changed else obj.visibility
    lab = changed["lab_id"]["old"] if "lab_id" in changed else obj.lab_id
    return vis, lab


async def load_visibility_context(db: AsyncSession, user_id: int, events) -> VisibilityContext:
    """Лаборатории, куда откат вернул бы запись (старые lab_id событий): существуют ли, публичны ли, участник ли пользователь."""
    lab_ids: set[int] = set()
    for ev in events:
        ch = ((ev.meta or {}).get("changed_fields") or {}).get("lab_id")
        old = ch.get("old") if isinstance(ch, dict) else None
        if isinstance(old, int) and not isinstance(old, bool):
            lab_ids.add(old)
    if not lab_ids:
        return EMPTY_VISIBILITY
    pub = {lid: bool(p) for lid, p in (await db.execute(select(Lab.id, Lab.is_public).where(Lab.id.in_(lab_ids)))).all()}
    member = frozenset((await db.execute(
        select(LabMember.lab_id).where(LabMember.user_id == user_id, LabMember.lab_id.in_(lab_ids)))).scalars().all())
    return VisibilityContext(pub, member)
