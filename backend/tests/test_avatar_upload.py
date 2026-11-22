"""Загрузка аватара: на диск попадает маленький WebP, а не присланный файл."""
import io

import pytest
from PIL import Image

from tests.conftest import create_test_user
from tests.route_utils import iter_api_routes


def _url() -> str:
    return next(r.path for r in iter_api_routes() if getattr(r, "path", "").endswith("/me/avatar"))


def _png(w: int, h: int) -> bytes:
    buf = io.BytesIO()
    Image.linear_gradient("L").resize((w, h)).convert("RGB").save(buf, "PNG")
    return buf.getvalue()


async def _login(client, username):
    r = await client.post("/api/v1/auth/login", json={"username": username, "password": "pass12345"})
    assert r.status_code == 200, r.text


async def _upload(client, data: bytes, ctype="image/png"):
    return await client.post(_url(), files={"file": ("a", data, ctype)})


@pytest.fixture
def avatar_dir(tmp_path, monkeypatch):
    monkeypatch.setattr("app.api.v1.users.AVATAR_DIR", str(tmp_path))
    return tmp_path


@pytest.mark.asyncio
async def test_big_avatar_is_shrunk_to_a_small_webp(client, avatar_dir):
    await create_test_user("av_big"); await _login(client, "av_big")
    raw = _png(3000, 3000)
    assert len(raw) < 5 * 1024 * 1024, "предусловие: файл проходит лимит загрузки"
    r = await _upload(client, raw)
    assert r.status_code == 200, r.text
    files = list(avatar_dir.iterdir())
    assert len(files) == 1
    img = Image.open(files[0])
    assert img.format == "WEBP" and max(img.size) <= 512
    assert files[0].stat().st_size < len(raw)
    assert r.json()["avatar_url"].endswith(".webp")


@pytest.mark.asyncio
async def test_small_avatar_is_not_upscaled(client, avatar_dir):
    await create_test_user("av_small"); await _login(client, "av_small")
    assert (await _upload(client, _png(100, 80))).status_code == 200
    assert Image.open(next(avatar_dir.iterdir())).size == (100, 80)


@pytest.mark.asyncio
async def test_broken_file_is_rejected_and_the_old_avatar_stays(client, avatar_dir):
    await create_test_user("av_bad"); await _login(client, "av_bad")
    assert (await _upload(client, _png(200, 200))).status_code == 200
    before = sorted(p.name for p in avatar_dir.iterdir())
    r = await _upload(client, b"this is not an image at all")   # тип в заголовке ничего не доказывает
    assert r.status_code == 400
    assert sorted(p.name for p in avatar_dir.iterdir()) == before
