"""diff_reflections: факторы (произвольный текст пользователя) и описания картинок не переполняют контекст."""
import json

import pytest

from app.services import ai
from app.services import llm_router as r


@pytest.fixture(autouse=True)
def _ctx(monkeypatch):
    monkeypatch.delenv("LLM_CONTEXT_TOKENS", raising=False)
    for task in r.TASKS:
        monkeypatch.delenv(f"LLM_{task.upper()}_CONTEXT", raising=False)


def _capture(monkeypatch):
    captured = []

    async def fake(prompt, max_tokens=256, temperature=0.1, lane="interactive", *, task):
        captured.append((prompt, max_tokens, task))
        return "{}"
    monkeypatch.setattr(ai, "_call_llm", fake)
    return captured


def _factors(n, size):
    return [{"factor": "я" * size, "weight": 3, "direction": "за"} for _ in range(n)]


def _parse_before(prompt):
    return json.loads(prompt.split("ФАКТОРЫ ДО:\n")[1].split("\n\nФАКТОРЫ ПОСЛЕ:")[0])


@pytest.mark.asyncio
async def test_worst_case_prompt_fits_the_context_and_stays_valid_json(monkeypatch):
    captured = _capture(monkeypatch)
    await ai.diff_reflections(_factors(5, 20000), _factors(5, 20000), prediction_text="п" * 5000,
                              image_descriptions=["д" * 3000] * 10)
    prompt, max_tokens, task = captured[0]
    assert r.check_prompt_fits(task, prompt, max_tokens) is None
    parsed = _parse_before(prompt)
    assert len(parsed) == 5 and all(set(x) == {"factor", "weight", "direction"} for x in parsed)


@pytest.mark.asyncio
async def test_structure_is_preserved_and_short_values_stay_whole(monkeypatch):
    captured = _capture(monkeypatch)
    await ai.diff_reflections([{"factor": "я" * 30000, "weight": 3}, {"factor": "коротко", "weight": 1}], [])
    parsed = _parse_before(captured[0][0])
    assert [sorted(x) for x in parsed] == [["factor", "weight"], ["factor", "weight"]]
    assert parsed[1] == {"factor": "коротко", "weight": 1} and parsed[0]["weight"] == 3
    assert parsed[0]["factor"].endswith("…")


@pytest.mark.asyncio
async def test_normal_input_is_untouched_and_silent(monkeypatch, capsys):
    captured = _capture(monkeypatch)
    before = [{"factor": "работа помешала", "weight": 2}]
    after = [{"factor": "не хватило времени", "weight": 3}]
    await ai.diff_reflections(before, after, prediction_text="Успею закончить отчёт", image_descriptions=["график роста"])
    prompt = captured[0][0]
    assert json.dumps(before, ensure_ascii=False) in prompt and json.dumps(after, ensure_ascii=False) in prompt
    assert "график роста" in prompt and "Успею закончить отчёт" in prompt
    assert "[llm]" not in capsys.readouterr().out


@pytest.mark.asyncio
async def test_fixed_chars_is_an_upper_bound_of_the_instructions(monkeypatch):
    captured = _capture(monkeypatch)
    await ai.diff_reflections([], [], prediction_text="п", image_descriptions=["д"])
    assert len(captured[0][0]) <= ai.FIXED_CHARS_DIFF
