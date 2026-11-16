"""Регрессия: пустой ключ провайдера не даёт заголовок «Bearer » (httpx: Illegal header value)."""
import httpx
import pytest

from app.services import ai


async def _sent_headers(monkeypatch, api_key):
    seen = {}

    def handler(request):
        seen.update(dict(request.headers))
        return httpx.Response(200, json={"choices": [{"message": {"content": "{}"}}]})

    real = httpx.AsyncClient
    monkeypatch.setattr(
        ai.httpx, "AsyncClient",
        lambda **kw: real(transport=httpx.MockTransport(handler), **kw),
    )
    await ai._call_provider("http://llm.test/v1/chat/completions", api_key, "m", "p", 10, 0.1)
    return seen


@pytest.mark.parametrize("key", ["", "   ", "\n"])
async def test_blank_key_sends_no_authorization(monkeypatch, key):
    assert "authorization" not in await _sent_headers(monkeypatch, key)


async def test_real_key_is_sent_stripped(monkeypatch):
    headers = await _sent_headers(monkeypatch, " sk-test \n")
    assert headers["authorization"] == "Bearer sk-test"
