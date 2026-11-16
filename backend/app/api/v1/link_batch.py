"""Пакетные операции со связями записи: сменить тип или удалить сразу несколько, одной транзакцией.

Всё или ничего: если хоть одна операция недопустима, не применяется ничего, ответ 409 содержит причины по строкам.
Права и события те же, что у одиночных операций, потому что вызываются те же функции (services/link_mutations.py).
Все события пакета несут общий batch_id; POST .../undo/batch/{batch_id} откатывает пакет тоже атомарно.
Конкурирующие гипотезы в пакет не входят (у них своя роль и свои события)."""
import uuid
from typing import Annotated, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.core.entity_registry import ENTITY_MODELS
from app.core.lab_access import ShareChoice, get_entity_for_view, get_live
from app.db.session import get_db
from app.models.entities import Event, Hypothesis
from app.models.user import User
from app.schemas._strict import StrictIn
from app.services import link_mutations as lm
from app.services.hypothesis_evidence import level_from_signal, observation_signal
from app.services.link_effect import can_see_effect
from app.services.link_events import LINK_EVENT_TYPES, event_touches, undo_link_event

router = APIRouter(tags=["link_batch"])
MAX_OPS = 50
FIELD_STANCES = ("подтверждает", "опровергает")


class BatchOp(StrictIn):
    op: Literal["set_type", "remove"]
    other_type: str
    other_id: int
    source: Literal["link", "field"]
    link_type: Optional[str] = None


class BatchIn(StrictIn):
    ops: Annotated[list[BatchOp], Field(min_length=1, max_length=MAX_OPS)]


class BatchOut(BaseModel):
    batch_id: str
    applied: int


class BatchImpactOut(BaseModel):
    hypothesis_id: int
    name: str
    before: float
    after: float
    level_before: int
    level_after: int


class BatchPreviewOut(BaseModel):
    hypotheses: list[BatchImpactOut]   # у каких гипотез зрителя сигнал изменится сразу
    pending_predictions: int            # связи открытых прогнозов: вклад появится только при закрытии


async def _apply(db, user_id: int, root: tuple[str, int], op: BatchOp, batch_id: str) -> None:
    other = (op.other_type, op.other_id)
    if op.source == "link":
        if op.op == "remove":
            if await lm.remove_own_links(db, user_id, root, other, batch_id=batch_id) == 0:
                raise HTTPException(404, "Связь не найдена")
        else:
            if not op.link_type:
                raise HTTPException(400, "Не указан тип связи")
            await lm.set_own_link_type(db, user_id, root, other, op.link_type, batch_id=batch_id)
        return
    if {root[0], other[0]} != {"prediction", "hypothesis"}:
        raise HTTPException(400, "Связь из поля бывает только между прогнозом и гипотезой")
    pid, hid = (root[1], other[1]) if root[0] == "prediction" else (other[1], root[1])
    if op.op == "remove":
        await lm.remove_field_link(db, user_id, pid, hypothesis_id=hid, batch_id=batch_id)
    else:
        if op.link_type not in FIELD_STANCES:
            raise HTTPException(400, "Для связи из поля возможны только «подтверждает» и «опровергает»")
        await lm.set_field_stance(db, user_id, pid, op.link_type == "подтверждает", hypothesis_id=hid, batch_id=batch_id)


async def _run_ops(db, user_id: int, root: tuple[str, int], ops, batch_id: str) -> list[dict]:
    """Применяет операции в открытой транзакции, возвращает ошибки по строкам (пусто — всё применимо).
    Коммит или откат за вызывающим; общий для настоящего пакета и пробного запуска."""
    errors, seen = [], set()
    for i, op in enumerate(ops):
        key = (op.other_type, op.other_id, op.source)
        if key in seen:
            errors.append({"index": i, "status": 409, "message": "Операция повторяется"})
            continue
        seen.add(key)
        try:
            await _apply(db, user_id, root, op, batch_id)
        except HTTPException as e:
            errors.append({"index": i, "status": e.status_code, "message": e.detail if isinstance(e.detail, str) else str(e.detail)})
    return errors


def _signal_hypotheses(root: tuple[str, int], ops) -> list[int]:
    """Гипотезы, чей сигнал наблюдений могут изменить операции (связи «наблюдение и гипотеза»)."""
    ids: set[int] = set()
    for o in ops:
        if o.source != "link":
            continue
        if root[0] == "hypothesis" and o.other_type == "observation":
            ids.add(root[1])
        elif root[0] == "observation" and o.other_type == "hypothesis":
            ids.add(o.other_id)
    return sorted(ids)


