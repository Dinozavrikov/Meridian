"""Версионирование содержимого вложений (EntityAttachmentVersion): замена
файла/текста, список версий, скачивание старой версии, restore, блокировка
операций пока родительская сущность в корзине. Хранилище — во временном
каталоге (см. _tmp_attachments, как в test_attachments_api.py)."""
import io
import os
import zipfile

import pytest
from sqlalchemy import select

from app.db.session import AsyncSessionLocal
from app.models.entities import EntityAttachment, EntityAttachmentVersion, Event
from app.services import attachment_storage as storage
from tests.conftest import create_test_user, add_lab_member
from tests.test_attachments_api import _login, _create_lab, _create_obs, _upload, _upload_one, PY


@pytest.fixture(autouse=True)
def _tmp_attachments(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "ATTACHMENTS_DIR", str(tmp_path / "att"))
    return tmp_path / "att"


def _make_zip_bytes(name="x.txt", content=b"hi") -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr(name, content)
    return buf.getvalue()


async def _replace_file(client, entity_type, entity_id, attachment_id, filename, data, ctype):
    return await client.put(
        f"/api/v1/{entity_type}/{entity_id}/attachments/{attachment_id}/file",
        files={"file": (filename, data, ctype)},
    )


async def _replace_text(client, entity_type, entity_id, attachment_id, text_content, language=None):
    payload = {"text_content": text_content}
    if language is not None:
        payload["language"] = language
    return await client.put(
        f"/api/v1/{entity_type}/{entity_id}/attachments/{attachment_id}/text", json=payload,
    )


async def _versions(client, entity_type, entity_id, attachment_id):
    return await client.get(f"/api/v1/{entity_type}/{entity_id}/attachments/{attachment_id}/versions")


async def _restore(client, entity_type, entity_id, attachment_id, version_id):
    return await client.post(
        f"/api/v1/{entity_type}/{entity_id}/attachments/{attachment_id}/versions/{version_id}/restore"
    )


# --- PUT .../file ---

@pytest.mark.asyncio
async def test_replace_file_creates_version_and_updates_current(client):
    await create_test_user("av_owner1")
    await _login(client, "av_owner1")
    obs = await _create_obs(client)
    att = await _upload_one(client, obs["id"])  # a.py, print(1)

    r = await _replace_file(client, "observation", obs["id"], att["id"], "b.py", b"print(2)\n", "text/plain")
    assert r.status_code == 200, r.text
    updated = r.json()
    assert updated["filename"] == "b.py"
    assert updated["language"] == "python"

    dl = await client.get(updated["download_url"])
    assert dl.content == b"print(2)\n"

    vr = await _versions(client, "observation", obs["id"], att["id"])
    assert vr.status_code == 200
    versions = vr.json()
    assert len(versions) == 1
    v = versions[0]
    assert v["filename"] == "a.py" and v["attachment_id"] == att["id"]

    vdl = await client.get(v["download_url"])
    assert vdl.status_code == 200 and vdl.content == b"print(1)\n"


@pytest.mark.asyncio
async def test_replace_file_rejects_kind_mismatch(client):
    await create_test_user("av_owner2")
    await _login(client, "av_owner2")
    obs = await _create_obs(client)
    att = await _upload_one(client, obs["id"])  # kind=code

    r = await _replace_file(client, "observation", obs["id"], att["id"], "doc.txt", b"just text", "text/plain")
    assert r.status_code == 400, r.text
    assert "Нельзя заменить" in r.json()["detail"]

    dl = await client.get(att["download_url"])
    assert dl.content == b"print(1)\n"
    assert (await _versions(client, "observation", obs["id"], att["id"])).json() == []


