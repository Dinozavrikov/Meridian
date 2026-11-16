"""ensure-content переводит только известные пары (тип записи, поле), и не больше 500 пунктов за запрос.
Раньше принимался любой тип/поле/объём: любой вошедший пользователь мог гонять произвольный текст через модель."""
import pytest

from tests.conftest import create_test_user

TARGET = "app.api.v1.i18n.translate_strings"


async def _login(client, username, password="pass12345"):
    r = await client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200


@pytest.fixture
def fake_translate(monkeypatch):
    async def ok(strings, lang):
        return {k: f"EN:{v}" for k, v in strings.items()}
    monkeypatch.setattr(TARGET, ok)


def _item(entity_type="observation", entity_id=1, field="text", text="Привет"):
    return {"entity_type": entity_type, "entity_id": entity_id, "field": field, "text": text}


async def _post(client, items, locale="en"):
    return await client.post(f"/api/v1/i18n/ensure-content/{locale}", json={"items": items})


@pytest.mark.asyncio
async def test_known_pairs_are_translated(client, fake_translate):
    """Записи реальные: сервер отбрасывает несуществующие и невидимые."""
    await create_test_user("wl_ok")
    await _login(client, "wl_ok")
    oid = (await client.post("/api/v1/observations/", json={"title": "Т", "date": "2026-09-23", "author": "a", "text": "Текст",
                                                            "lab_id": None, "visibility": "private", "tags": []})).json()["id"]
    pid = (await client.post("/api/v1/predictions/", json={"title": "п", "text": "т", "date_created": "2026-08-06",
           "expected_check_date": "2026-12-06T00:00:00", "status": "не проверен", "visibility": "private", "confidence": 50})).json()["id"]
    lab = (await client.post("/api/v1/labs", json={"name": "Лаба", "is_public": False, "goal_type": "task", "new_goal_title": "G"})).json()["id"]
    rid = (await client.post("/api/v1/results/", json={"title": "Р", "body": "Тело", "lab_id": lab, "visibility": "lab"})).json()["id"]
    pairs = [("observation", oid, "text"), ("observation", oid, "title"), ("observation", oid, "preview_title"),
             ("prediction", pid, "text"), ("prediction", pid, "preview"), ("lab", lab, "name"),
             ("result", rid, "body"), ("result", rid, "title"),
             ]
    r = await _post(client, [_item(t, i, f) for t, i, f in pairs])
    assert r.status_code == 200, r.text
    assert len(r.json()["translations"]) == len(pairs), r.json()


@pytest.mark.asyncio
async def test_unknown_type_is_rejected(client, fake_translate):
    await create_test_user("wl_t")
    await _login(client, "wl_t")
    assert (await _post(client, [_item("secret_table")])).status_code == 400


@pytest.mark.asyncio
async def test_known_type_with_foreign_field_is_rejected(client, fake_translate):
    await create_test_user("wl_f")
    await _login(client, "wl_f")
    assert (await _post(client, [_item("observation", 1, "password_hash")])).status_code == 400
    assert (await _post(client, [_item("user", 1, "title")])).status_code == 400


@pytest.mark.asyncio
async def test_one_bad_item_rejects_the_batch_and_nothing_is_translated(client, monkeypatch):
    calls = []
    async def spy(strings, lang):
        calls.append(strings)
        return {k: v for k, v in strings.items()}
    monkeypatch.setattr(TARGET, spy)
    await create_test_user("wl_b")
    await _login(client, "wl_b")
    r = await _post(client, [_item(), _item("observation", 2, "nope")])
    assert r.status_code == 400 and calls == []


@pytest.mark.asyncio
async def test_russian_locale_is_validated_too(client, fake_translate):
    await create_test_user("wl_ru")
    await _login(client, "wl_ru")
    assert (await _post(client, [_item("secret_table")], locale="ru")).status_code == 400


@pytest.mark.asyncio
async def test_item_count_limit(client, fake_translate):
    await create_test_user("wl_n")
    await _login(client, "wl_n")
    assert (await _post(client, [_item(entity_id=i + 1) for i in range(500)])).status_code == 200
    assert (await _post(client, [_item(entity_id=i + 1) for i in range(501)])).status_code == 422


@pytest.mark.asyncio
async def test_item_text_length_limit(client, fake_translate):
    await create_test_user("wl_len")
    await _login(client, "wl_len")
    assert (await _post(client, [_item(text="а" * 50_000)])).status_code == 200
    assert (await _post(client, [_item(text="а" * 50_001)])).status_code == 422


@pytest.mark.asyncio
async def test_total_text_limit(client, fake_translate):
    await create_test_user("wl_tot")
    await _login(client, "wl_tot")
    ok = [_item(entity_id=i + 1, text="а" * 50_000) for i in range(10)]
    assert (await _post(client, ok)).status_code == 200
    assert (await _post(client, ok + [_item(entity_id=99, text="б")])).status_code == 422
