"""Канонический JSON и хеши снимков: чистые функции + круг через настоящий JSONB (числа)."""
import hashlib
import json
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import literal, select
from sqlalchemy.dialects.postgresql import JSONB

from app.db.session import AsyncSessionLocal
from app.services.checkpoint_hash import canonical_json, commit_hash, format_ts, item_hash, tree_hash


def test_canonical_json_basics():
    assert canonical_json({"b": 1, "a": [True, False, None, "я"]}) == '{"a":[true,false,null,"я"],"b":1}'
    assert canonical_json({}) == "{}" and canonical_json([]) == "[]"
    assert canonical_json("a\"b\n") == json.dumps("a\"b\n", ensure_ascii=False)


def test_bool_is_not_confused_with_int():
    assert canonical_json([True, 1, False, 0]) == "[true,1,false,0]"


@pytest.mark.parametrize("value,expected", [
    (7.0, "7"), (7, "7"), (7.5, "7.5"), (-0.0, "0"), (100.0, "100"),
    (1e22, "10000000000000000000000"), (1e-5, "0.00001"), (0.1 + 0.2, "0.30000000000000004"),
])
def test_numbers_are_normalized(value, expected):
    assert canonical_json(value) == expected


@pytest.mark.parametrize("bad", [float("nan"), float("inf"), {1: "x"}, {"a": {1, 2}}, object()])
def test_unrepresentable_values_raise(bad):
    with pytest.raises((ValueError, TypeError)):
        canonical_json(bad)


@pytest.mark.asyncio
async def test_canonical_form_survives_a_trip_through_jsonb():
    # JSONB хранит числа как numeric: 1e22 возвращается целым, 7.0 — как 7.0. Хеш не должен от этого зависеть.
    data = {"a": 1.0, "b": 1e22, "c": 1e-5, "d": 0.1, "e": [7.5, -0.0, 3], "f": "яблоко", "g": None, "h": True,
            "n": {"deep": {"x": 2.0}}}
    async with AsyncSessionLocal() as db:
        back = (await db.execute(select(literal(data, type_=JSONB)))).scalar_one()
    assert canonical_json(back) == canonical_json(data)


def test_item_hash_depends_on_every_part():
    base = item_hash("entity", "entity:observation:1", {"title": "A"}, None)
    assert base == item_hash("entity", "entity:observation:1", {"title": "A"}, None)
    assert len({base, item_hash("comment", "entity:observation:1", {"title": "A"}, None),
                item_hash("entity", "entity:observation:2", {"title": "A"}, None),
                item_hash("entity", "entity:observation:1", {"title": "B"}, None),
                item_hash("entity", "entity:observation:1", {"title": "A"}, "f" * 64)}) == 5


def test_tree_hash_ignores_order_and_detects_changes():
    a, b = ("k1", "h1"), ("k2", "h2")
    assert tree_hash([a, b]) == tree_hash([b, a])
    assert tree_hash([a, b]) != tree_hash([a, ("k2", "h3")])
    assert tree_hash([a, b]) != tree_hash([a])
    assert tree_hash([a]) == hashlib.sha256("k1\th1".encode()).hexdigest()


def test_commit_hash_chains_parent_and_normalizes_timezone():
    t = datetime(2026, 10, 4, 12, 0, 0, 123456, tzinfo=timezone.utc)
    msk = t.astimezone(timezone(timedelta(hours=3)))
    kw = dict(lab_id=1, tree="t" * 64, title="x")
    assert commit_hash(parent_commit_hash=None, created_at=t, **kw) == commit_hash(parent_commit_hash=None, created_at=msk, **kw)
    assert commit_hash(parent_commit_hash="p" * 64, created_at=t, **kw) != commit_hash(parent_commit_hash=None, created_at=t, **kw)
    assert commit_hash(parent_commit_hash=None, created_at=t, **{**kw, "title": None}) != commit_hash(parent_commit_hash=None, created_at=t, **kw)
    assert format_ts(msk) == "2026-10-04T12:00:00.123456Z"
