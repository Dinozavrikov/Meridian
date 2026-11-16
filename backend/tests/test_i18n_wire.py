"""Динамический канал (ключ == значение): модели уходят короткие номера, а не русский текст дважды."""
import pytest

from tests.conftest import create_test_user

TARGET = "app.api.v1.i18n.translate_strings"


def test_payload_replaces_only_text_as_key():
    from app.api.v1.i18n import _to_model_payload
    wire, back = _to_model_payload({"Привет мир": "Привет мир", "a.b": "Мир"})
    assert "Привет мир" not in wire and wire["a.b"] == "Мир"
    assert sorted(wire.values()) == ["Мир", "Привет мир"]
    assert set(back.values()) == {"Привет мир", "a.b"}  # sorted() тут нельзя: латиница раньше кириллицы
    assert back[next(k for k, v in wire.items() if v == "Привет мир")] == "Привет мир"


def test_payload_avoids_collision_with_real_numeric_keys():
    from app.api.v1.i18n import _to_model_payload
    wire, back = _to_model_payload({"1": "Единица", "Текст": "Текст"})
    assert len(wire) == 2 and set(back.values()) == {"1", "Текст"}
    assert wire[next(k for k, v in back.items() if v == "1")] == "Единица"


@pytest.mark.asyncio
async def test_model_gets_short_keys_result_maps_back_and_second_call_is_cached(client, monkeypatch):
    seen = []

    async def fake(strings, lang):
        seen.append(dict(strings))
        return {k: f"EN:{v}" for k, v in strings.items()}
    monkeypatch.setattr(TARGET, fake)

    await create_test_user("i18n_w1")
    login = await client.post("/api/v1/auth/login", json={"username": "i18n_w1", "password": "pass12345"})
    assert login.status_code == 200

    body = {"strings": {"Привет мир": "Привет мир", "a.b": "Мир"}}
    expected = {"Привет мир": "EN:Привет мир", "a.b": "EN:Мир"}
    r = await client.post("/api/v1/i18n/ensure/en", json=body)
    assert r.json()["translations"] == expected
    assert len(seen) == 1 and "Привет мир" not in seen[0] and "a.b" in seen[0]

    r = await client.post("/api/v1/i18n/ensure/en", json=body)  # второй раз — целиком из кэша по исходному ключу
    assert r.json()["translations"] == expected
    assert len(seen) == 1
