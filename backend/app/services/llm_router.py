"""Маршрутизация вызовов локальных моделей по ТИПУ ЗАДАЧИ.

Раньше модель была зашита по функциям: чат — OLLAMA_MODEL, vision и эмбеддинги — свои прямые
запросы в ai.py. Теперь у каждой задачи свой «слот», и смена модели под задачу — это настройка
окружения, а не правка кода:

    задача       функции ai.py                                         переменные
    translate    translate_strings                                     LLM_TRANSLATE_MODEL / _URL
    analysis     analyze_source, diff_reflections, find_*, classify_*  LLM_ANALYSIS_MODEL / _URL
    reflection   generate_reflection_question, generate_thinking_...   LLM_REFLECTION_MODEL / _URL
    vision       describe_image                                        LLM_VISION_MODEL / _URL
    embedding    get_embedding                                         LLM_EMBEDDING_MODEL / _URL

Без переменных LLM_* поведение прежнее (OLLAMA_MODEL / OLLAMA_VISION_MODEL / OLLAMA_EMBED_MODEL,
адреса OLLAMA_URL / OLLAMA_EMBED_URL). LLM_* читаются при каждом вызове, перезапуск не нужен только
в тестах; в проде переменные задаёт docker-compose и они применяются при пересоздании контейнера.
Подробнее и правила замены модели — backend/docs/LLM_ROUTING.md.
"""
import copy
import json
import os
from dataclasses import dataclass
from urllib.parse import urlsplit

TASK_TRANSLATE = "translate"
TASK_ANALYSIS = "analysis"
TASK_REFLECTION = "reflection"
TASK_VISION = "vision"
TASK_EMBEDDING = "embedding"
TASKS = (TASK_TRANSLATE, TASK_ANALYSIS, TASK_REFLECTION, TASK_VISION, TASK_EMBEDDING)

# Mistral полностью убран 18.09: единственный провайдер теперь локальный Ollama (Qwen).
# Адрес и модели задаются переменными окружения (см. backend/docs/LLM_ROUTING.md).
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434/v1/chat/completions")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5-custom")
# Vision (describe_image): qwen2.5-custom текстовая-only (capabilities: completion, tools), нужна отдельная модель.
OLLAMA_VISION_MODEL = os.getenv("OLLAMA_VISION_MODEL", "qwen2.5vl:7b")


def embed_url_from_chat_url(chat_url: str) -> str:
    """Адрес эмбеддингов выводим из OLLAMA_URL (тот же хост Ollama, другой путь /api/embeddings).
    Раньше дефолтом был localhost:11434, а внутри контейнера там не Ollama: у боевого backend
    отдельной переменной не было, и эмбеддинги молча не считались (ConnectError в логах)."""
    parts = urlsplit(chat_url)
    return f"{parts.scheme}://{parts.netloc}/api/embeddings"


OLLAMA_EMBED_URL = os.getenv("OLLAMA_EMBED_URL") or embed_url_from_chat_url(OLLAMA_URL)
# Модель эмбеддингов сменена 20.09: mxbai-embed-large — англоязычная, окно 512 токенов (на записях длиннее
# ~800 символов Ollama отвечала 500, на русском почти не разделяла темы). qwen3-embedding:0.6b —
# многоязычная, окно 8192, 1024 измерения (совпадает с Vector(1024), миграция не нужна).
# При СМЕНЕ модели эмбеддингов обязательно пересчитать все векторы (scripts/reembed_embeddings.py):
# векторы разных моделей несовместимы.
OLLAMA_EMBED_MODEL = os.getenv("OLLAMA_EMBED_MODEL", "qwen3-embedding:0.6b")


@dataclass(frozen=True)
class LLMTarget:
    task: str
    url: str
    model: str
    api_key: str = "ollama"


