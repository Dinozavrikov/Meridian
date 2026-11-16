"""Роутер моделей по типам задач: значения по умолчанию, переопределения, и — главное —
то, что в ai.py каждый вызов модели идёт через роутер и называет свою задачу."""
import ast
import pathlib

import pytest

from app.services import ai
from app.services import llm_router as r


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch):
    for task in r.TASKS:
        monkeypatch.delenv(f"LLM_{task.upper()}_MODEL", raising=False)
        monkeypatch.delenv(f"LLM_{task.upper()}_URL", raising=False)


def test_defaults_keep_the_previous_behaviour():
    for task in (r.TASK_TRANSLATE, r.TASK_ANALYSIS, r.TASK_REFLECTION):
        t = r.resolve(task)
        assert (t.model, t.url) == (r.OLLAMA_MODEL, r.OLLAMA_URL)
    v = r.resolve(r.TASK_VISION)
    assert (v.model, v.url) == (r.OLLAMA_VISION_MODEL, r.OLLAMA_URL)
    e = r.resolve(r.TASK_EMBEDDING)
    assert (e.model, e.url) == (r.OLLAMA_EMBED_MODEL, r.OLLAMA_EMBED_URL)


def test_model_override_touches_only_its_task(monkeypatch):
    monkeypatch.setenv("LLM_TRANSLATE_MODEL", "small-translator")
    assert r.resolve(r.TASK_TRANSLATE).model == "small-translator"
    assert r.resolve(r.TASK_ANALYSIS).model == r.OLLAMA_MODEL
    assert r.resolve(r.TASK_REFLECTION).model == r.OLLAMA_MODEL


def test_url_override_touches_only_its_task(monkeypatch):
    monkeypatch.setenv("LLM_REFLECTION_URL", "http://127.0.0.1:8080/v1/chat/completions")
    assert r.resolve(r.TASK_REFLECTION).url == "http://127.0.0.1:8080/v1/chat/completions"
    assert r.resolve(r.TASK_ANALYSIS).url == r.OLLAMA_URL


def test_empty_override_is_ignored(monkeypatch):
    monkeypatch.setenv("LLM_ANALYSIS_MODEL", "")
    assert r.resolve(r.TASK_ANALYSIS).model == r.OLLAMA_MODEL


def test_unknown_task_is_rejected():
    with pytest.raises(ValueError):
        r.resolve("nonsense")


def test_embed_url_is_derived_from_chat_url():
    assert r.embed_url_from_chat_url("http://host.docker.internal:11434/v1/chat/completions") \
        == "http://host.docker.internal:11434/api/embeddings"
    assert ai.embed_url_from_chat_url is r.embed_url_from_chat_url  # реэкспорт для совместимости


@pytest.mark.asyncio
async def test_call_llm_sends_the_request_to_the_tasks_model(monkeypatch):
    seen = []

    async def fake(url, key, model, prompt, max_tokens, temperature):
        seen.append((url, model))
        return "{}"
    monkeypatch.setattr(ai, "_call_provider", fake)
    monkeypatch.setenv("LLM_TRANSLATE_MODEL", "tr-model")
    monkeypatch.setenv("LLM_ANALYSIS_URL", "http://analysis.local/v1/chat/completions")
    await ai._call_llm("p", 10, task="translate")
    await ai._call_llm("p", 10, task="analysis")
    assert seen == [(r.OLLAMA_URL, "tr-model"), ("http://analysis.local/v1/chat/completions", r.OLLAMA_MODEL)]


# ---- Архитектурные ограничители: разбираем ai.py как дерево ----
TREE = ast.parse(pathlib.Path(ai.__file__).read_text(encoding="utf-8"))
FUNCS = {n.name: n for n in ast.walk(TREE) if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))}


def _calls(node, func_name):
    return [c for c in ast.walk(node) if isinstance(c, ast.Call) and isinstance(c.func, ast.Name) and c.func.id == func_name]


def test_every_chat_call_names_its_task_and_mapping_is_locked():
    expected = {
        "analyze_source": "TASK_ANALYSIS", "diff_reflections": "TASK_ANALYSIS",
        "find_contradictions": "TASK_ANALYSIS", "find_question_answers": "TASK_ANALYSIS",
        "classify_fact_or_interpretation": "TASK_ANALYSIS", "classify_observation_relations": "TASK_ANALYSIS",
        "generate_reflection_question": "TASK_REFLECTION", "generate_thinking_pattern_summary": "TASK_REFLECTION",
        "translate_strings": "TASK_TRANSLATE",
    }
    actual = {}
    for name, node in FUNCS.items():
        for call in _calls(node, "_call_llm"):
            kw = {k.arg: k.value for k in call.keywords}
            assert isinstance(kw.get("task"), ast.Name), f"_call_llm без task в {name}"
            actual[name] = kw["task"].id
    assert actual == expected


def test_vision_and_embeddings_go_through_the_router():
    for name, task in (("describe_image", "TASK_VISION"), ("embed", "TASK_EMBEDDING")):
        calls = _calls(FUNCS[name], "resolve")
        assert len(calls) == 1 and calls[0].args[0].id == task, name


def test_ai_module_never_reads_ollama_settings_directly():
    """Обход роутера (прямое чтение OLLAMA_* в теле кода) запрещён: имена только импортируются."""
    forbidden = {"OLLAMA_URL", "OLLAMA_MODEL", "OLLAMA_VISION_MODEL", "OLLAMA_EMBED_URL", "OLLAMA_EMBED_MODEL"}
    used = sorted({n.id for n in ast.walk(TREE) if isinstance(n, ast.Name) and n.id in forbidden})
    assert used == []


def test_context_tokens_defaults_and_overrides(monkeypatch):
    monkeypatch.delenv("LLM_CONTEXT_TOKENS", raising=False)
    monkeypatch.delenv("LLM_ANALYSIS_CONTEXT", raising=False)
    assert r.context_tokens("analysis") == 8192
    monkeypatch.setenv("LLM_CONTEXT_TOKENS", "8192")
    assert r.context_tokens("analysis") == 8192
    monkeypatch.setenv("LLM_ANALYSIS_CONTEXT", "2048")
    assert r.context_tokens("analysis") == 2048 and r.context_tokens("translate") == 8192
    monkeypatch.setenv("LLM_ANALYSIS_CONTEXT", "мусор")
    assert r.context_tokens("analysis") == 8192


def test_prompt_fit_check(monkeypatch):
    monkeypatch.delenv("LLM_CONTEXT_TOKENS", raising=False)
    monkeypatch.delenv("LLM_ANALYSIS_CONTEXT", raising=False)
    assert r.check_prompt_fits("analysis", "x" * 500) is None
    message = r.check_prompt_fits("analysis", "я" * 30000)
    assert message and "analysis" in message and "8192" in message


@pytest.mark.asyncio
async def test_call_llm_logs_prompt_overflow_but_not_normal_prompts(monkeypatch, capsys):
    async def fake(url, key, model, prompt, max_tokens, temperature):
        return "{}"
    monkeypatch.setattr(ai, "_call_provider", fake)
    monkeypatch.delenv("LLM_CONTEXT_TOKENS", raising=False)
    monkeypatch.delenv("LLM_ANALYSIS_CONTEXT", raising=False)
    await ai._call_llm("короткий промпт", 10, task="analysis")
    assert "[llm]" not in capsys.readouterr().out
    await ai._call_llm("я" * 30000, 10, task="analysis")
    assert "[llm] задача analysis" in capsys.readouterr().out