@pytest.mark.asyncio
async def test_replace_file_requires_ownership(client):
    await create_test_user("av_owner3")
    member = await create_test_user("av_member3")
    await create_test_user("av_outsider3")
    await _login(client, "av_owner3")
    lab = await _create_lab(client, "AV Lab 3", is_public=False)
    obs = await _create_obs(client, lab_id=lab["id"], visibility="lab")
    att = await _upload_one(client, obs["id"])
    await add_lab_member(lab["id"], member.id)

    await _login(client, "av_member3")  # может читать, не может менять
    r = await _replace_file(client, "observation", obs["id"], att["id"], "b.py", b"print(2)\n", "text/plain")
    assert r.status_code == 404

    await _login(client, "av_outsider3")
    r = await _replace_file(client, "observation", obs["id"], att["id"], "b.py", b"print(2)\n", "text/plain")
    assert r.status_code == 404


# --- PUT .../text ---

@pytest.mark.asyncio
async def test_replace_text_updates_content_language_and_creates_version(client):
    await create_test_user("av_owner4")
    await _login(client, "av_owner4")
    obs = await _create_obs(client)
    att = await _upload_one(client, obs["id"])  # python, "print(1)\n"

    r = await _replace_text(client, "observation", obs["id"], att["id"], "console.log(2)\n", language="javascript")
    assert r.status_code == 200, r.text
    updated = r.json()
    assert updated["language"] == "javascript"
    assert updated["text_content"] == "console.log(2)\n"
    assert updated["filename"] == "a.py"  # имя не меняется

    versions = (await _versions(client, "observation", obs["id"], att["id"])).json()
    assert len(versions) == 1 and versions[0]["language"] == "python"
    vdl = await client.get(versions[0]["download_url"])
    assert vdl.content == b"print(1)\n"


@pytest.mark.asyncio
async def test_replace_text_rejects_other_kind(client):
    await create_test_user("av_owner5")
    await _login(client, "av_owner5")
    obs = await _create_obs(client)
    r = await _upload(client, obs["id"], ("a.zip", _make_zip_bytes(), "application/zip"))
    assert r.status_code == 201, r.text
    att = r.json()["created"][0]
    assert att["kind"] == "other"

    r = await _replace_text(client, "observation", obs["id"], att["id"], "some text")
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_replace_text_rejects_unknown_language(client):
    await create_test_user("av_owner6")
    await _login(client, "av_owner6")
    obs = await _create_obs(client)
    att = await _upload_one(client, obs["id"])
    r = await _replace_text(client, "observation", obs["id"], att["id"], "x = 1\n", language="brainfuck")
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_replace_text_rejects_oversized_text(client, monkeypatch):
    await create_test_user("av_owner7")
    await _login(client, "av_owner7")
    obs = await _create_obs(client)
    att = await _upload_one(client, obs["id"])
    monkeypatch.setattr(storage, "MAX_INLINE_TEXT_BYTES", 10)
    r = await _replace_text(client, "observation", obs["id"], att["id"], "x" * 11)
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_replace_text_rejects_null_bytes(client):
    await create_test_user("av_owner8")
    await _login(client, "av_owner8")
    obs = await _create_obs(client)
    att = await _upload_one(client, obs["id"])
    r = await _replace_text(client, "observation", obs["id"], att["id"], "bad\x00text")
    assert r.status_code == 400


# --- GET .../versions + скачивание версии ---

@pytest.mark.asyncio
async def test_versions_permission_matches_view_access(client):
    await create_test_user("av_owner9")
    member = await create_test_user("av_member9")
    await create_test_user("av_outsider9")
    await _login(client, "av_owner9")
    lab = await _create_lab(client, "AV Lab 9", is_public=False)
    obs = await _create_obs(client, lab_id=lab["id"], visibility="lab")
    att = await _upload_one(client, obs["id"])
    await _replace_file(client, "observation", obs["id"], att["id"], "b.py", b"print(2)\n", "text/plain")
    await add_lab_member(lab["id"], member.id)

    await _login(client, "av_member9")
    vr = await _versions(client, "observation", obs["id"], att["id"])
    assert vr.status_code == 200 and len(vr.json()) == 1
    vdl = await client.get(vr.json()[0]["download_url"])
    assert vdl.status_code == 200 and vdl.content == b"print(1)\n"

    await _login(client, "av_outsider9")
    assert (await _versions(client, "observation", obs["id"], att["id"])).status_code == 404
    assert (await client.get(vr.json()[0]["download_url"])).status_code == 404


