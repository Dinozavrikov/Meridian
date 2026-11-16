"""Регрессия: сбой ИИ в diff_reflections - исключение, а не insight с текстом ошибки."""
import httpx
import pytest

from app.services import ai

FACTORS = [{"factor": "работа", "weight": 3}]
REQ = httpx.Request("POST", "http://llm.test")


@pytest.mark.parametrize("exc", [
    httpx.ConnectError("refused"),
    httpx.ReadTimeout("slow"),
    httpx.HTTPStatusError("500", request=REQ, response=httpx.Response(500, request=REQ)),
    ValueError("Illegal header value b'Bearer '"),
])
async def test_llm_failure_raises_and_does_not_leak_error_text(monkeypatch, exc):
    async def boom(*a, **kw):
        raise exc
    monkeypatch.setattr(ai, "_call_llm", boom)
    with pytest.raises(ai.AIUnavailable) as ei:
        await ai.diff_reflections(FACTORS, FACTORS)
    assert str(ei.value) == ai.AIUnavailable.USER_MESSAGE
    assert "Illegal header" not in str(ei.value)


async def test_broken_json_raises(monkeypatch):
    async def junk(*a, **kw):
        return "это не json"
    monkeypatch.setattr(ai, "_call_llm", junk)
    with pytest.raises(ai.AIUnavailable):
        await ai.diff_reflections(FACTORS, FACTORS)


async def test_good_answer_still_returned(monkeypatch):
    async def ok(*a, **kw):
        return '{"matched": [], "added": ["x"], "dropped": [], "insight": "Данных мало."}'
    monkeypatch.setattr(ai, "_call_llm", ok)
    res = await ai.diff_reflections(FACTORS, FACTORS)
    assert res["insight"] == "Данных мало." and res["added"] == ["x"]
