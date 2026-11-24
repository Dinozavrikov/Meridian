import re

import pytest

from tests.conftest import create_test_user


@pytest.mark.asyncio
async def test_facts_follow_settings_and_match_real_cookies(client, monkeypatch):
    """Сроки на странице приватности и реальные Max-Age кук приходят из одного места."""
    from app.core.config import settings
    monkeypatch.setattr(settings, "ACCESS_TOKEN_EXPIRE_MINUTES", 5)
    monkeypatch.setattr(settings, "REFRESH_TOKEN_EXPIRE_DAYS", 7)
    await create_test_user("facts_u")

    facts = (await client.get("/api/v1/meta/privacy-facts")).json()
    assert facts["session"] == {"access_minutes": 5, "refresh_days": 7}
    assert facts["reset_link_minutes"] > 0 and facts["google_state_minutes"] > 0

    r = await client.post("/api/v1/auth/login", json={"username": "facts_u", "password": "pass12345"})
    assert r.status_code == 200
    ages = {h.split("=")[0]: int(re.search(r"Max-Age=(\d+)", h, re.I).group(1)) for h in r.headers.get_list("set-cookie")}
    assert ages["access_token"] == facts["session"]["access_minutes"] * 60
    assert ages["refresh_token"] == facts["session"]["refresh_days"] * 86400


@pytest.mark.asyncio
async def test_cookie_list_covers_every_cookie_login_really_sets(client):
    """Таблица кук на странице приватности не может забыть куку, которую сервис ставит на самом деле."""
    await create_test_user("facts_c")
    facts = (await client.get("/api/v1/meta/privacy-facts")).json()
    listed = {c["name"] for c in facts["cookies"]}
    r = await client.post("/api/v1/auth/login", json={"username": "facts_c", "password": "pass12345"})
    set_by_login = {h.split("=")[0] for h in r.headers.get_list("set-cookie")}
    assert set_by_login and set_by_login <= listed
    assert {c["purpose"] for c in facts["cookies"]} == {"access", "refresh", "oauth_state"}


def test_minutes_text_agrees_with_number():
    from app.services.privacy_facts import minutes_text
    got = [minutes_text(n) for n in (1, 2, 5, 11, 12, 15, 21, 22, 25)]
    assert got == ["1 минуту", "2 минуты", "5 минут", "11 минут", "12 минут", "15 минут", "21 минуту", "22 минуты", "25 минут"]
