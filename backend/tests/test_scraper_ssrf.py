"""SSRF-защита scrape_url: сервер не ходит во внутреннюю сеть по URL от пользователя и по
редиректам внешних сайтов. Проверяется реальное поведение: поднятый локальный сервер не получает
запросов (а контрольный запрос доказывает, что сервер вообще жив)."""
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import httpx
import pytest

from app.services import scraper

pytestmark = pytest.mark.asyncio

PUBLIC_IP = "93.184.216.34"


@pytest.fixture
def local_server():
    hits = []

    class H(BaseHTTPRequestHandler):
        def do_GET(self):
            hits.append(self.path)
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(b"<html><title>secret</title><body>internal</body></html>")

        def log_message(self, *a):
            pass

    srv = HTTPServer(("127.0.0.1", 0), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield srv.server_address[1], hits
    srv.shutdown()
    srv.server_close()


async def test_loopback_server_is_never_contacted(local_server):
    port, hits = local_server
    assert httpx.get(f"http://127.0.0.1:{port}/", trust_env=False).status_code == 200  # контроль
    assert len(hits) == 1
    with pytest.raises(scraper.UnsafeURLError):
        await scraper.scrape_url(f"http://127.0.0.1:{port}/")
    assert len(hits) == 1


@pytest.mark.parametrize("url", [
    "http://localhost/", "http://127.0.0.1/", "http://[::1]/", "http://[::ffff:127.0.0.1]/",
    "http://2130706433/", "http://0x7f.0.0.1/", "http://0.0.0.0/",
    "http://169.254.169.254/latest/meta-data/", "http://10.0.0.5/", "http://172.17.0.1/",
    "http://192.168.1.1/", "http://100.64.0.1/", "http://224.0.0.1/", "http://host.docker.internal/",
    "file:///etc/passwd", "ftp://example.com/", "gopher://example.com/", "http:///nohost",
    "javascript:alert(1)",
])
async def test_non_public_or_non_http_urls_rejected(url):
    with pytest.raises(scraper.UnsafeURLError):
        await scraper.scrape_url(url)


async def test_redirect_to_internal_address_is_blocked(local_server, monkeypatch):
    port, hits = local_server

    async def fake_resolve(host, p):
        return [PUBLIC_IP] if host == "public.example" else ["127.0.0.1"]
    monkeypatch.setattr(scraper, "_resolve", fake_resolve)
    seen = []

    def handler(request):
        seen.append(str(request.url))
        return httpx.Response(302, headers={"location": f"http://127.0.0.1:{port}/secret"})

    with pytest.raises(scraper.UnsafeURLError):
        await scraper.scrape_url("http://public.example/", _transport=httpx.MockTransport(handler))
    assert seen == ["http://public.example/"]  # второй хоп до сети не дошёл
    assert hits == []


async def test_redirect_loop_is_bounded(monkeypatch):
    async def fake_resolve(host, p):
        return [PUBLIC_IP]
    monkeypatch.setattr(scraper, "_resolve", fake_resolve)
    seen = []

    def handler(request):
        seen.append(1)
        return httpx.Response(302, headers={"location": "http://public.example/again"})

    with pytest.raises(scraper.UnsafeURLError):
        await scraper.scrape_url("http://public.example/", _transport=httpx.MockTransport(handler))
    assert len(seen) == scraper.MAX_REDIRECTS + 1


async def test_public_page_with_redirect_still_scraped(monkeypatch):
    async def fake_resolve(host, p):
        return [PUBLIC_IP]
    monkeypatch.setattr(scraper, "_resolve", fake_resolve)

    def handler(request):
        if request.url.path == "/old":
            return httpx.Response(301, headers={"location": "/new"})
        return httpx.Response(200, html="<html><head><title>Hello</title></head>"
                                        "<body><article>Text here</article></body></html>")

    res = await scraper.scrape_url("http://public.example/old", _transport=httpx.MockTransport(handler))
    assert res == {"title": "Hello", "text": "Text here"}


async def test_body_is_capped(monkeypatch):
    async def fake_resolve(host, p):
        return [PUBLIC_IP]
    monkeypatch.setattr(scraper, "_resolve", fake_resolve)
    big = "<html><body>" + "a" * (scraper.MAX_BODY_BYTES * 2) + "</body></html>"
    res = await scraper.scrape_url("http://public.example/",
                                   _transport=httpx.MockTransport(lambda r: httpx.Response(200, html=big)))
    assert 0 < len(res["text"]) <= scraper.MAX_BODY_BYTES
