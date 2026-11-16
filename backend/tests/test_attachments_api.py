"""API вложений: права (owner/member/outsider/guest), классификация,
мягкое удаление, скачивание. Хранилище — во временном каталоге."""
import os
import pytest
from sqlalchemy import select

from app.api.v1.attachments import MAX_FILES_PER_REQUEST
from app.db.session import AsyncSessionLocal
from app.models.entities import EntityAttachment, Event
from app.services import attachment_storage as storage
from tests.conftest import create_test_user, add_lab_member

PY = ("a.py", b"print(1)\n", "application/octet-stream")


@pytest.fixture(autouse=True)
def _tmp_attachments(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "ATTACHMENTS_DIR", str(tmp_path / "att"))
    return tmp_path / "att"


async def _login(client, username, password="pass12345"):
    r = await client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200


async def _create_lab(client, name, is_public=False, open_join=False):
    r = await client.post("/api/v1/labs", json={
        "name": name, "is_public": is_public, "open_join": open_join,
        "goal_type": "task", "new_goal_title": f"Goal for {name}",
    })
    assert r.status_code == 200, r.text
    return r.json()


async def _create_obs(client, lab_id=None, visibility="private", title="Test obs"):
    r = await client.post("/api/v1/observations/", json={
        "title": title, "date": "2026-09-20", "author": "tester", "text": "obs body",
        "lab_id": lab_id, "visibility": visibility,
    })
    assert r.status_code == 201, r.text
    return r.json()


async def _upload(client, entity_id, *files, entity_type="observation"):
    payload = [("files", (name, data, ctype)) for name, data, ctype in files]
    return await client.post(f"/api/v1/{entity_type}/{entity_id}/attachments", files=payload)


async def _upload_one(client, entity_id, entity_type="observation"):
    r = await _upload(client, entity_id, PY, entity_type=entity_type)
    assert r.status_code == 201, r.text
    return r.json()["created"][0]


# --- владелец ---

@pytest.mark.asyncio
async def test_owner_upload_list_detail_download(client):
    await create_test_user("at_owner1")
    await _login(client, "at_owner1")
    obs = await _create_obs(client)
    r = await _upload(client, obs["id"], PY)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["errors"] == []
    att = body["created"][0]
    assert (att["kind"], att["language"], att["filename"], att["has_text_content"]) == ("code", "python", "a.py", True)
    assert "text_content" not in att and "storage_path" not in att

    r = await client.get(f"/api/v1/observation/{obs['id']}/attachments")
    assert r.status_code == 200 and [a["id"] for a in r.json()] == [att["id"]]

    r = await client.get(f"/api/v1/attachments/{att['id']}")
    assert r.status_code == 200 and r.json()["text_content"] == "print(1)\n"

    r = await client.get(att["download_url"])
    assert r.status_code == 200 and r.content == b"print(1)\n"
    assert r.headers["content-disposition"].startswith("attachment")
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["content-type"].startswith("text/plain")


@pytest.mark.asyncio
async def test_client_content_type_is_ignored(client):
    await create_test_user("at_owner2")
    await _login(client, "at_owner2")
    obs = await _create_obs(client)
    r = await _upload(client, obs["id"], ("x.ts", b"const a: number = 1\n", "video/mp2t"))
    assert r.status_code == 201, r.text
    att = r.json()["created"][0]
    assert (att["kind"], att["language"], att["mime_type"]) == ("code", "typescript", "text/plain")


@pytest.mark.asyncio
async def test_rejected_files_are_reported_and_valid_ones_kept(client):
    await create_test_user("at_owner3")
    await _login(client, "at_owner3")
    obs = await _create_obs(client)
    r = await _upload(client, obs["id"], PY,
                      ("bad.html", b"<script>alert(1)</script>", "text/html"),
                      ("p.png", b"\x89PNG....", "image/png"))
    assert r.status_code == 201, r.text
    body = r.json()
    assert len(body["created"]) == 1 and len(body["errors"]) == 2
    assert any(e.startswith("bad.html:") for e in body["errors"])
    assert any(e.startswith("p.png:") for e in body["errors"])

    r = await _upload(client, obs["id"], ("bad.html", b"<b>x</b>", "text/html"))
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_limits_files_per_request_and_file_size(client, monkeypatch):
    await create_test_user("at_owner4")
    await _login(client, "at_owner4")
    obs = await _create_obs(client)
    many = [(f"f{i}.py", b"x = 1\n", "text/plain") for i in range(MAX_FILES_PER_REQUEST + 1)]
    r = await _upload(client, obs["id"], *many)
    assert r.status_code == 400

    monkeypatch.setattr(storage, "MAX_ATTACHMENT_SIZE", 50)
    r = await _upload(client, obs["id"], ("big.py", b"x" * 51, "text/plain"))
    assert r.status_code == 400 and "больше" in r.json()["detail"]


# --- чужие, гость ---