async def _signals(db, user_id: int, hyp_ids) -> dict[int, tuple[str, float, int]]:
    """{id гипотезы: (название, сигнал, предложенный уровень)} — только для гипотез зрителя (can_see_effect)."""
    out: dict[int, tuple[str, float, int]] = {}
    for hid in hyp_ids:
        hyp = await get_live(db, Hypothesis, hid)
        if hyp is None or not can_see_effect(user_id, hyp):
            continue
        from app.services.hypothesis_evidence import maturity_signal  # единая формула с recompute_suggestion
        total = (await maturity_signal(db, hyp))[3]
        out[hid] = (hyp.name, total, level_from_signal(total, hyp.risk))
    return out


async def _recompute(db, user_id: int, pairs) -> None:
    from app.api.v1.graph import _recompute_if_observation_hypothesis_link
    for a_type, a_id, b_type, b_id in pairs:
        await _recompute_if_observation_hypothesis_link(db, a_type, a_id, b_type, b_id, user_id)


@router.post("/{entity_type}/{entity_id}/links/batch", response_model=BatchOut)
async def apply_batch(entity_type: str, entity_id: int, body: BatchIn,
                      user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    model = ENTITY_MODELS.get(entity_type)
    if model is None:
        raise HTTPException(404, "Не найдено")
    await get_entity_for_view(db, model, entity_id, user.id, hide_as_404=True)
    root = (entity_type, entity_id)
    batch_id = uuid.uuid4().hex
    errors = await _run_ops(db, user.id, root, body.ops, batch_id)
    if errors:
        await db.rollback()
        raise HTTPException(409, detail={"code": "batch_rejected", "errors": errors})
    await db.commit()
    await _recompute(db, user.id, [(entity_type, entity_id, o.other_type, o.other_id) for o in body.ops if o.source == "link"])
    return BatchOut(batch_id=batch_id, applied=len(body.ops))


@router.post("/{entity_type}/{entity_id}/links/batch/preview", response_model=BatchPreviewOut)
async def preview_batch(entity_type: str, entity_id: int, body: BatchIn,
                        user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Что изменится, если применить пакет. Операции идут теми же функциями в той же транзакции, сигнал
    считается до и после, затем всё откатывается: в базе не остаётся ничего (в том числе событий)."""
    model = ENTITY_MODELS.get(entity_type)
    if model is None:
        raise HTTPException(404, "Не найдено")
    await get_entity_for_view(db, model, entity_id, user.id, hide_as_404=True)
    root = (entity_type, entity_id)
    ids = _signal_hypotheses(root, body.ops)
    pending = sum(1 for o in body.ops if o.source == "field")
    try:
        before = await _signals(db, user.id, ids)
        errors = await _run_ops(db, user.id, root, body.ops, uuid.uuid4().hex)
        after: dict = {}
        if not errors:
            await db.flush()  # чтобы расчёт увидел изменения, даже если автосброс отключён
            after = await _signals(db, user.id, ids)
    finally:
        await db.rollback()
    if errors:
        raise HTTPException(409, detail={"code": "batch_rejected", "errors": errors})
    changed = [BatchImpactOut(hypothesis_id=h, name=before[h][0], before=before[h][1], after=after[h][1],
                              level_before=before[h][2], level_after=after[h][2])
               for h in ids if h in before and h in after and abs(after[h][1] - before[h][1]) > 1e-9]
    return BatchPreviewOut(hypotheses=changed, pending_predictions=pending)


@router.post("/{entity_type}/{entity_id}/undo/batch/{batch_id}")
async def undo_batch(entity_type: str, entity_id: int, batch_id: str, share: ShareChoice = None,
                     user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Откатывает пакет целиком (в обратном порядке). Уже откатанные по одному события пропускаются;
    если откатывать нечего, 409. Любая блокировка по одному из событий отменяет откат всего пакета.
    Возврат связи с записью лаборатории спрашивает «кому видно»: ?share=me|lab|public, один выбор на весь пакет
    (не подходящий одной из записей даёт 400 и откат всего пакета)."""
    evs = (await db.execute(select(Event).where(
        Event.actor_id == user.id, Event.type.in_(LINK_EVENT_TYPES), Event.meta["batch_id"].astext == batch_id,
    ).order_by(Event.id.desc()))).scalars().all()
    evs = [e for e in evs if event_touches(e, entity_type, entity_id)]
    if not evs:
        raise HTTPException(404, detail={"code": "batch_not_found"})
    reverted = set((await db.execute(select(Event.meta["reverts_event_id"].astext).where(
        Event.meta["reverts_event_id"].astext.in_([str(e.id) for e in evs])))).scalars().all())
    pending = [e for e in evs if str(e.id) not in reverted]
    if not pending:
        raise HTTPException(409, detail={"code": "already_reverted", "fields": []})
    touched = []
    try:
        for ev in pending:
            touched.append(await undo_link_event(db, user.id, ev, share))
    except HTTPException:
        await db.rollback()
        raise
    await db.commit()
    await _recompute(db, user.id, dict.fromkeys(touched))
    return {"batch_id": batch_id, "reverted": len(pending)}
