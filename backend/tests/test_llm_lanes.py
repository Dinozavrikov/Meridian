"""Очередь вызовов модели: Ollama на одной видеокарте работает по очереди, параллельные
запросы раньше упирались в таймаут (18 чанков перевода — 3 успевали, 15 падали)."""
import asyncio

import httpx
import pytest

from app.services import ai


def _tracker(monkeypatch):
    state = {"now": 0, "max": 0}

    async def fake(url, key, model, prompt, max_tokens, temperature):
        state["now"] += 1
        state["max"] = max(state["max"], state["now"])
        await asyncio.sleep(0.02)
        state["now"] -= 1
        return "{}"
    monkeypatch.setattr(ai, "_call_provider", fake)
    return state


@pytest.mark.asyncio
async def test_calls_in_one_lane_are_serialized(monkeypatch):
    state = _tracker(monkeypatch)
    await asyncio.gather(*[ai._call_llm("p", 10, lane="bulk", task="analysis") for _ in range(5)])
    assert state["max"] == 1


@pytest.mark.asyncio
async def test_bulk_and_interactive_lanes_run_side_by_side(monkeypatch):
    state = _tracker(monkeypatch)
    await asyncio.gather(
        *[ai._call_llm("p", 10, lane="bulk", task="analysis") for _ in range(3)],
        *[ai._call_llm("p", 10, lane="interactive", task="analysis") for _ in range(3)],
    )
    assert state["max"] == 2  # по одному на дорожку


@pytest.mark.asyncio
async def test_translate_error_names_the_underlying_exception(monkeypatch):
    async def boom(*args, **kwargs):
        raise httpx.ReadTimeout("")  # у ReadTimeout пустое сообщение — раньше в логе оставалось «...недоступен: »
    monkeypatch.setattr(ai, "_call_llm", boom)
    with pytest.raises(RuntimeError) as excinfo:
        await ai.translate_strings({"a": "Привет"}, "en")
    assert "ReadTimeout" in str(excinfo.value)