@pytest.mark.asyncio
async def test_private_entity_attachments_hidden_from_outsider_and_guest(client):
    await create_test_user("at_owner5")
    await create_test_user("at_outsider5")
    await _login(client, "at_owner5")
    obs = await _create_obs(client)
    att = await _upload_one(client, obs["id"])
    base = f"/api/v1/observation/{obs['id']}/attachments"

    await _login(client, "at_outsider5")
    assert (await client.get(base)).status_code == 404
    assert (await client.get(f"/api/v1/attachments/{att['id']}")).status_code == 404
    assert (await client.get(att["download_url"])).status_code == 404
    assert (await _upload(client, obs["id"], PY)).status_code == 404
    assert (await client.delete(f"{base}/{att['id']}")).status_code == 404

    client.cookies.clear()
    assert (await client.get(base)).status_code == 404
    assert (await client.get(att["download_url"])).status_code == 404
    assert (await _upload(client, obs["id"], PY)).status_code in (401, 403)


@pytest.mark.asyncio
async def test_lab_member_can_read_but_not_write_outsider_nothing(client):
    await create_test_user("at_owner6")
    member = await create_test_user("at_member6")
    await create_test_user("at_outsider6")
    await _login(client, "at_owner6")
    lab = await _create_lab(client, "Attach Lab 6", is_public=False)
    obs = await _create_obs(client, lab_id=lab["id"], visibility="lab")
    att = await _upload_one(client, obs["id"])
    await add_lab_member(lab["id"], member.id)
    base = f"/api/v1/observation/{obs['id']}/attachments"

    await _login(client, "at_member6")
    r = await client.get(base)
    assert r.status_code == 200 and [a["id"] for a in r.json()] == [att["id"]]
    assert (await client.get(f"/api/v1/attachments/{att['id']}")).json()["text_content"] == "print(1)\n"
    assert (await client.get(att["download_url"])).content == b"print(1)\n"
    assert (await _upload(client, obs["id"], PY)).status_code == 404
    assert (await client.delete(f"{base}/{att['id']}")).status_code == 404

    await _login(client, "at_outsider6")
    assert (await client.get(base)).status_code == 404
    assert (await client.get(att["download_url"])).status_code == 404


@pytest.mark.asyncio
async def test_public_entity_attachments_readable_by_guest(client):
    await create_test_user("at_owner7")
    await _login(client, "at_owner7")
    obs = await _create_obs(client, visibility="public")
    att = await _upload_one(client, obs["id"])

    client.cookies.clear()
    r = await client.get(f"/api/v1/observation/{obs['id']}/attachments")
    assert r.status_code == 200 and [a["id"] for a in r.json()] == [att["id"]]
    assert (await client.get(att["download_url"])).content == b"print(1)\n"


# --- мягкое удаление ---

@pytest.mark.asyncio
async def test_soft_delete_hides_keeps_file_and_logs_event(client, _tmp_attachments):
    owner = await create_test_user("at_owner8")
    await _login(client, "at_owner8")
    obs = await _create_obs(client)
    att = await _upload_one(client, obs["id"])
    path = f"/api/v1/observation/{obs['id']}/attachments/{att['id']}"

    assert (await client.delete(path)).status_code == 204
    assert (await client.get(f"/api/v1/observation/{obs['id']}/attachments")).json() == []
    assert (await client.get(att["download_url"])).status_code == 404
    assert (await client.get(f"/api/v1/attachments/{att['id']}")).status_code == 404
    assert len(os.listdir(_tmp_attachments)) == 1  # файл физически на месте (undo/GC)
    assert (await client.delete(path)).status_code == 404

    async with AsyncSessionLocal() as db:
        row = await db.get(EntityAttachment, att["id"])
        assert row.deleted_at is not None
        events = (await db.execute(select(Event).where(
            Event.entity_type == "attachment", Event.entity_id == att["id"]))).scalars().all()
        assert len(events) == 1 and events[0].type == "updated" and events[0].actor_id == owner.id
        assert "deleted_at" in events[0].meta["changed_fields"]


# --- прочее ---

@pytest.mark.asyncio
@pytest.mark.parametrize("etype", ["result", "nonsense", "attachment"])
async def test_unsupported_entity_types_are_404(client, etype):
    await create_test_user(f"at_owner9_{etype}")
    await _login(client, f"at_owner9_{etype}")
    assert (await client.get(f"/api/v1/{etype}/1/attachments")).status_code == 404
    assert (await _upload(client, 1, PY, entity_type=etype)).status_code == 404


@pytest.mark.asyncio
async def test_download_404_when_file_missing_on_disk(client, _tmp_attachments):
    await create_test_user("at_owner10")
    await _login(client, "at_owner10")
    obs = await _create_obs(client)
    att = await _upload_one(client, obs["id"])
    for name in os.listdir(_tmp_attachments):
        os.remove(_tmp_attachments / name)
    assert (await client.get(att["download_url"])).status_code == 404
