"""Тесты ORM-driven event log (before_flush listener, см. app/services/
event_log.py) — Event Log Шаг 1. Дополняет ручной emit_event() (roцты
create/status_changed/etc.) автоматической фиксацией update/delete."""
import pytest
from sqlalchemy import select

from app.db.session import AsyncSessionLocal
from app.models.entities import Event, Observation, Hypothesis, EntityAttachment
from app.schemas.entities import TaskCreate, TaskUpdate
from app.api.v1.tasks import create_task, update_task


async def _events_for(db, entity_type: str, entity_id: int) -> list[Event]:
    rows = (await db.execute(
        select(Event).where(Event.entity_type == entity_type, Event.entity_id == entity_id).order_by(Event.id)
    )).scalars().all()
    return rows


@pytest.mark.asyncio
async def test_update_real_field_creates_one_updated_event(test_user):
    async with AsyncSessionLocal() as db:
        db.sync_session.info["actor_id"] = test_user.id

        obs = Observation(
            user_id=test_user.id, date="2026-09-18", author="t", title="t",
            text="исходный текст", status="осмысленное", importance=0,
            visibility="private", lab_id=None,
        )
        db.add(obs)
        await db.commit()
        await db.refresh(obs)

        obs.text = "изменённый текст"
        await db.commit()

        events = await _events_for(db, "observation", obs.id)
        assert len(events) == 1
        assert events[0].type == "updated"
        assert events[0].meta["changed_fields"] == {"text": {"old": "исходный текст", "new": "изменённый текст"}}
        assert events[0].actor_id == test_user.id


@pytest.mark.asyncio
async def test_update_with_no_actual_change_creates_no_event(test_user):
    """Attribute history должна отличать 'переслано, но не изменилось' от
    реального изменения — не просто 'поле было в UPDATE SET'."""
    async with AsyncSessionLocal() as db:
        db.sync_session.info["actor_id"] = test_user.id

        obs = Observation(
            user_id=test_user.id, date="2026-09-18", author="t", title="t",
            text="текст", status="осмысленное", importance=0,
            visibility="private", lab_id=None,
        )
        db.add(obs)
        await db.commit()
        await db.refresh(obs)

        obs.text = "текст"  # то же самое значение
        await db.commit()

        events = await _events_for(db, "observation", obs.id)
        assert len(events) == 0


@pytest.mark.asyncio
async def test_update_only_excluded_cache_field_creates_no_event(test_user):
    async with AsyncSessionLocal() as db:
        db.sync_session.info["actor_id"] = test_user.id

        obs = Observation(
            user_id=test_user.id, date="2026-09-18", author="t", title="t",
            text="текст", status="осмысленное", importance=0,
            visibility="private", lab_id=None,
        )
        db.add(obs)
        await db.commit()
        await db.refresh(obs)

        obs.content_kind = "fact"  # фоновая классификация, не пользовательское действие
        await db.commit()

        events = await _events_for(db, "observation", obs.id)
        assert len(events) == 0


@pytest.mark.asyncio
async def test_update_hypothesis_cache_fields_excluded_but_real_field_still_tracked(test_user):
    """Смешанный update в одном flush: кэш-поля исключены индивидуально,
    реальное изменение всё равно фиксируется — не 'всё или ничего'."""
    async with AsyncSessionLocal() as db:
        db.sync_session.info["actor_id"] = test_user.id

        hyp = Hypothesis(
            user_id=test_user.id, name="h", description="desc",
            date_created="2026-09-18", status="идея", stability=5, research_load=5,
            maturity=0, risk=5, visibility="private", lab_id=None,
        )
        db.add(hyp)
        await db.commit()
        await db.refresh(hyp)

        hyp.description = "новое описание"
        hyp.evidence_diversity_cache = {"foo": "bar"}
        hyp.evidence_signal = 0.42
        await db.commit()

        events = await _events_for(db, "hypothesis", hyp.id)
        assert len(events) == 1
        assert events[0].meta["changed_fields"] == {"description": {"old": "desc", "new": "новое описание"}}


