"""Soft-delete, фаза 1 (инфраструктура, без роутов): колонка + partial index,
parent_alive_subquery, get_live, include_deleted в policy-функциях,
entity_visibility_filter. Роуты/корзина/restore/permanent — следующие фазы."""
import pytest
from datetime import datetime, timezone
from fastapi import HTTPException
from sqlalchemy import select, text, and_

from app.db.session import AsyncSessionLocal
from app.core.entity_registry import ENTITY_MODELS
from app.core.lab_access import (
    get_entity_for_view, get_entity_for_lab_manage, get_live,
    entity_visibility_filter, parent_alive_subquery,
)
from app.models.entities import Observation, Result, Event
from app.models.mixins import is_soft_deletable
from app.models.social import EntityComment


async def _obs(db, user_id, slug, dead=False):
    o = Observation(
        user_id=user_id, date="2026-09-24", author="t", title="t", slug=slug,
        text="текст", status="осмысленное", importance=0,
        visibility="private", lab_id=None,
        deleted_at=datetime.now(timezone.utc) if dead else None,
    )
    db.add(o)
    await db.commit()
    await db.refresh(o)
    return o


async def _comment(db, user_id, etype, eid):
    c = EntityComment(entity_type=etype, entity_id=eid, author_id=user_id, content="c")
    db.add(c)
    await db.commit()
    await db.refresh(c)
    return c.id


async def _status(coro):
    try:
        await coro
    except HTTPException as e:
        return e.status_code
    return 200


@pytest.mark.asyncio
async def test_all_base_models_soft_deletable_with_partial_index():
    """Guard: новый тип в ENTITY_MODELS без deleted_at/индекса в БД — падение здесь."""
    async with AsyncSessionLocal() as db:
        for etype, model in ENTITY_MODELS.items():
            assert is_soft_deletable(model), f"{etype}: нет SoftDeleteMixin"
            tbl = model.__tablename__
            rows = (await db.execute(
                text("SELECT indexname, indexdef FROM pg_indexes WHERE tablename = :t"), {"t": tbl}
            )).all()
            found = [d for n, d in rows if n == f"idx_{tbl}_deleted_at"]
            assert found, f"{tbl}: нет idx_{tbl}_deleted_at"
            assert "deleted_at IS NOT NULL" in found[0], f"{tbl}: индекс не partial: {found[0]}"


@pytest.mark.asyncio
async def test_setting_deleted_at_logs_iso_timestamp_in_updated_event(test_user):
    """deleted_at ставится значением, а не func.now(): _json_safe превращает
    неизвестный тип в str(), и в лог попало бы литеральное 'now()'."""
    async with AsyncSessionLocal() as db:
        o = await _obs(db, test_user.id, "sd-evt-1")
        o.deleted_at = datetime.now(timezone.utc)
        await db.commit()
        evs = (await db.execute(
            select(Event).where(Event.entity_type == "observation", Event.entity_id == o.id, Event.type == "updated")
        )).scalars().all()
        vals = [e.meta["changed_fields"]["deleted_at"]["new"] for e in evs if "deleted_at" in e.meta.get("changed_fields", {})]
        assert len(vals) == 1
        datetime.fromisoformat(vals[0])  # не ISO — ValueError


@pytest.mark.asyncio
async def test_parent_alive_subquery_hides_children_but_keeps_rows(test_user):
    async with AsyncSessionLocal() as db:
        alive = await _obs(db, test_user.id, "sd-pa-1")
        dead = await _obs(db, test_user.id, "sd-pa-2", dead=True)
        c_alive = await _comment(db, test_user.id, "observation", alive.id)
        c_dead = await _comment(db, test_user.id, "observation", dead.id)
        c_lab = await _comment(db, test_user.id, "lab", 424242)  # родитель вне ENTITY_MODELS

        visible = (await db.execute(
            select(EntityComment.id).where(parent_alive_subquery(EntityComment.entity_type, EntityComment.entity_id))
        )).scalars().all()
        assert set(visible) == {c_alive, c_lab}

        physical = (await db.execute(select(EntityComment.id).where(EntityComment.id == c_dead))).scalars().all()
        assert physical == [c_dead]  # физически на месте — это не каскад PR A


