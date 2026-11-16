"""Доступ к изображениям сущностей (EntityImage). Чтение списка — по правилам
видимости самой сущности (владелец / участник лабы / гость для public),
загрузка и удаление — только владелец. Раньше читать мог только владелец,
хотя вкладка изображений показывается и остальным (ImagesTab, isOwner)."""
import io
import pytest
from PIL import Image

from app.api.v1 import images as images_module
from tests.conftest import create_test_user, add_lab_member


@pytest.fixture(autouse=True)
def _isolate_images(tmp_path, monkeypatch):
    img_dir = tmp_path / "img"
    img_dir.mkdir()
    monkeypatch.setattr(images_module, "IMAGES_DIR", str(img_dir))

    async def _no_description(*args, **kwargs):  # vision-модель в тестах не дёргаем
        return None
    monkeypatch.setattr(images_module, "generate_image_description", _no_description)


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


def _png() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (8, 8), (200, 30, 30)).save(buf, "PNG")
    return buf.getvalue()


async def _upload_image(client, entity_id, entity_type="observation"):
    r = await client.post(f"/api/v1/{entity_type}/{entity_id}/images",
                          files=[("files", ("p.png", _png(), "image/png"))])
    assert r.status_code == 201, r.text
    return r.json()[0]


@pytest.mark.asyncio
async def test_owner_uploads_and_lists_own_images(client):
    await create_test_user("im_owner1")
    await _login(client, "im_owner1")
    obs = await _create_obs(client)
    img = await _upload_image(client, obs["id"])
    r = await client.get(f"/api/v1/observation/{obs['id']}/images")
    assert r.status_code == 200 and [i["id"] for i in r.json()] == [img["id"]]


@pytest.mark.asyncio
async def test_lab_member_can_list_but_not_upload_or_delete(client):
    await create_test_user("im_owner2")
    member = await create_test_user("im_member2")
    await _login(client, "im_owner2")
    lab = await _create_lab(client, "Images Lab 2", is_public=False)
    obs = await _create_obs(client, lab_id=lab["id"], visibility="lab")
    img = await _upload_image(client, obs["id"])
    await add_lab_member(lab["id"], member.id)
    base = f"/api/v1/observation/{obs['id']}/images"

    await _login(client, "im_member2")
    r = await client.get(base)
    assert r.status_code == 200 and [i["id"] for i in r.json()] == [img["id"]]
    r = await client.post(base, files=[("files", ("p.png", _png(), "image/png"))])
    assert r.status_code == 404
    assert (await client.delete(f"{base}/{img['id']}")).status_code == 404


@pytest.mark.asyncio
async def test_outsider_and_guest_cannot_list_lab_or_private_entity_images(client):
    await create_test_user("im_owner3")
    await create_test_user("im_outsider3")
    await _login(client, "im_owner3")
    lab = await _create_lab(client, "Images Lab 3", is_public=False)
    lab_obs = await _create_obs(client, lab_id=lab["id"], visibility="lab")
    await _upload_image(client, lab_obs["id"])
    private_obs = await _create_obs(client, title="Private obs")
    await _upload_image(client, private_obs["id"])

    await _login(client, "im_outsider3")
    assert (await client.get(f"/api/v1/observation/{lab_obs['id']}/images")).status_code == 404
    assert (await client.get(f"/api/v1/observation/{private_obs['id']}/images")).status_code == 404

    client.cookies.clear()
    assert (await client.get(f"/api/v1/observation/{private_obs['id']}/images")).status_code == 404
    assert (await client.get(f"/api/v1/observation/{lab_obs['id']}/images")).status_code == 404


@pytest.mark.asyncio
async def test_guest_can_list_public_entity_images(client):
    await create_test_user("im_owner4")
    await _login(client, "im_owner4")
    obs = await _create_obs(client, visibility="public")
    img = await _upload_image(client, obs["id"])

    client.cookies.clear()
    r = await client.get(f"/api/v1/observation/{obs['id']}/images")
    assert r.status_code == 200 and [i["id"] for i in r.json()] == [img["id"]]
    r = await client.post(f"/api/v1/observation/{obs['id']}/images",
                          files=[("files", ("p.png", _png(), "image/png"))])
    assert r.status_code in (401, 403)


@pytest.mark.asyncio
async def test_unsupported_entity_type_is_404(client):
    await create_test_user("im_owner5")
    await _login(client, "im_owner5")
    assert (await client.get("/api/v1/nonsense/1/images")).status_code == 404