def resolve(task: str) -> LLMTarget:
    """Куда и к какой модели идёт вызов данного типа задачи."""
    if task not in TASKS:
        raise ValueError(f"неизвестный тип задачи: {task!r} (допустимы: {', '.join(TASKS)})")
    default_model = {
        TASK_TRANSLATE: OLLAMA_MODEL, TASK_ANALYSIS: OLLAMA_MODEL, TASK_REFLECTION: OLLAMA_MODEL,
        TASK_VISION: OLLAMA_VISION_MODEL, TASK_EMBEDDING: OLLAMA_EMBED_MODEL,
    }[task]
    default_url = OLLAMA_EMBED_URL if task == TASK_EMBEDDING else OLLAMA_URL
    prefix = f"LLM_{task.upper()}_"
    return LLMTarget(
        task=task,
        url=os.getenv(prefix + "URL") or default_url,
        model=os.getenv(prefix + "MODEL") or default_model,
    )


# ---- Контекст модели и бюджет промпта ----
# Ollama даёт модели контекст num_ctx (Modelfile, см. LLM_ROUTING.md; у qwen2.5-custom с 21.09 — 8192, было 4096).
# Промпт длиннее контекста Ollama обрезает БЕЗ ошибки (замер 21.09: prompt_eval_count упирался в 2050 и при
# 12000, и при 20000 символов на контексте 4096 — часть промпта терялась; при контексте 8192 промпт в 30000 символов сжимается до 4098 токенов:
# остаётся ≈ половина контекста, а не «весь контекст минус хвост»). Поэтому контекст объявляется
# в окружении (должен совпадать с реальным num_ctx), переполнение пишется в лог, а тексты переменной длины
# (кандидаты для проверки противоречий и т.п.) заранее урезаются по бюджету — осознанно и равномерно (fit_texts).
DEFAULT_CONTEXT_TOKENS = 8192
# Замер 21.09 на русском тексте: ≈3,1 символа на токен; берём с запасом (JSON и смешанный текст плотнее).
CHARS_PER_TOKEN = float(os.getenv("LLM_CHARS_PER_TOKEN", "2.8"))
# Системный промпт + шаблон qwen2.5-custom добавляются к КАЖДОМУ запросу (замер 21.09 + запас).
SYSTEM_OVERHEAD_TOKENS = int(os.getenv("LLM_SYSTEM_OVERHEAD_TOKENS", "700"))
OUTPUT_RESERVE_TOKENS = 256
MAX_OUTPUT_RESERVE_TOKENS = 1500


def context_tokens(task: str) -> int:
    """Объявленный контекст модели для задачи: LLM_<ЗАДАЧА>_CONTEXT, затем LLM_CONTEXT_TOKENS, затем по умолчанию."""
    for name in (f"LLM_{task.upper()}_CONTEXT", "LLM_CONTEXT_TOKENS"):
        raw = os.getenv(name)
        if raw:
            try:
                value = int(raw)
                if value > 0:
                    return value
            except ValueError:
                pass
    return DEFAULT_CONTEXT_TOKENS


def estimate_tokens(text: str) -> int:
    return int(len(text) / CHARS_PER_TOKEN) + 1


def _reserve(max_tokens: int) -> int:
    return max(1, min(max_tokens, MAX_OUTPUT_RESERVE_TOKENS))


def available_prompt_chars(task: str, max_tokens: int = OUTPUT_RESERVE_TOKENS) -> int:
    """Сколько символов промпта помещается в контекст задачи (за вычетом системного промпта и резерва под ответ)."""
    tokens = context_tokens(task) - SYSTEM_OVERHEAD_TOKENS - _reserve(max_tokens)
    return max(int(tokens * CHARS_PER_TOKEN), 0)


def check_prompt_fits(task: str, prompt: str, max_tokens: int = OUTPUT_RESERVE_TOKENS) -> str | None:
    """Текст предупреждения, если промпт (плюс системный и резерв под ответ) не помещается в контекст, иначе None."""
    used = estimate_tokens(prompt) + SYSTEM_OVERHEAD_TOKENS
    ctx = context_tokens(task)
    reserve = _reserve(max_tokens)
    if used + reserve <= ctx:
        return None
    return (f"[llm] задача {task}: промпт ≈ {used} ток. (вместе с системным) + резерв под ответ {reserve} > контекста {ctx}: "
            "Ollama оставит ≈ половину контекста, остальное отбросит (проверьте LLM_*_CONTEXT и num_ctx модели)")


