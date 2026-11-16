"""PATCH /auth/me: входные данные проверяются (тип и длина), мусор даёт 422, а не запись в базу или 500."""
import pytest

from tests.conftest import create_test_user
from tests.test_lab_signal import _login


@pytest.mark.asyncio
@pytest.mark.parametrize("body", [
    {"bio": 123}, {"bio": ["a"]}, {"display_name": {"x": 1}}, {"display_name": "я" * 1000}, {"bio": "я" * 100_000},
    {"default_visibility": "секретно"},
])
async def test_bad_profile_input_is_rejected(client, body):
    u = await create_test_user("pi_a"); await _login(client, u.username)
    r = await client.patch("/api/v1/auth/me", json=body)
    assert r.status_code == 422, (body, r.status_code)       # сегодня 200 или 500


@pytest.mark.asyncio
async def test_valid_profile_update_still_works(client):
    """ОХРАННЫЙ (зелёный и до патча)."""
    u = await create_test_user("pi_b"); await _login(client, u.username)
    r = await client.patch("/api/v1/auth/me", json={"display_name": "Имя", "bio": "О себе", "default_visibility": "public"})
    assert r.status_code == 200, r.text
    assert r.json()["bio"] == "О себе"
