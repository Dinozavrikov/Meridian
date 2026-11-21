"""preview_html: модель видит текст с маркерами вместо тегов, ссылка в переводе берется из оригинала."""
import pytest

from tests.conftest import create_test_user
from tests.test_i18n_ensure_content_access import _login, _obs

TARGET = "app.api.v1.i18n.translate_strings"
SRC = '<p>See <a href="meridian://question/7">this question</a> now</p>'


async def _ask_html(client, obs_id):
    r = await client.post("/api/v1/i18n/ensure-content/en", json={"items": [
        {"entity_type": "observation", "entity_id": obs_id, "field": "preview_html", "text": SRC}]})
    assert r.status_code == 200, r.text
    return r.json()["translations"].get(f"observation:{obs_id}:preview_html")


@pytest.mark.asyncio
async def test_model_gets_markers_and_link_comes_back_from_the_original(client, monkeypatch):
    seen = {}

    async def fake(strings, lang):
        seen.update(strings)
        return {k: v.replace("See", "Смотрите") for k, v in strings.items()}  # маркеры не трогаем
    monkeypatch.setattr(TARGET, fake)

    await create_test_user("ph_user"); await _login(client, "ph_user")
    out = await _ask_html(client, await _obs(client))

    assert seen and all("<" not in v and "[[0]]" in v for v in seen.values()), seen
    assert out == '<p>Смотрите <a href="meridian://question/7">this question</a> now</p>'


@pytest.mark.asyncio
async def test_model_losing_a_marker_gives_plain_text_without_links(client, monkeypatch):
    async def fake(strings, lang):
        return {k: "Смотрите этот вопрос [[0]] сейчас" for k in strings}  # остальные маркеры потеряны
    monkeypatch.setattr(TARGET, fake)

    await create_test_user("ph_user2"); await _login(client, "ph_user2")
    out = await _ask_html(client, await _obs(client))
    assert out == "Смотрите этот вопрос сейчас" and "<" not in out