@pytest.mark.asyncio
async def test_delete_creates_full_column_snapshot(test_user):
    async with AsyncSessionLocal() as db:
        obs = Observation(
            user_id=test_user.id, date="2026-09-18", author="t", title="t",
            text="текст для удаления", status="осмысленное", importance=0,
            visibility="private", lab_id=None,
        )
        db.add(obs)
        await db.commit()
        await db.refresh(obs)
        obs_id = obs.id

        await db.delete(obs)
        await db.commit()

        events = await _events_for(db, "observation", obs_id)
        assert len(events) == 1
        assert events[0].type == "deleted"
        snapshot = events[0].meta["snapshot"]
        assert snapshot["text"] == "текст для удаления"
        assert snapshot["id"] == obs_id
        # relationships не должны попадать в снапшот — только колонки
        assert "_sa_instance_state" not in snapshot


@pytest.mark.asyncio
async def test_status_change_via_route_creates_both_status_changed_and_updated(test_user):
    """Осознанное дублирование: ручной status_changed (роут) + автоматический
    updated (ORM) — оба события должны присутствовать, это не баг."""
    async with AsyncSessionLocal() as db:
        db.sync_session.info["actor_id"] = test_user.id

        body = TaskCreate(name="t", description="d", status="открыта", progress=0, visibility="private")
        out = await create_task(body, test_user, db)

        body2 = TaskUpdate(name="t", description="d", status="закрыта", progress=0, visibility="private")
        await update_task(out.id, body2, test_user, db)

        events = await _events_for(db, "task", out.id)
        types = [e.type for e in events]
        assert "status_changed" in types
        assert "updated" in types
        updated_event = next(e for e in events if e.type == "updated")
        assert "status" in updated_event.meta["changed_fields"]
        assert updated_event.meta["changed_fields"]["status"] == {"old": "открыта", "new": "закрыта"}


@pytest.mark.asyncio
async def test_background_writer_without_http_context_uses_system_actor():
    """Симулирует фоновый джоб (напр. prediction_reminders.py) — actor_id
    проставлен на system-пользователя явно, не через get_current_user()."""
    from app.core.entity_registry import get_system_user_id

    async with AsyncSessionLocal() as db:
        system_id = await get_system_user_id(db)
        db.sync_session.info["actor_id"] = system_id

        obs = Observation(
            user_id=system_id, date="2026-09-18", author="system", title="t",
            text="текст", status="осмысленное", importance=0,
            visibility="private", lab_id=None,
        )
        db.add(obs)
        await db.commit()
        await db.refresh(obs)

        obs.text = "изменено фоновым процессом"
        await db.commit()

        events = await _events_for(db, "observation", obs.id)
        assert len(events) == 1
        assert events[0].actor_id == system_id


@pytest.mark.asyncio
async def test_json_safe_converts_non_json_types():
    """Регресс: ветка updated падала на datetime в meta (json.dumps)."""
    import json
    from datetime import datetime, date, timezone
    from decimal import Decimal
    from uuid import UUID
    from app.services.event_log import _json_safe

    dt = datetime(2026, 9, 20, 12, 0, tzinfo=timezone.utc)
    out = _json_safe({"a": dt, "b": [date(2026, 9, 20), Decimal("1.5")], "c": UUID(int=1), "d": None, "e": 3})
    json.dumps(out)  # не должно падать
    assert out["a"] == dt.isoformat()
    assert out["b"] == ["2026-09-20", "1.5"]
    assert out["c"] == str(UUID(int=1))
    assert out["d"] is None and out["e"] == 3


@pytest.mark.asyncio
async def test_update_datetime_field_is_json_serialized(test_user):
    """Регресс: изменение datetime-колонки (Prediction.expected_check_date)
    роняло flush — json.dumps не умеет datetime в Event.meta (ветка updated)."""
    from datetime import datetime, timezone
    from app.models.entities import Prediction

    async with AsyncSessionLocal() as db:
        db.sync_session.info["actor_id"] = test_user.id
        old = datetime(2026, 10, 1, 12, 0, tzinfo=timezone.utc)
        new = datetime(2026, 11, 1, 12, 0, tzinfo=timezone.utc)
        pred = Prediction(
            user_id=test_user.id, title="t", slug="t-pred-dt", text="x",
            date_created="2026-09-20", expected_check_date=old,
            visibility="private", lab_id=None,
        )
        db.add(pred)
        await db.commit()
        await db.refresh(pred)

        pred.expected_check_date = new
        await db.commit()

        events = await _events_for(db, "prediction", pred.id)
        assert len(events) == 1
        assert events[0].type == "updated"
        assert events[0].meta["changed_fields"]["expected_check_date"] == {
            "old": old.isoformat(), "new": new.isoformat(),
        }

