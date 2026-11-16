"""Бюджет контекста: тексты переменной длины урезаются заранее и справедливо, собранный промпт помещается."""
import pytest

from app.services import ai
from app.services import llm_router as r


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    for name in ("LLM_CONTEXT_TOKENS", "LLM_ANALYSIS_CONTEXT"):
        monkeypatch.delenv(name, raising=False)


def test_fit_texts_leaves_short_texts_untouched(capsys):
    texts = ["новая запись", "кандидат один", "кандидат два"]
    assert r.fit_texts("analysis", 3000, texts, [2000, 1500, 1500], max_tokens=1200) == texts
    assert "[llm]" not in capsys.readouterr().out


def test_fit_texts_trims_fairly_and_fits_the_budget(monkeypatch, capsys):
    monkeypatch.setenv("LLM_CONTEXT_TOKENS", "4096")
    texts = ["н" * 5000] + ["я" * 6000] * 4 + ["коротко"]
    out = r.fit_texts("analysis", 3000, texts, [2000] + [1500] * 5, max_tokens=1200)
    budget = r.available_prompt_chars("analysis", 1200) - 3000
    assert sum(map(len, out)) <= budget
    assert out[-1] == "коротко"  # короткий не урезается: остаток делят длинные
    assert out[0].endswith("…") and out[1].endswith("…")
    assert "урезаны" in capsys.readouterr().out


def test_fit_texts_drops_tail_candidates_and_always_keeps_the_new_record(monkeypatch):
    monkeypatch.setenv("LLM_CONTEXT_TOKENS", "1500")  # бюджета почти нет
    out = r.fit_texts("analysis", 3000, ["н" * 2000] + ["я" * 1500] * 8, [2000] + [1500] * 8, max_tokens=1200)
    assert 1 <= len(out) < 9 and out[0]


def test_check_prompt_fits_accounts_for_the_answer_reserve(monkeypatch):
    monkeypatch.setenv("LLM_CONTEXT_TOKENS", "4096")
    prompt = "я" * int(r.available_prompt_chars("analysis", 50) * 0.9)
    assert r.check_prompt_fits("analysis", prompt, 50) is None
    assert r.check_prompt_fits("analysis", prompt, 1500) is not None  # тот же промпт, но ответу нужно больше места


def _capture(monkeypatch):
    captured = []

    async def fake(url, key, model, prompt, max_tokens, temperature):
        captured.append((prompt, max_tokens))
        return '{"contradictions": []}'
    monkeypatch.setattr(ai, "_call_provider", fake)
    return captured


@pytest.mark.asyncio
@pytest.mark.parametrize("ctx", ["4096", "8192"])
async def test_find_contradictions_prompt_always_fits_the_context(monkeypatch, ctx):
    monkeypatch.setenv("LLM_CONTEXT_TOKENS", ctx)
    captured = _capture(monkeypatch)
    candidates = [{"entity_type": "observation", "entity_id": i, "text": "я" * 6000} for i in range(8)]
    await ai.find_contradictions("ы" * 5000, candidates)
    prompt, max_tokens = captured[0]
    assert r.check_prompt_fits("analysis", prompt, max_tokens) is None


@pytest.mark.asyncio
async def test_find_contradictions_keeps_normal_prompts_whole(monkeypatch, capsys):
    captured = _capture(monkeypatch)
    candidates = [{"entity_type": "observation", "entity_id": 1, "text": "первый кандидат"},
                  {"entity_type": "hypothesis", "entity_id": 2, "text": "второй кандидат"}]
    await ai.find_contradictions("новая запись", candidates)
    prompt = captured[0][0]
    assert "новая запись" in prompt and "первый кандидат" in prompt and "второй кандидат" in prompt
    assert "[llm]" not in capsys.readouterr().out


@pytest.mark.asyncio
async def test_fixed_chars_constant_is_an_upper_bound_of_the_real_instructions(monkeypatch):
    captured = _capture(monkeypatch)
    await ai.find_contradictions("", [{"entity_type": "observation", "entity_id": 1, "text": ""}])
    assert len(captured[0][0]) <= ai.FIXED_CHARS_CONTRADICTIONS
