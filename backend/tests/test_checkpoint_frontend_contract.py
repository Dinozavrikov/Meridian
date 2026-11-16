"""Контракт бэкенда для интерфейса снимков: у файлов в просмотре есть item_id, по которому они скачиваются
(раньше id в просмотре не отдавался — скачать файл из интерфейса было невозможно); эндпоинт занятого места."""
import pytest

from app.db.session import AsyncSessionLocal
from app.models.entities import EntityAttachment, Observation
from app.services import lab_checkpoints as svc
from tests.conftest import create_test_user
from tests.test_lab_checkpoints import _dirs, _lab_kw, _mk, _snapshot, _url, _view, _world  # noqa: F401
from tests.test_undo import _login


@pytest.mark.asyncio
async def test_view_exposes_item_id_and_the_file_downloads_by_it(client, _dirs):
    (_dirs.atts / "u1.txt").write_bytes(b"data")
    w = await _world("owner")
    async with AsyncSessionLocal() as db:
        owner = w.uid["owner"]
        obs = await _mk(db, Observation, owner, title="o", text="o", **_lab_kw(w.lab_id))
        await _mk(db, EntityAttachment, owner, entity_type="observation", entity_id=obs.id, kind="code", filename="a.txt",
                  mime_type="text/plain", size_bytes=4, storage_path="u1.txt", language=None, text_content="data")
        await db.commit()
        obs_id = obs.id
    await _login(client, "owner")
    cp = await _snapshot(client, w.lab_id)
    view = await _view(client, w.lab_id, cp["id"])
    node = next(n for n in view["entities"]["observation"] if n["entity_id"] == obs_id)
    att = node["children"]["attachment"][0]
    assert isinstance(att["item_id"], int) and att["blob_sha256"] and att["file_missing"] is False
    r = await client.get(_url(w.lab_id, f"/{cp['id']}/files/{att['item_id']}"))
    assert r.status_code == 200 and r.content == b"data"


@pytest.mark.asyncio
async def test_storage_endpoint_reports_real_usage_to_members_only(client):
    w = await _world("owner", public=True)
    await create_test_user("stranger")
    async with AsyncSessionLocal() as db:
        await _mk(db, Observation, w.uid["owner"], title="o", text="o", **_lab_kw(w.lab_id))
        await db.commit()
    await _login(client, "owner")
    empty = await client.get(_url(w.lab_id, "/storage"))
    assert empty.status_code == 200, empty.text                    # «storage» не принят за {cid}
    assert empty.json() == {"used_bytes": 0, "budget_bytes": svc.LAB_BUDGET_BYTES, "warn": False}
    await _snapshot(client, w.lab_id)
    async with AsyncSessionLocal() as db:
        used = await svc.lab_storage_bytes(db, w.lab_id)
    got = (await client.get(_url(w.lab_id, "/storage"))).json()
    assert got["used_bytes"] == used and used > 0
    await _login(client, "stranger")                               # публичная лаба, но не участник
    assert (await client.get(_url(w.lab_id, "/storage"))).status_code == 404


from app.models.social import EntityComment  # noqa: E402
from tests.test_lab_checkpoints_stage2 import _publish  # noqa: E402


@pytest.mark.asyncio
async def test_member_view_resolves_usernames_outsider_view_has_none(client):
    w = await _world("owner", "member1", public=True)
    await create_test_user("stranger")
    async with AsyncSessionLocal() as db:
        obs = await _mk(db, Observation, w.uid["owner"], title="o", text="o", **_lab_kw(w.lab_id))
        await _mk(db, EntityComment, w.uid["member1"], entity_type="observation", entity_id=obs.id,
                  author_id=w.uid["member1"], content="привет")
        await db.commit()
    await _login(client, "owner")
    cp = await _snapshot(client, w.lab_id)
    view = await _view(client, w.lab_id, cp["id"])
    assert view["users"] == {str(w.uid["owner"]): "owner", str(w.uid["member1"]): "member1"}

    assert (await _publish(client, w.lab_id, cp["id"])).status_code == 200
    await _login(client, "stranger")                       # публичная лаба, не участник: видит только опубликованное
    pub = await client.get(_url(w.lab_id, f"/{cp['id']}"))
    assert pub.status_code == 200 and "users" not in pub.json()