# --- visibility/lab_id для событий по вложениям (EntityAttachment) ---
#
# EntityAttachment не имеет своих колонок visibility/lab_id (это атрибуты
# родительской сущности), но входит в EVENT_LOGGED_MODELS — раньше
# _capture_event_log брал их через getattr(obj, ..., default), который на
# attachment всегда возвращал default ("private"/None), независимо от
# реальной видимости родителя. Баг найден и исправлен при версионировании
# вложений (26.09) — см. _resolve_visibility_lab в event_log.py.

@pytest.mark.asyncio
async def test_attachment_updated_event_uses_parent_visibility_not_default(test_user):
    async with AsyncSessionLocal() as db:
        db.sync_session.info["actor_id"] = test_user.id

        obs = Observation(
            user_id=test_user.id, date="2026-09-26", author="t", title="t",
            text="текст", status="осмысленное", importance=0,
            visibility="public", lab_id=None,
        )
        db.add(obs)
        await db.commit()
        await db.refresh(obs)

        att = EntityAttachment(
            user_id=test_user.id, entity_type="observation", entity_id=obs.id,
            kind="code", filename="a.py", storage_path="does-not-matter.py",
            mime_type="text/x-python", size_bytes=1,
        )
        db.add(att)
        await db.commit()
        await db.refresh(att)

        att.filename = "b.py"
        await db.commit()

        events = await _events_for(db, "attachment", att.id)
        assert len(events) == 1
        assert events[0].type == "updated"
        assert events[0].visibility == "public", (
            "до фикса здесь всегда было 'private' — getattr(att, 'visibility', 'private') "
            "молча подставлял дефолт, игнорируя реальную видимость родителя"
        )
        assert events[0].lab_id is None


@pytest.mark.asyncio
async def test_attachment_updated_event_uses_parent_lab_id(test_user):
    from app.models.social import Lab, LabMember

    async with AsyncSessionLocal() as db:
        db.sync_session.info["actor_id"] = test_user.id

        lab = Lab(owner_id=test_user.id, name="Event Log Lab", slug="event-log-lab-test", is_public=False)
        db.add(lab)
        await db.commit()
        await db.refresh(lab)
        db.add(LabMember(lab_id=lab.id, user_id=test_user.id, role="owner"))
        await db.commit()

        obs = Observation(
            user_id=test_user.id, date="2026-09-26", author="t", title="t",
            text="текст", status="осмысленное", importance=0,
            visibility="lab", lab_id=lab.id,
        )
        db.add(obs)
        await db.commit()
        await db.refresh(obs)

        att = EntityAttachment(
            user_id=test_user.id, entity_type="observation", entity_id=obs.id,
            kind="code", filename="a.py", storage_path="does-not-matter2.py",
            mime_type="text/x-python", size_bytes=1,
        )
        db.add(att)
        await db.commit()
        await db.refresh(att)

        att.filename = "b.py"
        await db.commit()

        events = await _events_for(db, "attachment", att.id)
        assert len(events) == 1
        assert events[0].visibility == "lab"
        assert events[0].lab_id == lab.id, (
            "до фикса здесь всегда было None — getattr(att, 'lab_id', None) "
            "молча подставлял дефолт, игнорируя lab_id родителя"
        )


@pytest.mark.asyncio
async def test_attachment_deleted_event_uses_parent_visibility(test_user):
    async with AsyncSessionLocal() as db:
        obs = Observation(
            user_id=test_user.id, date="2026-09-26", author="t", title="t",
            text="текст", status="осмысленное", importance=0,
            visibility="public", lab_id=None,
        )
        db.add(obs)
        await db.commit()
        await db.refresh(obs)

        att = EntityAttachment(
            user_id=test_user.id, entity_type="observation", entity_id=obs.id,
            kind="code", filename="a.py", storage_path="does-not-matter3.py",
            mime_type="text/x-python", size_bytes=1,
        )
        db.add(att)
        await db.commit()
        await db.refresh(att)
        att_id = att.id

        await db.delete(att)
        await db.commit()

        events = await _events_for(db, "attachment", att_id)
        assert len(events) == 1
        assert events[0].type == "deleted"
        assert events[0].visibility == "public", (
            "snapshot.get('visibility', 'private') до фикса всегда давал 'private' "
            "для attachment — у самой строки нет такой колонки, снимок её не содержит"
        )