@pytest.mark.asyncio
async def test_parent_alive_subquery_survives_join_to_parent_model(test_user):
    """Регрессия спайка: подзапрос по той же таблице, что во внешнем join,
    терял FROM (auto-correlation) и падал на компиляции."""
    async with AsyncSessionLocal() as db:
        alive = await _obs(db, test_user.id, "sd-pj-1")
        dead = await _obs(db, test_user.id, "sd-pj-2", dead=True)
        c_alive = await _comment(db, test_user.id, "observation", alive.id)
        await _comment(db, test_user.id, "observation", dead.id)
        q = (
            select(EntityComment.id)
            .join(Observation, and_(EntityComment.entity_type == "observation", EntityComment.entity_id == Observation.id))
            .where(parent_alive_subquery(EntityComment.entity_type, EntityComment.entity_id))
        )
        assert (await db.execute(q)).scalars().all() == [c_alive]


@pytest.mark.asyncio
async def test_parent_alive_subquery_string_mode(test_user):
    async with AsyncSessionLocal() as db:
        alive = await _obs(db, test_user.id, "sd-ps-1")
        dead = await _obs(db, test_user.id, "sd-ps-2", dead=True)
        c_alive = await _comment(db, test_user.id, "observation", alive.id)
        await _comment(db, test_user.id, "observation", dead.id)
        q = select(EntityComment.id).where(
            EntityComment.entity_type == "observation",
            parent_alive_subquery("observation", EntityComment.entity_id),
        )
        assert (await db.execute(q)).scalars().all() == [c_alive]


@pytest.mark.asyncio
async def test_policy_functions_treat_dead_as_404_owner_only_with_include_deleted(test_user):
    async with AsyncSessionLocal() as db:
        alive = await _obs(db, test_user.id, "sd-pol-1")
        dead = await _obs(db, test_user.id, "sd-pol-2", dead=True)
        other = test_user.id + 99999

        assert await _status(get_entity_for_view(db, Observation, alive.id, test_user.id)) == 200
        assert await _status(get_entity_for_view(db, Observation, dead.id, test_user.id)) == 404
        assert await _status(get_entity_for_view(db, Observation, dead.id, other, include_deleted=True)) == 404
        assert await _status(get_entity_for_view(db, Observation, dead.id, None, include_deleted=True)) == 404
        assert await _status(get_entity_for_view(db, Observation, dead.id, test_user.id, include_deleted=True)) == 200

        assert await _status(get_entity_for_lab_manage(db, Observation, dead.id, test_user.id)) == 404
        assert await _status(get_entity_for_lab_manage(db, Observation, dead.id, other, include_deleted=True)) == 404
        assert await _status(get_entity_for_lab_manage(db, Observation, dead.id, test_user.id, include_deleted=True)) == 200

        assert await get_live(db, Observation, dead.id) is None
        assert (await get_live(db, Observation, alive.id)).id == alive.id


@pytest.mark.asyncio
async def test_entity_visibility_filter_excludes_dead_and_tolerates_models_without_deleted_at(test_user):
    async with AsyncSessionLocal() as db:
        alive = await _obs(db, test_user.id, "sd-vf-1")
        dead = await _obs(db, test_user.id, "sd-vf-2", dead=True)
        ids = (await db.execute(
            select(Observation.id).where(entity_visibility_filter(Observation, test_user.id))
        )).scalars().all()
        assert alive.id in ids and dead.id not in ids
    # Result — без deleted_at: фильтр не должен ни падать, ни ссылаться на колонку
    assert "deleted_at" not in str(entity_visibility_filter(Result, test_user.id))
