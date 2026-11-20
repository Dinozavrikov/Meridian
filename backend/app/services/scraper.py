import asyncio
import ipaddress
import re
import socket

import httpx
from bs4 import BeautifulSoup

MAX_REDIRECTS = 5
MAX_BODY_BYTES = 2 * 1024 * 1024  # хватит на любую статью; больше — обрезаем, а не грузим в память


class UnsafeURLError(ValueError):
    """URL ведет не на публичный адрес интернета или схема не http/https."""


async def _resolve(host: str, port: int) -> list[str]:
    infos = await asyncio.get_running_loop().getaddrinfo(host, port, type=socket.SOCK_STREAM)
    return [info[4][0] for info in infos]


def _is_public_ip(addr: str) -> bool:
    ip = ipaddress.ip_address(addr.split("%", 1)[0])
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
        ip = ip.ipv4_mapped  # ::ffff:127.0.0.1 — это loopback, а не «чужой IPv6»
    return ip.is_global and not ip.is_multicast


async def _assert_public_url(url: httpx.URL) -> None:
    if url.scheme not in ("http", "https") or not url.host:
        raise UnsafeURLError("Допустимы только http/https URL")
    port = url.port or (443 if url.scheme == "https" else 80)
    try:
        addrs = await _resolve(url.host, port)
    except OSError:
        raise UnsafeURLError("Адрес не разрешается")
    if not addrs or not all(_is_public_ip(a) for a in addrs):
        raise UnsafeURLError("URL ведет во внутреннюю сеть")


async def _fetch_html(url: str, headers: dict, transport) -> str:
    try:
        current = httpx.URL(url)
    except httpx.InvalidURL:
        raise UnsafeURLError("Некорректный URL")
    # Редиректы ведем сами: каждый хоп проверяется так же, как первый URL.
    async with httpx.AsyncClient(timeout=25, follow_redirects=False, transport=transport) as client:
        for _ in range(MAX_REDIRECTS + 1):
            await _assert_public_url(current)
            async with client.stream("GET", current, headers=headers) as resp:
                if resp.is_redirect:
                    try:
                        current = current.join(resp.headers["location"])
                    except httpx.InvalidURL:
                        raise UnsafeURLError("Некорректный редирект")
                    continue
                resp.raise_for_status()
                body = bytearray()
                async for chunk in resp.aiter_bytes():
                    body += chunk
                    if len(body) > MAX_BODY_BYTES:
                        break
                return bytes(body[:MAX_BODY_BYTES]).decode(resp.encoding or "utf-8", errors="replace")
    raise UnsafeURLError("Слишком много редиректов")


async def scrape_url(url: str, *, _transport: httpx.AsyncBaseTransport | None = None) -> dict:
    headers = {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ru,en;q=0.7",
    }

    html = await _fetch_html(url, headers, _transport)
    soup = BeautifulSoup(html, "html.parser")

    for tag in soup(["script", "style", "nav", "footer", "header",
                     "aside", "iframe", "noscript", "form", "button"]):
        tag.decompose()

    title = ""
    if soup.title and soup.title.string:
        title = soup.title.string.strip()
    if not title:
        h1 = soup.find("h1")
        if h1:
            title = h1.get_text(strip=True)
    title = title[:512]

    main = (
        soup.find("article") or
        soup.find("main") or
        soup.find(attrs={"class": re.compile(r"(article|content|post|entry|text|body|story)", re.I)}) or
        soup.find("body")
    )

    text = main.get_text(separator=" ", strip=True) if main else soup.get_text(separator=" ", strip=True)
    text = re.sub(r"\s+", " ", text).strip()

    return {"title": title, "text": text}
