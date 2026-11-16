"""Старый снимок (без role/stance) против нового (с умолчаниями): ложных «изменено» нет, реальная смена видна."""
from types import SimpleNamespace as NS

from app.services.checkpoint_diff import diff_items


def _eh(data):
    return NS(kind="entity_hypothesis", object_key="entity_hypothesis:task:1:2", entity_type="entity_hypothesis",
              entity_id=1, snapshot_data=data, blob_sha256=None)


OLD = {"parent_type": "task", "parent_id": 1, "hypothesis_id": 2}


def test_missing_new_columns_are_not_a_change():
    new = {**OLD, "role": "alternative", "stance": "связано"}
    assert diff_items([_eh(OLD)], [_eh(new)]) == []


def test_real_change_is_still_reported():
    new = {**OLD, "role": "leading", "stance": "связано"}
    [rec] = diff_items([_eh(OLD)], [_eh(new)])
    assert rec["status"] == "changed" and list(rec["changed_fields"]) == ["role"]
