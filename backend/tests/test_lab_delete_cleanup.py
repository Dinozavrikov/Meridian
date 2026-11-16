"""Удаление лаборатории не должно оставлять сирот среди строк без FK: стадия лабы (entity_stages, entity_type='lab'),
переводы её названия/описания и переводы сообщений её заявок (content_translations). Обычный каскад по 6 базовым типам
записей их не касается, а сами заявки уходят каскадом по FK — их переводы нет."""
import pytest
from sqlalchemy import func, select

from app.db.session import AsyncSessionLocal
from app.models.entities import EntityStage
from app.models.i18n import ContentTranslation
from app.models.social import LabJoinRequest
from tests.test_lab_checkpoints import _mk, _world
from tests.test_undo import _login


async def _count(db, model, **eq):
    stmt = select(func.count()).select_from(model)
    for k, v in eq.items():
        stmt = stmt.where(getattr(model, k) == v)
    return (await db.execute(stmt)).scalar_one()


@pytest.mark.asyncio
async def test_deleting_a_lab_removes_its_own_stage_row(client):
    w = await _world("owner")
    async with AsyncSessionLocal() as db:
        await _mk(db, EntityStage, w.uid["owner"], entity_type="lab", entity_id=w.lab_id, current_stage="research")
        await db.commit()
    await _login(client, "owner")
    r = await client.delete(f"/api/v1/labs/{w.lab_id}")
    assert r.status_code < 300, r.text
    async with AsyncSessionLocal() as db:
        left = await _count(db, EntityStage, entity_type="lab", entity_id=w.lab_id)
    assert left == 0, "стадия удалённой лаборатории осталась в entity_stages (сирота без FK)"


@pytest.mark.asyncio
async def test_deleting_a_lab_removes_translations_of_the_lab_and_of_its_join_requests_only(client):
    w = await _world("owner", "applicant")
    other_lab_id = w.lab_id + 100000                       # чужая лаборатория (её перевод должен остаться)
    async with AsyncSessionLocal() as db:
        req = await _mk(db, LabJoinRequest, w.uid["applicant"], lab_id=w.lab_id, message="привет")
        req_id = req.id
        mk = lambda et, eid, field: _mk(db, ContentTranslation, w.uid["owner"], entity_type=et, entity_id=eid, field=field,
                                        target_lang="en", translated_text="t", source_hash="h")
        await mk("lab", w.lab_id, "name")
        await mk("lab", w.lab_id, "description")
        await mk("lab_join_request", req_id, "message")
        await mk("lab", other_lab_id, "name")
        await db.commit()
    await _login(client, "owner")
    r = await client.delete(f"/api/v1/labs/{w.lab_id}")
    assert r.status_code < 300, r.text
    async with AsyncSessionLocal() as db:
        assert await _count(db, ContentTranslation, entity_type="lab", entity_id=w.lab_id) == 0
        assert await _count(db, ContentTranslation, entity_type="lab_join_request", entity_id=req_id) == 0
        assert await _count(db, ContentTranslation, entity_type="lab", entity_id=other_lab_id) == 1   # чужое не тронуто
