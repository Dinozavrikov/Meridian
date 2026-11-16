"""generate_thinking_pattern_summary: до 50 инсайтов (до 1500 символов) и 50 личных выводов не должны переполнять контекст."""
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


@pytest.mark.asyncio
async def test_worst_case_prompt_fits_the_context(monkeypatch):
    captured = _capture(monkeypatch)
    await ai.generate_thinking_pattern_summary(["я" * 1500] * 50, ["ы" * 600] * 50)
    prompt, max_tokens, task = captured[0]
    assert r.check_prompt_fits(task, prompt, max_tokens) is None
    assert "я" * 100 in prompt and "ы" * 100 in prompt  # ни инсайты, ни личные выводы не пропали целиком


@pytest.mark.asyncio
async def test_normal_input_is_untouched_and_silent(monkeypatch, capsys):
    captured = _capture(monkeypatch)
    insights = [f"Инсайт {i}: спешка увеличивает число ошибок в решениях." for i in range(5)]
    conclusions = ["Мне стоит записывать доводы заранее."]
    await ai.generate_thinking_pattern_summary(insights, conclusions)
    prompt = captured[0][0]
    assert all(x in prompt for x in insights + conclusions)
    assert "[llm]" not in capsys.readouterr().out


@pytest.mark.asyncio
async def test_oldest_insights_are_dropped_first(monkeypatch):
    captured = _capture(monkeypatch)
    insights = [f"НОВЫЙ-{i:02d} " + "я" * 1400 for i in range(40)]  # порядок как в БД: новые первыми
    await ai.generate_thinking_pattern_summary(insights, [])
    prompt = captured[0][0]
    assert "НОВЫЙ-00" in prompt and "НОВЫЙ-39" not in prompt


@pytest.mark.asyncio
async def test_fixed_chars_is_an_upper_bound_of_the_instructions(monkeypatch):
    captured = _capture(monkeypatch)
    await ai.generate_thinking_pattern_summary([], [])
    assert len(captured[0][0]) <= ai.FIXED_CHARS_THINKING
