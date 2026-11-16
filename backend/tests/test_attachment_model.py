"""EntityAttachment: модель + интеграция с ORM event-log (Шаг 2, п.1, 2, 4)."""
import pytest
from datetime import datetime, timezone
from sqlalchemy import select

from app.db.session import AsyncSessionLocal
from app.models.entities import EntityAttachment, Event


def _make(user_id: int, **kw) -> EntityAttachment:
    base = dict(
        user_id=user_id, entity_type="observation", entity_id=1, kind="code",
        filename="a.py", storage_path="abc123.py", mime_type="text/x-python",
        size_bytes=11, language="python", text_content="print('hi')",
    )
    base.update(kw)
    return EntityAttachment(**base)


async def _events(db, attachment_id: int) -> list[Event]:
    return (await db.execute(
        select(Event).where(Event.entity_type == "attachment", Event.entity_id == attachment_id).order_by(Event.id)
    )).scalars().all()


@pytest.mark.asyncio
async def test_soft_delete_is_logged_as_updated_with_deleted_at(test_user):
    async with AsyncSessionLocal() as db:
        db.sync_session.info["actor_id"] = test_user.id
        att = _make(test_user.id)
        db.add(att)
        await db.commit()
        await db.refresh(att)
        assert await _events(db, att.id) == []  # created ORM-слоем не логируется

        att.deleted_at = datetime(2026, 9, 20, 12, 0, tzinfo=timezone.utc)
        await db.commit()

        events = await _events(db, att.id)
        assert len(events) == 1 and events[0].type == "updated"
        assert events[0].meta["changed_fields"] == {
            "deleted_at": {"old": None, "new": "2026-09-20T12:00:00+00:00"},
        }
        assert events[0].actor_id == test_user.id
        assert events[0].lab_id is None and events[0].visibility == "private"


@pytest.mark.asyncio
async def test_text_content_change_participates_in_diff(test_user):
    async with AsyncSessionLocal() as db:
        db.sync_session.info["actor_id"] = test_user.id
        att = _make(test_user.id)
        db.add(att)
        await db.commit()
        await db.refresh(att)

        att.text_content = "print('bye')"
        await db.commit()

        events = await _events(db, att.id)
        assert len(events) == 1
        assert events[0].meta["changed_fields"] == {
            "text_content": {"old": "print('hi')", "new": "print('bye')"},
        }


@pytest.mark.asyncio
async def test_hard_delete_snapshot_keeps_storage_path(test_user):
    async with AsyncSessionLocal() as db:
        db.sync_session.info["actor_id"] = test_user.id
        att = _make(test_user.id)
        db.add(att)
        await db.commit()
        await db.refresh(att)
        att_id = att.id

        await db.delete(att)
        await db.commit()

        events = await _events(db, att_id)
        assert len(events) == 1 and events[0].type == "deleted"
        snap = events[0].meta["snapshot"]
        assert snap["storage_path"] == "abc123.py" and snap["kind"] == "code" and snap["filename"] == "a.py"
        assert isinstance(snap["created_at"], str)  # datetime сериализован
