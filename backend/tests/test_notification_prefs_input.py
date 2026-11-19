"""PATCH notification-prefs: только булевы значения известных полей; строка "false" не становится True."""
import pytest

from app.main import app
from tests.route_utils import iter_api_routes
from tests.conftest import create_test_user
from tests.test_lab_signal import _login


def _url():
    for r in iter_api_routes():
        ep = getattr(r, "endpoint", None)
        if ep is not None and ep.__name__ == "update_notification_prefs":
            return r.path
    raise AssertionError("нет роута update_notification_prefs")


@pytest.mark.asyncio
@pytest.mark.parametrize("body", [
    {"comments": "false"}, {"comments": 5}, {"new_messages": ["x"]},
])
async def test_bad_notification_prefs_rejected(client, body):
    u = await create_test_user("np_a"); await _login(client, u.username)
    r = await client.patch(_url(), json=body)
    assert r.status_code == 422, (body, r.status_code, r.text)     # сегодня 200: "false" -> True


@pytest.mark.asyncio
async def test_valid_prefs_still_work_and_omitted_stay(client):
    """ОХРАННЫЙ (зелёный и до патча)."""
    u = await create_test_user("np_b"); await _login(client, u.username)
    r = await client.patch(_url(), json={"comments": False})
    assert r.status_code == 200, r.text
    assert r.json()["comments"] is False
    r = await client.patch(_url(), json={"new_messages": False})
    assert r.json()["comments"] is False and r.json()["new_messages"] is False   # пропущенное не сброшено


@pytest.mark.asyncio
@pytest.mark.parametrize("body", [{"password": 123}, {"password": ["x"]}, {}, {"password": "я" * 1000}])
async def test_delete_account_bad_body_is_422_and_account_survives(client, body):
    u = await create_test_user("np_del"); await _login(client, u.username)
    r = await client.request("DELETE", "/api/v1/auth/me", json=body)
    assert r.status_code == 422, (body, r.status_code, r.text)     # сегодня 500 или 400
    assert (await client.get("/api/v1/auth/me")).status_code == 200   # аккаунт на месте


@pytest.mark.asyncio
async def test_delete_account_wrong_password_still_400(client):
    """ОХРАННЫЙ (зелёный и до патча)."""
    u = await create_test_user("np_del2"); await _login(client, u.username)
    r = await client.request("DELETE", "/api/v1/auth/me", json={"password": "неверный"})
    assert r.status_code == 400, r.text
