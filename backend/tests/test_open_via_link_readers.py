"""Запись, открытая через связь: читать можно всё, что видно в записи (комментарии, картинки, вложения, источники),
а писать нельзя. Мир тот же, что в test_open_via_link."""
import pytest

from tests.test_open_via_link import _link, _login, _world


def _reads(n):
    return {"comments": f"/api/v1/comments/observation/{n}", "images": f"/api/v1/observation/{n}/images",
            "attachments": f"/api/v1/observation/{n}/attachments", "sources": f"/api/v1/observation/{n}/sources"}


@pytest.mark.asyncio
async def test_member_reads_everything_of_a_record_opened_via_link(client):
    a, b, c, lab, r, n = await _world(client)
    await _link(a.id, n, r)
    await _login(client, "ov_b")
    got = {k: (await client.get(u)).status_code for k, u in _reads(n).items()}
    assert got == {k: 200 for k in _reads(n)}, got


@pytest.mark.asyncio
async def test_member_cannot_write_to_a_record_opened_via_link(client):
    """Открытие не даёт прав записи. Владелец проверяется до разбора файла, поэтому мусорный файл годится."""
    a, b, c, lab, r, n = await _world(client)
    await _link(a.id, n, r)
    await _login(client, "ov_b")
    img = await client.post(f"/api/v1/observation/{n}/images", files={"files": ("a.png", b"x", "image/png")})
    att = await client.post(f"/api/v1/observation/{n}/attachments", files={"files": ("a.txt", b"x", "text/plain")})
    src = await client.post(f"/api/v1/observation/{n}/sources", json={"url": "https://example.com/x"})
    got = {"images": img.status_code, "attachments": att.status_code, "sources": src.status_code}
    assert all(v in (403, 404) for v in got.values()), got


@pytest.mark.asyncio
async def test_stranger_reads_nothing_of_it(client):
    """ОХРАННЫЙ (зелёный и до патча)."""
    a, b, c, lab, r, n = await _world(client)
    await _link(a.id, n, r)
    await _login(client, "ov_s")
    got = {k: (await client.get(u)).status_code for k, u in _reads(n).items()}
    assert all(v != 200 for v in got.values()), got
