"""Заголовок наблюдения не бывает пустым и там, где схема не работает: репост, граф, бэкфилл-миграция.
Тесты гоняют реальный код (build_entity, эндпоинт графа, SQL миграции), а не ищут маркеры в коде.
Своя сессия AsyncSessionLocal в каждом тесте: общая db_session конфликтует с конкурентными запросами."""
import importlib.util
import pathlib

import pytest
from sqlalchemy import text as sa_text

from app.core.plain_text import derive_title
from app.db.session import AsyncSessionLocal
from app.services.repost import build_entity
from tests.conftest import create_test_user

pytestmark = pytest.mark.asyncio


async def _build(title, text):
    u = await create_test_user("repost_u")
    async with AsyncSessionLocal() as db:
        return await build_entity(db, "observation", title=title, text=text,
                                  user_id=u.id, visibility="private", lab_id=None)


@pytest.mark.parametrize("title", ["", "   ", "\n"])
async def test_repost_blank_title_is_derived_from_text(title):
    assert (await _build(title, "<p>Первая  строка</p>")).title == "Первая строка"


async def test_repost_blank_title_and_blank_text_falls_back_to_date():
    assert (await _build("", "<p><br></p>")).title.startswith("Наблюдение от ")


async def test_repost_keeps_given_title():
    assert (await _build("  Мой  ", "<p>x</p>")).title == "Мой"


async def test_graph_labels_observation_with_title_and_exposes_date(client):
    await create_test_user("graphtitle")
    r = await client.post("/api/v1/auth/login", json={"username": "graphtitle", "password": "pass12345"})
    assert r.status_code == 200, r.text
    r = await client.post("/api/v1/observations/", json={
        "date": "2026-09-04", "author": "a", "title": "Мой заголовок", "text": "<p>x</p>"})
    assert r.status_code == 201, r.text
    g = await client.get("/api/v1/graph/")
    assert g.status_code == 200, g.text
    obs = [n for n in g.json()["nodes"] if n["type"] == "observation"]
    assert [n["label"] for n in obs] == ["Мой заголовок"]
    assert obs[0]["date"] == "2026-09-04"


def _migration_sql(monkeypatch):
    path = next(pathlib.Path("alembic/versions").glob("*_observation_title_backfill.py"))
    spec = importlib.util.spec_from_file_location("backfill_mig", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    captured = []

    class _Bind:
        class dialect:
            name = "postgresql"

    class _Op:
        @staticmethod
        def get_bind(): return _Bind
        @staticmethod
        def execute(sql): captured.append(sql)

    monkeypatch.setattr(mod, "op", _Op)
    mod.upgrade()
    assert len(captured) == 1
    return str(captured[0])


async def test_migration_backfill_fills_only_blank_titles(monkeypatch):
    """SQL миграции выполняется на временной копии таблицы (CHECK в неё не копируется), поэтому схему
    и ограничение основной таблицы тест не трогает."""
    u = await create_test_user("mig_u")
    sql = _migration_sql(monkeypatch)
    assert sql.count("UPDATE observations") == 1
    sql = sql.replace("UPDATE observations", "UPDATE obs_tmp")
    cases = {
        "a": ("", "<p>Привет &amp; мир</p>"),
        "b": ("   ", "<p><b>Две</b>   строки\n\nтекста</p>"),
        "c": ("", "слово " * 40),
        "d": ("", "<p><br></p>"),
        "e": ("Оставить", "<p>не трогать</p>"),
    }
    async with AsyncSessionLocal() as db:
        await db.execute(sa_text("CREATE TEMP TABLE obs_tmp (LIKE observations INCLUDING DEFAULTS) ON COMMIT DROP"))
        for i, (slug, (title, body)) in enumerate(cases.items(), 1):
            await db.execute(sa_text(
                "INSERT INTO obs_tmp (id, user_id, date, author, title, slug, text, status, importance, visibility) "
                "VALUES (:id, :u, '2026-01-02', 't', :title, :slug, :text, 'сырое', 0, 'private')"),
                {"id": i, "u": u.id, "title": title, "slug": slug, "text": body})
        await db.execute(sa_text(sql))
        got = dict((await db.execute(sa_text("SELECT slug, title FROM obs_tmp"))).all())
        await db.rollback()

    assert got["e"] == "Оставить"
    assert got["d"] == "Наблюдение от 2026-01-02"
    for slug in ("a", "b", "c"):
        assert got[slug] == derive_title(cases[slug][1]), (slug, got[slug])
    assert got["a"] == "Привет & мир"
    assert all(t.strip() for t in got.values())