# --- restore ---

@pytest.mark.asyncio
async def test_restore_version_copies_file_creates_new_version_and_emits_event(client):
    owner = await create_test_user("av_owner10")
    await _login(client, "av_owner10")
    obs = await _create_obs(client)
    att = await _upload_one(client, obs["id"])  # A: print(1)

    r = await _replace_file(client, "observation", obs["id"], att["id"], "b.py", b"print(2)\n", "text/plain")  # current=B
    assert r.status_code == 200

    versions = (await _versions(client, "observation", obs["id"], att["id"])).json()
    assert len(versions) == 1
    version_a = versions[0]  # хранит A

    rr = await _restore(client, "observation", obs["id"], att["id"], version_a["id"])
    assert rr.status_code == 200, rr.text
    restored = rr.json()
    assert restored["filename"] == "a.py"

    dl = await client.get(restored["download_url"])
    assert dl.content == b"print(1)\n"

    versions2 = (await _versions(client, "observation", obs["id"], att["id"])).json()
    assert len(versions2) == 2, "и B (только что вытесненная), и A (нетронутая) должны остаться версиями"
    contents = set()
    for v in versions2:
        vd = await client.get(v["download_url"])
        contents.add(vd.content)
    assert contents == {b"print(1)\n", b"print(2)\n"}

    async with AsyncSessionLocal() as db:
        current = await db.get(EntityAttachment, att["id"])
        old_version_row = await db.get(EntityAttachmentVersion, version_a["id"])
        assert current.storage_path != old_version_row.storage_path, \
            "restore обязан КОПИРОВАТЬ файл, не расшаривать ссылку на файл версии"

        events = (await db.execute(select(Event).where(
            Event.type == "attachment_version_restored", Event.entity_id == att["id"]
        ))).scalars().all()
    assert len(events) == 1
    ev = events[0]
    assert ev.actor_id == owner.id
    assert ev.related_type == "observation" and ev.related_id == obs["id"]
    assert ev.meta["restored_version_id"] == version_a["id"]


# --- блокировка операций, пока родитель в корзине (решение Алексея, 26.09) ---

@pytest.mark.asyncio
async def test_mutations_blocked_while_parent_in_trash(client):
    await create_test_user("av_owner11")
    await _login(client, "av_owner11")
    obs = await _create_obs(client)
    att = await _upload_one(client, obs["id"])
    assert (await _replace_file(client, "observation", obs["id"], att["id"], "b.py", b"print(2)\n", "text/plain")).status_code == 200
    version_id = (await _versions(client, "observation", obs["id"], att["id"])).json()[0]["id"]

    assert (await client.delete(f"/api/v1/observations/{obs['id']}")).status_code == 204  # soft-delete сущности

    base = f"/api/v1/observation/{obs['id']}/attachments/{att['id']}"
    assert (await _replace_file(client, "observation", obs["id"], att["id"], "c.py", b"x=1\n", "text/plain")).status_code == 404
    assert (await _replace_text(client, "observation", obs["id"], att["id"], "y=2\n")).status_code == 404
    assert (await _restore(client, "observation", obs["id"], att["id"], version_id)).status_code == 404
    assert (await client.delete(base)).status_code == 404
    assert (await client.get(f"/api/v1/attachments/{att['id']}")).status_code == 404, \
        "чтение вложения тоже скрыто (get_entity_for_view прячет soft-deleted родителя даже от владельца)"

    assert (await client.post(f"/api/v1/observation/{obs['id']}/restore")).status_code == 204
    r2 = await _replace_file(client, "observation", obs["id"], att["id"], "c.py", b"x=1\n", "text/plain")
    assert r2.status_code == 200, r2.text
