"""shrink_json_strings / split_budget: урезание внутри JSON без потери структуры."""
import json

from app.services import llm_router as r


def size(v):
    return len(json.dumps(v, ensure_ascii=False))


def test_small_structures_are_returned_as_is(capsys):
    value = {"a": ["привет", 1, None], "b": {"c": "мир"}}
    assert r.shrink_json_strings("analysis", value, 1000) is value
    assert "[llm]" not in capsys.readouterr().out


def test_big_strings_are_cut_and_the_dump_fits(capsys):
    value = [{"factor": "я" * 5000, "weight": 3},
             {"factor": 'кавычки "и" \n переносы ' * 300, "weight": 1},
             {"factor": "коротко"}]
    out = r.shrink_json_strings("analysis", value, 1200)
    assert size(out) <= 1200
    assert out[2] == {"factor": "коротко"}  # короткое остаётся целым
    assert [x.get("weight") for x in out[:2]] == [3, 1]
    assert out[0]["factor"].endswith("…")
    assert value[0]["factor"] == "я" * 5000  # оригинал не изменён
    assert "[llm] задача analysis: JSON урезан" in capsys.readouterr().out


def test_structure_is_preserved_for_nested_data():
    value = {"items": [{"t": "я" * 4000, "tags": ["а" * 4000, "б"]}], "n": 7}
    out = r.shrink_json_strings("analysis", value, 800)
    assert size(out) <= 800
    assert out["n"] == 7 and set(out["items"][0]) == {"t", "tags"} and len(out["items"][0]["tags"]) == 2
    assert out["items"][0]["tags"][1] == "б"


def test_structure_without_strings_is_returned_as_is():
    value = list(range(2000))
    assert r.shrink_json_strings("analysis", value, 100) is value


def test_split_budget_gives_the_small_part_all_it_needs():
    assert r.split_budget([100, 10000], 5000) == [100, 4900]
    assert r.split_budget([100, 200], 5000) == [100, 200]
