"""Старый снимок связи (без created_at) против нового (с датой): не «изменено»."""
from types import SimpleNamespace as NS

from app.services.checkpoint_diff import diff_items


def _l(data):
    return NS(kind="link", object_key="link:1", entity_type="observation", entity_id=1, snapshot_data=data, blob_sha256=None)


def test_missing_created_at_is_not_a_change():
    old = {"id": 1, "from_type": "observation", "from_id": 1, "to_type": "hypothesis", "to_id": 2, "link_type": "связано"}
    assert diff_items([_l(old)], [_l({**old, "created_at": "2026-10-18T00:00:00+00:00"})]) == []


def test_real_type_change_still_reported():
    old = {"id": 1, "link_type": "связано"}
    [rec] = diff_items([_l(old)], [_l({**old, "link_type": "опровергает", "created_at": "x"})])
    assert list(rec["changed_fields"]) == ["link_type"]
