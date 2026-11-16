"""/preview: абзацы остаются раздельными (перенос строки), теги не просачиваются в текст."""
import pytest

from tests.conftest import create_test_user
from tests.test_lab_signal import _login


@pytest.mark.asyncio
async def test_excerpt_keeps_paragraph_breaks_and_has_no_tags(client):
    u = await create_test_user("pp_a"); await _login(client, u.username)
    r = await client.post("/api/v1/observations/", json={
        "date": "2026-08-06", "author": "а", "title": "Н", "visibility": "private", "lab_id": None,
        "text": "<p>Первый абзац</p><p>Второй &amp; последний</p>"})
    assert r.status_code == 201, r.text
    oid = r.json()["id"]
    j = (await client.get(f"/api/v1/observation/{oid}/preview")).json()
    ex = j["excerpt"]
    assert "Первый абзац" in ex and "Второй & последний" in ex   # контроль: текст на месте, сущность разобрана
    assert "<" not in ex
    assert ex.index("Первый") < ex.index("\n") < ex.index("Второй")  # сегодня абзацы склеены пробелом


@pytest.mark.asyncio
async def test_excerpt_paragraphs_and_br_become_line_breaks_without_entities(client):
    """Без HTML-сущностей: проверяет именно перенос строк между блоками, а не разбор &amp;."""
    u = await create_test_user("pp_b"); await _login(client, u.username)
    r = await client.post("/api/v1/observations/", json={
        "date": "2026-08-06", "author": "а", "title": "Н2", "visibility": "private", "lab_id": None,
        "text": "<p>Альфа</p><p>Бета<br>Гамма</p>"})
    assert r.status_code == 201, r.text
    ex = (await client.get(f"/api/v1/observation/{r.json()['id']}/preview")).json()["excerpt"]
    lines = [ln for ln in ex.split("\n") if ln]
    assert lines == ["Альфа", "Бета", "Гамма"]   # три отдельные строки, а не "Альфа Бета Гамма"
