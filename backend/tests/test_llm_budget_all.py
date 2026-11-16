"""Худший случай входа для функций со списками кандидатов: собранный промпт помещается в контекст (8192).
Если кто-то поднимет пределы текстов, увеличит число кандидатов или уменьшит контекст, тест покажет это
раньше, чем Ollama молча оставит половину промпта."""
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


def _candidates(n, size):
    return [{"entity_type": "observation", "entity_id": i, "text": "я" * size} for i in range(n)]


CASES = {
    "find_question_answers": lambda: ai.find_question_answers("ы" * 5000, _candidates(8, 6000)),
    "classify_observation_relations": lambda: ai.classify_observation_relations("ы" * 5000, _candidates(8, 6000)),
    "classify_fact_or_interpretation": lambda: ai.classify_fact_or_interpretation("я" * 5000),
    "generate_reflection_question": lambda: ai.generate_reflection_question("я" * 5000),
}


@pytest.mark.asyncio
@pytest.mark.parametrize("name", sorted(CASES))
async def test_worst_case_prompt_fits_the_context(monkeypatch, name):
    captured = _capture(monkeypatch)
    await CASES[name]()
    assert captured, f"{name}: вызова модели не было"
    for prompt, max_tokens, task in captured:
        message = r.check_prompt_fits(task, prompt, max_tokens)
        assert message is None, f"{name}: {message}"