def _water_fill(sizes: list[int], budget: int) -> list[int]:
    """Справедливое распределение бюджета: короткие тексты остаются целыми, остаток делят поровну длинные."""
    shares = [0] * len(sizes)
    remaining = budget
    order = sorted(range(len(sizes)), key=lambda i: sizes[i])
    for pos, i in enumerate(order):
        give = min(sizes[i], remaining // (len(sizes) - pos))
        shares[i] = give
        remaining -= give
    return shares


def fit_texts(task: str, fixed_chars: int, texts: list[str], caps: list[int], *,
              max_tokens: int = OUTPUT_RESERVE_TOKENS, keep: int = 1, min_each: int = 200) -> list[str]:
    """Урезает тексты переменной длины так, чтобы промпт поместился в контекст задачи.
    fixed_chars — верхняя оценка длины остальной части промпта (инструкции); caps — прежние жёсткие пределы
    каждого текста; первые keep текстов не отбрасываются (например, проверяемая запись), остальные при нехватке
    бюджета отбрасываются с хвоста (кандидаты идут по близости). Возвращает список той же или меньшей длины."""
    capped = [t[:cap] for t, cap in zip(texts, caps)]
    if not capped:
        return []
    budget = available_prompt_chars(task, max_tokens) - fixed_chars
    if sum(len(t) for t in capped) <= budget:
        return capped
    budget = max(budget, min_each * keep)
    kept = len(capped)
    while kept > keep and kept * min_each > budget:
        kept -= 1
    capped = capped[:kept]
    shares = _water_fill([len(t) for t in capped], budget)
    out = [t if len(t) <= n else t[: max(n - 1, 0)].rstrip() + "…" for t, n in zip(capped, shares)]
    print(f"[llm] задача {task}: тексты урезаны по бюджету контекста ({context_tokens(task)} ток.): "
          f"{sum(len(t) for t in texts)} -> {sum(len(t) for t in out)} симв., отброшено кандидатов: {len(texts) - kept}", flush=True)
    return out


def split_budget(sizes: list[int], budget: int) -> list[int]:
    """Справедливо делит бюджет между частями: то, что помещается целиком, остаётся целым, остаток делят самые большие."""
    return _water_fill(sizes, budget)


def _json_cost(text: str) -> int:
    return len(json.dumps(text, ensure_ascii=False))


def _cut_to_json_cost(text: str, cost: int) -> str:
    """Самый длинный префикс text (с «…» в конце), чей JSON-вид (кавычки и экранирование входят) укладывается в cost символов."""
    if _json_cost(text) <= cost:
        return text
    lo, hi = 0, len(text)
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if _json_cost(text[:mid].rstrip() + "…") <= cost:
            lo = mid
        else:
            hi = mid - 1
    return text[:lo].rstrip() + "…"


def shrink_json_strings(task: str, value, max_chars: int):
    """Копия JSON-подобной структуры (dict/list), в которой длинные строки урезаны («…»), чтобы
    json.dumps(value, ensure_ascii=False) не превышал max_chars. Структура (ключи, длины списков, числа)
    сохраняется — JSON остаётся валидным и осмысленным для модели; короткие строки остаются целыми, остаток
    бюджета делят длинные поровну. Если структура и так помещается — возвращается как есть (тот же объект),
    в лог ничего не пишется."""
    def size(v) -> int:
        return len(json.dumps(v, ensure_ascii=False))

    if size(value) <= max_chars:
        return value
    clone = copy.deepcopy(value)
    slots: list[tuple] = []

    def walk(node) -> None:
        pairs = node.items() if isinstance(node, dict) else enumerate(node) if isinstance(node, list) else ()
        for key, item in list(pairs):
            if isinstance(item, str):
                slots.append((node, key))
            else:
                walk(item)

    walk(clone)
    if not slots:
        return value  # урезать нечего (структура и числа) — отдаём как есть
    originals = [container[key] for container, key in slots]
    costs = [_json_cost(t) for t in originals]
    overhead = size(clone) - sum(costs)  # скобки, ключи, запятые, числа
    shares = _water_fill(costs, max(max_chars - overhead, 3 * len(slots)))
    for (container, key), text, share in zip(slots, originals, shares):
        container[key] = _cut_to_json_cost(text, share)
    print(f"[llm] задача {task}: JSON урезан по бюджету контекста: {size(value)} -> {size(clone)} симв.", flush=True)
    return clone
