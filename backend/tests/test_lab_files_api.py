"""GET /labs/{id}/files: файлы живых записей лаборатории с привязкой к записи, только участникам."""
from datetime import datetime, timezone

import pytest
from sqlalchemy import text

from app.api.v1 import labs as labs_api
from app.db.session import AsyncSessionLocal
from app.models.entities import EntityAttachment, EntityImage, Observation
from tests.conftest import create_test_user
from tests.test_lab_checkpoints import _lab, _lab_kw, _mk, _six, _world
from tests.test_undo import _login


async def _att(db, etype, entity_id, uid, name, **kw):
    return await _mk(db, EntityAttachment, uid, entity_type=etype, entity_id=entity_id, kind="code", filename=name,
                     mime_type="text/plain", size_bytes=10, storage_path=f"p-{name}", language=None, text_content="x", **kw)


@pytest.mark.asyncio
async def test_lab_files_lists_files_of_live_lab_records_with_their_entity(client):
    w = await _world("owner", "member1", public=True)
    await create_test_user("stranger")
    owner, m1 = w.uid["owner"], w.uid["member1"]
    async with AsyncSessionLocal() as db:
        six = await _six(db, owner, w.lab_id)
        trashed = await _mk(db, Observation, owner, title="В корзине", text="x", **_lab_kw(w.lab_id))
        personal = await _mk(db, Observation, owner, title="Личная", text="x")
        other_lab = await _lab(db, owner)
        foreign = await _mk(db, Observation, owner, title="Чужая лаба", text="x", **_lab_kw(other_lab.id))
        a1 = await _att(db, "observation", six["observation"].id, owner, "a1.txt")
        a2 = await _att(db, "hypothesis", six["hypothesis"].id, m1, "a2.txt")
        await _att(db, "observation", six["observation"].id, owner, "deleted.txt", deleted_at=datetime.now(timezone.utc))
        await _att(db, "observation", trashed.id, owner, "trash.txt")
        await _att(db, "observation", personal.id, owner, "personal.txt")
        await _att(db, "observation", foreign.id, owner, "foreign.txt")
        img = await _mk(db, EntityImage, owner, entity_type="prediction", entity_id=six["prediction"].id, filename="img.jpg",
                        thumb_filename="img_t.jpg", size_bytes=2048, description="Фото")
        await db.execute(text("UPDATE observations SET deleted_at = now() WHERE id = :i"), {"i": trashed.id})
        ids = {"a1": a1.id, "a2": a2.id, "hyp": six["hypothesis"].id, "pred": six["prediction"].id, "obs": six["observation"].id}
        await db.commit()

    await _login(client, "member1")                       # обычный участник видит файлы и чужих записей
    r = await client.get(f"/api/v1/labs/{w.lab_id}/files")
    assert r.status_code == 200, r.text
    body = r.json()
    by_name = {i["name"]: i for i in body["items"]}
    assert set(by_name) == {"a1.txt", "a2.txt", "Фото"}          # корзина, удалённое, личное и чужая лаба не входят
    assert body["count"] == 3 and body["truncated"] is False and body["total_bytes"] == 10 + 10 + 2048

    a = by_name["a2.txt"]
    assert (a["entity_type"], a["entity_id"], a["entity_title"]) == ("hypothesis", ids["hyp"], "H")
    assert a["uploader_username"] == "member1" and a["kind"] == "attachment"
    assert a["download_url"] == f"/api/v1/attachments/{ids['a2']}/download" and a["url"] is None
    first = by_name["a1.txt"]
    assert (first["entity_type"], first["entity_id"], first["entity_title"]) == ("observation", ids["obs"], "O")
    assert first["uploader_username"] == "owner"
    im = by_name["Фото"]
    assert im["kind"] == "image" and im["url"] == "/api/uploads/entity_images/img.jpg"
    assert im["thumb_url"] == "/api/uploads/entity_images/img_t.jpg" and im["download_url"] is None
    assert (im["entity_type"], im["entity_id"], im["entity_title"]) == ("prediction", ids["pred"], "P")

    await _login(client, "stranger")                      # публичная лаборатория, но не участник
    assert (await client.get(f"/api/v1/labs/{w.lab_id}/files")).status_code == 404


@pytest.mark.asyncio
async def test_lab_files_newest_first_and_capped(client, monkeypatch):
    w = await _world("owner")
    async with AsyncSessionLocal() as db:
        obs = await _mk(db, Observation, w.uid["owner"], title="o", text="x", **_lab_kw(w.lab_id))
        for k in (1, 3, 2):                               # создаём не по порядку: порядок должен идти от даты, а не от id
            await _att(db, "observation", obs.id, w.uid["owner"], f"f{k}.txt", created_at=datetime(2026, 1, k))
        await db.commit()
    await _login(client, "owner")
    monkeypatch.setattr(labs_api, "MAX_LAB_FILES", 2)
    body = (await client.get(f"/api/v1/labs/{w.lab_id}/files")).json()
    assert [i["name"] for i in body["items"]] == ["f3.txt", "f2.txt"]
    assert body["count"] == 3 and body["truncated"] is True


from sqlalchemy import select  # noqa: E402
from app.models.user import User  # noqa: E402


@pytest.mark.asyncio
@pytest.mark.parametrize("goal_type", ["question", "task"])
async def test_files_of_the_labs_goal_show_up_in_lab_files(client, goal_type):
    """Цель лаборатории (задача или вопрос) — обычная запись лаборатории: её файлы видны во вкладке «Файлы»
    без отдельного механизма. Цель создаёт сам POST /labs, тест не подставляет lab_id руками."""
    await create_test_user("owner")
    await _login(client, "owner")
    r = await client.post("/api/v1/labs", follow_redirects=True, json={
        "name": "L", "description": "d", "goal_type": goal_type, "new_goal_title": "Цель", "is_public": False})
    assert r.status_code in (200, 201), r.text
    lab = r.json()
    async with AsyncSessionLocal() as db:
        uid = (await db.execute(select(User.id).where(User.username == "owner"))).scalar_one()
        await _att(db, goal_type, lab["goal_id"], uid, "protocol.txt")
        await db.commit()
    body = (await client.get(f"/api/v1/labs/{lab['id']}/files")).json()
    assert [(i["name"], i["entity_type"], i["entity_title"]) for i in body["items"]] == [("protocol.txt", goal_type, "Цель")]
