import asyncio
from dataclasses import dataclass
import httpx
import json
import os
import re
import weakref
from app.services.llm_router import (  # noqa: F401 — OLLAMA_* и embed_url_from_chat_url реэкспортируются для совместимости
    OLLAMA_URL, OLLAMA_MODEL, OLLAMA_VISION_MODEL, OLLAMA_EMBED_URL, OLLAMA_EMBED_MODEL,
    embed_url_from_chat_url, resolve, check_prompt_fits, fit_texts, available_prompt_chars,
    split_budget, shrink_json_strings,
    TASK_TRANSLATE, TASK_ANALYSIS, TASK_REFLECTION, TASK_VISION, TASK_EMBEDDING,
)

# Адреса и модели Ollama, маршрутизация по типам задач — app/services/llm_router.py
# (единственное место, где заданы OLLAMA_* и LLM_<ЗАДАЧА>_*; здесь они только импортируются).


class AIUnavailable(Exception):
    """ИИ не дал результат (сеть, таймаут, HTTP-ошибка, битый JSON).
    Текст исходной ошибки в сообщение НЕ попадает: он только в логе и в __cause__ —
    раньше он возвращался как «insight» и сохранялся в БД как вывод пользователя."""
    USER_MESSAGE = "ИИ-сервис временно недоступен, попробуй чуть позже."


async def _call_provider(url: str, api_key: str, model: str, prompt: str, max_tokens: int, temperature: float) -> str:
    # Локальной Ollama ключ не нужен. Пустой ключ раньше давал заголовок "Bearer " →
    # httpx падал с "Illegal header value", а текст ошибки уходил в вывод прогноза.
    key = (api_key or "").strip()
    headers = {"Authorization": f"Bearer {key}"} if key else {}
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            url,
            headers=headers,
            json={
                "model": model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": temperature,
                "max_tokens": max_tokens,
                "top_p": 0.9,
                "response_format": {"type": "json_object"},
            },
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]


# Ollama на одной видеокарте обрабатывает запросы по очереди. Если слать всё параллельно,
# запросы стоят в очереди Ollama и упираются в таймаут httpx (120 с), хотя модель
# исправна: 18 параллельных чанков перевода — 3 успевали, 15 падали по таймауту
# (замер 20.09). Поэтому очередь держим у себя: таймаут идёт только после того,
# как вызов дождался своей очереди. Две дорожки: массовые фоновые задачи (перевод
# словаря) не должны блокировать интерактивные дольше, чем на один запрос.
_LANES: "weakref.WeakKeyDictionary" = weakref.WeakKeyDictionary()


def _lane(name: str) -> asyncio.Semaphore:
    """Семафор дорожки — на текущий event loop (семафор привязывается к loop,
    а в тестах loop'ы разные)."""
    lanes = _LANES.setdefault(asyncio.get_running_loop(), {})
    sem = lanes.get(name)
    if sem is None:
        sem = lanes[name] = asyncio.Semaphore(1)
    return sem


async def _call_llm(prompt: str, max_tokens: int, temperature: float = 0.1, lane: str = "interactive", *, task: str) -> str:
    """Единая точка вызова LLM для всего файла — раньше HTTP-запрос
    дублировался в analyze_source и translate_strings по отдельности.
    Mistral и DeepSeek-фолбэк убраны (18.09) — единственный провайдер теперь
    Ollama/Qwen (локальная модель)."""
    # Какая модель — решает роутер по типу задачи (llm_router.resolve). task обязателен: новый вызов не может
    # молча уйти «куда-нибудь» (проверяет tests/test_llm_router.py).
    target = resolve(task)
    warning = check_prompt_fits(task, prompt, max_tokens)
    if warning:
        print(warning, flush=True)
    async with _lane(lane):
        return await _call_provider(target.url, target.api_key, target.model, prompt, max_tokens, temperature)


def _extractive_summary(text: str, n: int = 3) -> str:
    sentences = re.split(r"(?<=[.!?])\s+", text.strip())
    sentences = [s.strip() for s in sentences if len(s.strip()) > 40]
    return " ".join(sentences[:n])


async def describe_image(image_bytes: bytes, content_type: str = "image/jpeg", context: str | None = None) -> str | None:
    """
    Конвертирует картинку в текстовое описание ОДИН РАЗ, через Ollama/Qwen2.5-VL
    (Mistral убран 18.09 — qwen2.5-custom текстовая-only, для vision нужна
    отдельная модель, см. OLLAMA_VISION_MODEL).
    Дальше это описание используется как обычный текст везде.
    Best-effort: возвращает None при неудаче, не бросает исключение —
    загрузка картинки не должна ломаться из-за недоступности vision.
    """
    import base64
    from PIL import Image
    import io
    try:
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        img.thumbnail((384, 384), Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=30)
        image_bytes = buf.getvalue()
        content_type = "image/jpeg"
    except Exception as e:
        print(f"[ai] describe_image: не удалось пережать картинку, отправляю как есть: {e}", flush=True)
    print(f"[ai] describe_image: отправляю {len(image_bytes)} байт ({content_type})", flush=True)
    b64 = base64.b64encode(image_bytes).decode("ascii")
    context_line = (
        f"\n\nКОНТЕКСТ: эта картинка приложена к записи \"{context}\". "
        "Сама реши, какие детали важнее всего именно для этого контекста "
        "(например, если это про людей/встречу/кастинг — важны эмоции, лица, "
        "поза; если это график/таблица/скриншот с цифрами — важны конкретные "
        "значения, подписи осей, тренды; если это документ — важен весь "
        "текст дословно). Не додумывай категорию заранее — определи сам по "
        "картинке и контексту, что здесь имеет значение."
    ) if context else ""

    prompt_content = [
        {"type": "text", "text": (
            "Опиши эту картинку подробно на русском — не 2-3 общих предложения, "
            "а по-настоящему подробный разбор: что конкретно изображено, все "
            "заметные детали (цвета, объекты, люди и их выражения/позы, если "
            "есть; цифры, подписи, весь видимый текст дословно, если есть). "
            "Это описание — единственный источник информации о картинке для "
            "другого ИИ, у которого нет доступа к самому изображению, поэтому "
            "пропущенная деталь теряется безвозвратно — лучше подробнее, чем "
            "кратко." + context_line
        )},
        {"type": "image_url", "image_url": f"data:{content_type};base64,{b64}"},
    ]
    target = resolve(TASK_VISION)
    last_error = None
    for attempt in range(1, 4):
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.post(
                    target.url,
                    json={
                        "model": target.model,
                        "messages": [{"role": "user", "content": prompt_content}],
                        "temperature": 0.2,
                        "max_tokens": 700,
                    },
                )
                if resp.status_code >= 400:
                    print(f"[ai] describe_image HTTP {resp.status_code} (попытка {attempt}): {resp.text[:500]}", flush=True)
                resp.raise_for_status()
                return resp.json()["choices"][0]["message"]["content"][:3000]
        except Exception as e:
            last_error = e
            print(f"[ai] describe_image попытка {attempt}/3 не удалась: {type(e).__name__}: {e}", flush=True)
    print(f"[ai] describe_image: все 3 попытки провалились, последняя ошибка: {last_error}", flush=True)
    return None


async def analyze_source(
    hypothesis_name: str,
    hypothesis_desc: str,
    source_text: str,
    source_url: str = "",
) -> dict:
    """
    Возвращает:
      {
        "summary":        str,
        "verdict":        "confirms" | "refutes" | "unclear",
        "verdict_reason": str,
        "source_weight":  int (1-10),
        "source_type":    str,
        "weight_reason":  str,
      }
    """
    truncated = source_text[:6000]

    prompt = (
        "Ты — строгий научный аналитик. Отвечай ТОЛЬКО валидным JSON без markdown и без текста вне JSON.\n\n"
        f"ГИПОТЕЗА: {hypothesis_name}\n"
        + (f"ОПИСАНИЕ: {hypothesis_desc}\n" if hypothesis_desc else "")
        + (f"URL ИСТОЧНИКА: {source_url}\n" if source_url else "")
        + f"\nТЕКСТ ИСТОЧНИКА (первые 6000 символов):\n{truncated}\n\n"
        "ЗАДАЧА — выполни все четыре пункта:\n\n"
        "1. РЕЗЮМЕ: напиши краткое резюме источника (2-3 предложения) на русском.\n\n"
        "2. ВЕРДИКТ: определи отношение источника к гипотезе:\n"
        "   - confirms: источник содержит данные, факты или аргументы, прямо поддерживающие гипотезу\n"
        "   - refutes: источник содержит данные, факты или аргументы, опровергающие гипотезу\n"
        "   - unclear: источник косвенно связан, нейтрален или недостаточно данных\n\n"
        "3. ВЕС ИСТОЧНИКА (1-10) — оцени надёжность и авторитетность источника:\n"
        "   10: рецензируемое научное исследование, мета-анализ\n"
        "   9:  академическая публикация, официальная статистика\n"
        "   8:  авторитетное СМИ, государственный источник\n"
        "   7:  качественная журналистика, экспертный доклад\n"
        "   6:  Википедия, профессиональный блог с источниками\n"
        "   5:  тематический блог, отраслевое издание\n"
        "   4:  личный блог, непроверенное издание\n"
        "   3:  форум, агрегатор, соцсети с источниками\n"
        "   2:  соцсети, мнение без источников\n"
        "   1:  анонимный источник, реклама, пропаганда\n\n"
        "4. ТИП источника (одно слово): academic / news / blog / social / encyclopedia / government / organization / other\n\n"
        "Формат ответа (строго JSON, все поля обязательны):\n"
        '{\n'
        '  "summary": "...",\n'
        '  "verdict": "confirms",\n'
        '  "verdict_reason": "одно предложение почему",\n'
        '  "source_weight": 7,\n'
        '  "source_type": "news",\n'
        '  "weight_reason": "одно предложение почему такой вес"\n'
        '}'
    )

    try:
        raw = await _call_llm(prompt, task=TASK_ANALYSIS, max_tokens=600)
        result = json.loads(raw)

        verdict = result.get("verdict", "unclear")
        if verdict not in ("confirms", "refutes", "unclear"):
            verdict = "unclear"

        weight = int(result.get("source_weight", 5))
        weight = max(1, min(10, weight))

        source_type = str(result.get("source_type", "other")).lower()
        if source_type not in ("academic","news","blog","social","encyclopedia","government","organization","other"):
            source_type = "other"

        return {
            "summary":        str(result.get("summary", ""))[:2000],
            "verdict":        verdict,
            "verdict_reason": str(result.get("verdict_reason", ""))[:500],
            "source_weight":  weight,
            "source_type":    source_type,
            "weight_reason":  str(result.get("weight_reason", ""))[:500],
        }

    except (httpx.ConnectError, httpx.TimeoutException):
        return {
            "summary":        _extractive_summary(source_text),
            "verdict":        "unclear",
            "verdict_reason": "ИИ-сервис недоступен — вердикт требует ручной установки.",
            "source_weight":  5,
            "source_type":    "other",
            "weight_reason":  "ИИ-сервис недоступен, вес установлен по умолчанию.",
        }
    except Exception as e:
        return {
            "summary":        _extractive_summary(source_text),
            "verdict":        "unclear",
            "verdict_reason": f"Ошибка анализа: {str(e)[:120]}",
            "source_weight":  5,
            "source_type":    "other",
            "weight_reason":  "Ошибка при анализе.",
        }


# Верхняя оценка длины инструкций промпта diff_reflections (без текстов, факторов и картинок) — для бюджета контекста;
# что это действительно верхняя граница, проверяет tests/test_llm_budget_diff.py.
FIXED_CHARS_DIFF = 2500


async def diff_reflections(factors_before: list, factors_after: list, prediction_text: str = "", image_descriptions: list[str] | None = None) -> dict:
    """
    Сравнивает два списка факторов (creation vs resolution, либо две версии
    внутри одной стадии) и возвращает семантический diff, а не строковое
    сравнение — формулировки одного и того же фактора на двух стадиях
    почти никогда не совпадают дословно.

    Возвращает:
      {
        "matched": [{"factor_before": str, "factor_after": str, "shift": str}],
        "added":   [str],  # факторы, которых не было раньше
        "dropped": [str],  # факторы, которые были, но исчезли
        "insight": str,    # 1-2 предложения о том, что это говорит о процессе принятия решений
      }
    """
    # Бюджет контекста (llm_router): факторы — произвольный текст пользователя без ограничения длины (на проде уже
    # встречалась вставка на 3372 символа), описания картинок — до 3000 символов каждое. Картинки получают не больше
    # 25% места, остаток делят «до» и «после» справедливо (меньшая часть остаётся целой); JSON урезается ВНУТРИ
    # строк — ключи и длины списков сохраняются. Раньше Ollama молча оставляла половину переполненного промпта.
    if prediction_text:
        prediction_text = prediction_text[:2000]
    room = available_prompt_chars(TASK_ANALYSIS, 1500) - FIXED_CHARS_DIFF - len(prediction_text or "")
    if image_descriptions:
        image_descriptions = fit_texts(TASK_ANALYSIS, FIXED_CHARS_DIFF + len(prediction_text or "") + int(room * 0.75),
                                       image_descriptions, [3000] * len(image_descriptions), max_tokens=1500, keep=0)
        room -= sum(len(d) + 3 for d in image_descriptions)
    sizes = [len(json.dumps(f, ensure_ascii=False)) for f in (factors_before, factors_after)]
    shares = split_budget(sizes, max(room, 200))
    factors_before = shrink_json_strings(TASK_ANALYSIS, factors_before, shares[0])
    factors_after = shrink_json_strings(TASK_ANALYSIS, factors_after, shares[1])

    images_block = ""
    if image_descriptions:
        images_block = "ПРИЛОЖЕННЫЕ К ПРОГНОЗУ ИЗОБРАЖЕНИЯ (описания, не сами картинки):\n" + \
            "\n".join(f"- {d}" for d in image_descriptions) + "\n\n"

    prompt = (
        "Ты — аналитик, помогающий человеку заметить, как менялось его мышление "
        "между двумя моментами: когда он делал прогноз, и когда подводил итог "
        "(или между двумя пересмотрами одного прогноза). "
        "Отвечай ТОЛЬКО валидным JSON без markdown и без текста вне JSON.\n\n"
        + (f"ПРОГНОЗ: {prediction_text}\n\n" if prediction_text else "")
        + images_block
        + f"ФАКТОРЫ ДО:\n{json.dumps(factors_before, ensure_ascii=False)}\n\n"
        + f"ФАКТОРЫ ПОСЛЕ:\n{json.dumps(factors_after, ensure_ascii=False)}\n\n"
        "ЗАДАЧА:\n"
        "1. Сопоставь факторы по смыслу, даже если формулировки разные "
        "(например, 'не успею из-за работы' и 'работа помешала' — один и тот же фактор).\n"
        "2. Для совпавших факторов кратко опиши сдвиг: изменился ли вес, "
        "направление (за/против), или сама формулировка причины.\n"
        "3. Отдельно перечисли факторы, которые появились только в одном "
        "из списков.\n"
        "4. Дай развёрнутый инсайт (4-6 предложений): что этот сдвиг говорит о том, "
        "как человек принимает решения — какие паттерны видны, повторяются ли они "
        "с прошлыми прогнозами по духу, и что стоило бы иметь в виду при следующем "
        "прогнозе. Наблюдение по фактам, не мораль и не общие фразы.\n"
        "ВАЖНО — дисциплина уверенности: заявляй паттерн или вывод, только если "
        "уверен в нём на основании данных перед тобой; если данных мало (например, "
        "всего одна пара факторов) или связь неочевидна — прямо напиши, что "
        "недостаточно оснований для вывода, вместо того чтобы придумывать паттерн. "
        "Честное 'недостаточно данных' лучше уверенно звучащей догадки.\n"
        "Если видишь логическую нестыковку в рассуждении — не выноси вердикт "
        "('у тебя ошибка'), а сформулируй как вопрос для размышления "
        "(сократический стиль): помоги человеку заметить это самому, а не "
        "навязывай готовый ярлык.\n\n"
        "Формат ответа (строго JSON):\n"
        '{\n'
        '  "matched": [{"factor_before": "...", "factor_after": "...", "shift": "..."}],\n'
        '  "added": ["..."],\n'
        '  "dropped": ["..."],\n'
        '  "insight": "..."\n'
        '}'
    )

    try:
        raw = await _call_llm(prompt, task=TASK_ANALYSIS, max_tokens=1500)
        result = json.loads(raw)
        return {
            "matched": result.get("matched", []) if isinstance(result.get("matched"), list) else [],
            "added":   result.get("added", []) if isinstance(result.get("added"), list) else [],
            "dropped": result.get("dropped", []) if isinstance(result.get("dropped"), list) else [],
            "insight": str(result.get("insight", ""))[:1500],
        }
    except Exception as e:
        print(f"[ai] diff_reflections: сбой ИИ: {type(e).__name__}: {str(e)[:200]}", flush=True)
        raise AIUnavailable(AIUnavailable.USER_MESSAGE) from e


async def generate_reflection_question(insight_text: str, image_descriptions: list[str] | None = None) -> str:
    """
    Один наводящий вопрос по уже готовому инсайту — помогает человеку
    самому сформулировать вывод, а не получить его в готовом виде от ИИ.
    Сократический тон: вопрос, а не вердикт. Результат ответа сохраняется
    как есть (обычный комментарий), не возвращается обратно в diff/факторы.
    """
    images_block = ""
    if image_descriptions:
        images_block = "ПРИЛОЖЕННЫЕ К ПРОГНОЗУ ИЗОБРАЖЕНИЯ (описания):\n" + \
            "\n".join(f"- {d}" for d in image_descriptions) + "\n\n"

    prompt = (
        "Ты помогаешь человеку глубже осмыслить наблюдение о его собственном "
        "мышлении. Ниже — уже готовый анализ того, как менялись его рассуждения "
        "по конкретному прогнозу.\n\n"
        + images_block +
        f"АНАЛИЗ:\n{insight_text}\n\n"
        "Задай РОВНО ОДИН открытый вопрос, который поможет человеку самому "
        "сформулировать вывод для себя — не подсказывай ответ, не выноси "
        "вердикт, не говори «у тебя ошибка», а подтолкни к рассуждению. "
        "Цель — расширить картину мира и потренировать логику через "
        "вопрос, а не через готовое утверждение. Один вопрос, коротко, "
        "на русском, без вступлений и пояснений — просто сам вопрос.\n\n"
        "Отвечай ТОЛЬКО валидным JSON без markdown: {\"question\": \"...\"}"
    )
    try:
        raw = await _call_llm(prompt, task=TASK_REFLECTION, max_tokens=200, temperature=0.3)
        result = json.loads(raw)
        return str(result.get("question", ""))[:400]
    except (httpx.ConnectError, httpx.TimeoutException, httpx.HTTPStatusError):
        return ""
    except Exception:
        return ""


# Верхняя оценка длины инструкций промпта generate_thinking_pattern_summary (без инсайтов и выводов) — для бюджета
# контекста; что это действительно верхняя граница, проверяет tests/test_llm_budget_thinking.py.
FIXED_CHARS_THINKING = 2500


async def generate_thinking_pattern_summary(insights: list[str], personal_conclusions: list[str]) -> str | None:
    """
    Агрегирующий обзор паттернов мышления поперёк множества прогнозов —
    вход: уже посчитанные тексты diff-инсайтов + личные выводы пользователя
    (не сырые прогнозы, см. review п.12). Та же промт-дисциплина, что в
    diff_reflections: честное "недостаточно данных" вместо придуманного
    паттерна, сократический тон вместо вердиктов.
    """
    # Бюджет контекста (llm_router.fit_texts): инсайты идут от новых к старым — при нехватке места отбрасываются
    # старые, каждый оставшийся получает не меньше 600 символов; личные выводы — до 35% бюджета, но целиком не
    # пропадают. Раньше вход ограничивался только числом записей (50 + 50): при полной выборке Ollama молча
    # оставляла половину промпта.
    room = available_prompt_chars(TASK_REFLECTION, 1500) - FIXED_CHARS_THINKING
    if personal_conclusions:
        personal_conclusions = fit_texts(TASK_REFLECTION, FIXED_CHARS_THINKING + int(room * 0.65), personal_conclusions,
                                         [600] * len(personal_conclusions), max_tokens=1500, keep=1)
    used = sum(len(c) + 4 for c in personal_conclusions)
    if insights:
        insights = fit_texts(TASK_REFLECTION, FIXED_CHARS_THINKING + used, insights,
                             [1500] * len(insights), max_tokens=1500, keep=1, min_each=600)
    insights_block = "\n\n".join(f"- {i}" for i in insights)
    conclusions_block = ("\n\nЛИЧНЫЕ ВЫВОДЫ ПОЛЬЗОВАТЕЛЯ (в его собственных словах):\n" +
        "\n".join(f"- {c}" for c in personal_conclusions)) if personal_conclusions else ""

    prompt = (
        "Ты помогаешь человеку увидеть системные паттерны в том, как менялось "
        "его мышление за последнее время, на основе множества отдельных "
        "наблюдений о его прогнозах.\n\n"
        f"ОТДЕЛЬНЫЕ НАБЛЮДЕНИЯ (по каждому прогнозу):\n{insights_block}"
        + conclusions_block +
        "\n\nЗАДАЧА: найди повторяющиеся паттерны через ВСЕ эти наблюдения "
        "(не пересказывай каждое по отдельности) — например, систематическая "
        "недооценка/переоценка каких-то типов факторов, повторяющиеся слепые "
        "зоны, изменение стиля рассуждений со временем. Развёрнуто, "
        "по-настоящему полезно, не общими фразами.\n\n"
        "ВАЖНО — та же дисциплина уверенности, что и в отдельных сравнениях: "
        "заявляй паттерн, только если он действительно повторяется в "
        "нескольких наблюдениях, а не в одном. Если наблюдений мало или "
        "они не складываются в общую картину — честно скажи, что пока рано "
        "делать системные выводы, вместо того чтобы искусственно находить "
        "связь. Формулируй как приглашение задуматься (сократический тон), "
        "не как готовый вердикт о характере человека.\n\n"
        "Поле summary — это СВЯЗНЫЙ ТЕКСТ для чтения человеком, обычная проза "
        "с абзацами, а не вложенная структура/список/JSON внутри строки. Не "
        "оформляй наблюдения как {{\"name\": ..., \"description\": ...}} — "
        "просто пиши развёрнутыми предложениями и абзацами, как в обычной статье.\n\n"
        "Отвечай ТОЛЬКО валидным JSON: {\"summary\": \"...\"}"
    )
    try:
        raw = await _call_llm(prompt, task=TASK_REFLECTION, max_tokens=8000, temperature=0.3)
        result = json.loads(raw)
        return str(result.get("summary", ""))
    except (httpx.ConnectError, httpx.TimeoutException, httpx.HTTPStatusError) as e:
        print(f"[ai] generate_thinking_pattern_summary недоступен: {e}", flush=True)
        return None
    except Exception as e:
        print(f"[ai] generate_thinking_pattern_summary ошибка: {e}", flush=True)
        return None


async def translate_strings(strings: dict, target_lang: str) -> dict:
    """
    Батч-перевод словаря UI-строк {key: text} на target_lang.
    Возвращает {key: translated_text}. При ошибке ИИ-сервиса — бросает исключение
    (вызывающий код должен сам решить, отдавать ли оригиналы, но НЕ кешировать их).
    """
    if not strings:
        return {}

    lang_names = {"en": "английский", "de": "немецкий", "fr": "французский",
                  "es": "испанский", "it": "итальянский", "pt": "португальский",
                  "zh": "китайский", "ja": "японский", "ko": "корейский"}
    lang_name = lang_names.get(target_lang, target_lang)

    items_json = json.dumps(strings, ensure_ascii=False, indent=0)

    prompt = (
        f"Переведи значения этого JSON-словаря с русского на {lang_name}. "
        "КЛЮЧИ ЗАПРЕЩЕНО менять, переводить, сокращать или переформатировать — "
        "каждый ключ в ответе должен быть побайтово идентичен ключу во входном JSON, "
        "включая кириллицу, пробелы и знаки препинания. Меняй только значения. "
        "Пример: вход {\"привет мир\": \"привет мир\"} -> выход {\"привет мир\": \"hello world\"} "
        "(ключ остался русским словом 'привет мир', НЕ стал 'hello_world' или 'greeting'). "
        "Плейсхолдеры вида {name}, {n}, {count} оставляй как есть, "
        "не переводи и не изменяй их. Сохраняй регистр и тон (интерфейс приложения, "
        "короткие лейблы кнопок и заголовков). "
        "Отвечай ТОЛЬКО валидным JSON с теми же ключами, без markdown, без пояснений.\n\n"
        f"{items_json}"
    )

    # Фиксированный max_tokens=2000 обрывал JSON-ответ на середине для
    # больших страниц (roadmap, docs) — модель не успевала уместить весь
    # переведённый батч, get_string давал невалидный JSON (Unterminated
    # string), а ensure_translations тихо откатывался на оригиналы.
    # Оцениваем нужный объём от размера входа: ключи в этом канале — это
    # сам исходный текст (см. useDynamicT), так что выход примерно того же
    # порядка, плюс запас на языки с более длинными словами, чем русский.
    # Раньше потолок 8000 срабатывал даже когда честная оценка требовала
    # больше — из-за этого перевод всего каталога строк (STRINGS, сотни
    # ключей после роста проекта) обрывался посреди JSON-ответа
    # (JSONDecodeError: Unterminated string) для языков, где перевод
    # компактных ключей раздувается сильнее, чем ожидалось (например,
    # японский с учётом кавычек/структуры JSON вокруг каждого значения).
    # Оценка теперь с двойным запасом, потолок поднят с большим запасом —
    # Ollama/qwen2.5-custom поддерживает контекст 32768 токенов — достаточный запас.
    estimated_tokens = len(items_json)
    max_tokens = min(24000, max(4000, estimated_tokens))

    try:
        raw = await _call_llm(prompt, task=TASK_TRANSLATE, max_tokens=max_tokens, lane="bulk")
        result = json.loads(raw)

        missing = [k for k in strings if k not in result]
        if missing:
            print(f"[translate_strings] MISSING KEYS: {missing}", flush=True)
            # Маленькие модели (напр. llama3.2:3b) иногда переименовывают
            # ключи JSON вместо того, чтобы оставить их как есть (несмотря
            # на явный запрет в промпте) — особенно на кириллице. Если
            # количество пар в ответе совпадает с запрошенным, доверяем
            # ПОРЯДКУ значений (dict в Python 3.7+ и json.loads сохраняют
            # порядок вставки) и сопоставляем их с нашими оригинальными
            # ключами напрямую, не полагаясь на то, что модель скопировала
            # ключи дословно. Так результат не откатывается на русский
            # только из-за того, что модель "исправила" ключ по-своему.
            if len(result) == len(strings):
                print("[translate_strings] FALLBACK: сопоставляю по порядку значений", flush=True)
                result = dict(zip(strings.keys(), result.values()))
            else:
                raise RuntimeError(f"ИИ-сервис не вернул ключи: {missing}")
        return {k: str(result[k]) for k in strings}

    except (httpx.ConnectError, httpx.TimeoutException) as e:
        raise RuntimeError(f"ИИ-сервис недоступен: {type(e).__name__}: {e}") from e
    except RuntimeError:
        raise
    except Exception as e:
        import traceback
        print(f"[translate_strings] ERROR: {type(e).__name__}: {e}", flush=True)
        traceback.print_exc()
        raise RuntimeError(f"Ошибка перевода: {e}") from e


@dataclass(frozen=True)
class Embedded:
    """Вектор и модель, которой он посчитан (модель сохраняется вместе с вектором в БД)."""
    vector: list[float]
    model: str


async def embed(text: str) -> "Embedded | None":
    """Эмбеддинг текста через Ollama/qwen3-embedding:0.6b (1024 измерения —
    совпадает с существующей размерностью EntityEmbedding.embedding
    (Vector(1024)), миграция колонки не нужна). Mistral убран 18.09.
    Ollama-эндпоинт для эмбеддингов ОТДЕЛЬНЫЙ от /v1/chat/completions
    (/api/embeddings), формат запроса/ответа тоже другой — "prompt" вместо
    "input", "embedding" вместо "data[0].embedding".
    Best-effort: возвращает None при недоступности сервиса — вызывающий
    код должен пропустить индексацию, а не бросать исключение наружу
    (та же философия best-effort, что в describe_image)."""
    target = resolve(TASK_EMBEDDING)
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                target.url,
                json={"model": target.model, "prompt": text[:8000]},
            )
            resp.raise_for_status()
            return Embedded(resp.json()["embedding"], target.model)
    except Exception as e:
        print(f"[ai] get_embedding не удался: {type(e).__name__}: {e}", flush=True)
        return None


async def get_embedding(text: str) -> list[float] | None:
    """Только вектор (без имени модели) — для запросов поиска. Записывать вектор в БД нужно через
    embeddings.upsert_entity_embedding: он сохраняет и модель."""
    result = await embed(text)
    return result.vector if result else None


# Верхняя оценка длины инструкций промпта find_contradictions (без текстов записей) — для бюджета контекста;
# что это действительно верхняя граница, проверяет tests/test_llm_budget.py.
FIXED_CHARS_CONTRADICTIONS = 4500


async def find_contradictions(new_text: str, candidates: list[dict]) -> list[dict]:
    """
    candidates: [{"entity_type": str, "entity_id": int, "text": str}, ...]

    Extractive-проверка на противоречия: модель ОБЯЗАНА процитировать
    дословный фрагмент из кандидата и из нового текста — это резко
    снижает пространство для фантазирования по сравнению со свободной
    генерацией вывода (см. обсуждение в чате при проектировании фичи).
    Категория (relation) — одно слово, открытое, не хардкодится: список
    уже существующих категорий передаётся отдельно на уровне выше этой
    функции (в вызывающем коде), эта функция — только сырая экстракция.

    Возвращает [] при отсутствии противоречий или недоступности сервиса —
    best-effort, не бросает исключение наружу.
    """
    if not candidates:
        return []

    # Тексты урезаются ОСОЗНАННО по бюджету контекста (llm_router.fit_texts): раньше Ollama молча
    # отбрасывала часть переполненного промпта. Кандидаты идут по близости — лишние отбрасываются с хвоста.
    texts_fit = fit_texts(TASK_ANALYSIS, FIXED_CHARS_CONTRADICTIONS, [new_text] + [c["text"] for c in candidates],
                          [2000] + [1500] * len(candidates), max_tokens=1200)
    candidates = candidates[: len(texts_fit) - 1]
    candidates_block = "\n\n".join(
        f"[ID={c['entity_id']}, TYPE={c['entity_type']}]\n{t}"
        for c, t in zip(candidates, texts_fit[1:])
    )

    prompt = (
        "Ты — строгий аналитик, ищущий смысловые противоречия между новой "
        "записью человека и его же более ранними записями (наблюдения, "
        "гипотезы, прогнозы). Отвечай ТОЛЬКО валидным JSON без markdown.\n\n"
        f"НОВАЯ ЗАПИСЬ:\n{texts_fit[0]}\n\n"
        f"СУЩЕСТВУЮЩИЕ ЗАПИСИ (с их ID):\n{candidates_block}\n\n"
        "ЗАДАЧА — найди только ЯВНЫЕ смысловые противоречия, не натяжки.\n\n"
        "ВАЖНО — частая ошибка, которую нужно избегать: две записи об одном и "
        "том же человеке/теме/проекте — это НЕ автоматически противоречие. "
        "Например, 'клиент доволен продуктом' и 'обсуждали цветовую схему для "
        "лендинга' — просто разные темы, не противоречие. Или 'клиент хочет "
        "пересмотреть цену' и 'клиент ушёл к конкуренту' — это может быть "
        "естественным развитием ситуации во времени, а не логическим "
        "противоречием. Настоящее противоречие — это когда ОДНО утверждение "
        "логически ИСКЛЮЧАЕТ другое в один и тот же момент времени, а не "
        "просто смежная или последующая по времени информация.\n\n"
        "СТРОГИЕ ПРАВИЛА:\n"
        "1. Каждое найденное противоречие ОБЯЗАНО содержать дословную цитату "
        "из существующей записи (existing_quote) и дословную цитату из новой "
        "записи (new_quote) — не пересказ, а точный фрагмент текста.\n"
        "2. Если не можешь процитировать дословно — значит противоречия нет, "
        "не включай его в ответ.\n"
        "3. relation — одно слово на русском, описывающее характер "
        "несовпадения (например: противоречие, смена_позиции, уточнение). "
        "Выбирай слово, которое честно отражает суть, а не подгоняй под "
        "заранее заданный список.\n"
        "4. confidence (0-100) — насколько ты уверен, что это настоящее "
        "смысловое противоречие, а не просто разные темы или совпадение "
        "слов. Указывай честно, только очень высокую уверенность (90+) "
        "для по-настоящему очевидных случаев — лучше пропустить сомнительное, "
        "чем придумать несуществующее.\n"
        "5. Если противоречий нет вообще — верни пустой список, это "
        "нормальный и ожидаемый результат в большинстве случаев.\n\n"
        "Формат ответа (строго JSON):\n"
        '{\n'
        '  "contradictions": [\n'
        '    {\n'
        '      "entity_id": 123,\n'
        '      "entity_type": "observation",\n'
        '      "existing_quote": "...",\n'
        '      "new_quote": "...",\n'
        '      "relation": "...",\n'
        '      "confidence": 95\n'
        '    }\n'
        '  ]\n'
        '}'
    )

    try:
        raw = await _call_llm(prompt, task=TASK_ANALYSIS, max_tokens=1200, temperature=0.1)
        result = json.loads(raw)
        items = result.get("contradictions", [])
        if not isinstance(items, list):
            return []

        valid_ids = {(c["entity_type"], c["entity_id"]) for c in candidates}
        out = []
        for item in items:
            try:
                key = (str(item.get("entity_type")), int(item.get("entity_id")))
                existing_quote = str(item.get("existing_quote", "")).strip()
                new_quote = str(item.get("new_quote", "")).strip()
                confidence = int(item.get("confidence", 0))

                if key not in valid_ids:
                    continue  # модель сослалась на несуществующий ID — отбрасываем
                if not existing_quote or not new_quote:
                    continue  # нет цитаты — не доверяем утверждению
                if confidence < 90:
                    continue  # порог уверенности, обсуждённый в чате

                out.append({
                    "entity_type": key[0],
                    "entity_id": key[1],
                    "existing_quote": existing_quote[:500],
                    "new_quote": new_quote[:500],
                    "relation": str(item.get("relation", ""))[:50],
                    "confidence": max(0, min(100, confidence)),
                })
            except (KeyError, ValueError, TypeError):
                continue  # некорректный элемент от модели — пропускаем, не роняем весь ответ

        return out

    except (httpx.ConnectError, httpx.TimeoutException, httpx.HTTPStatusError) as e:
        print(f"[ai] find_contradictions недоступен: {e}", flush=True)
        return []
    except Exception as e:
        print(f"[ai] find_contradictions ошибка: {e}", flush=True)
        return []


async def find_question_answers(question_text: str, candidates: list[dict]) -> list[dict]:
    """
    candidates: [{"entity_type": str, "entity_id": int, "text": str}, ...]

    Extractive-проверка "отвечает ли эта существующая запись человека на его
    же открытый вопрос" — тот же принцип обязательной дословной цитаты, что
    в find_contradictions, и по той же причине: свободная генерация здесь
    рискованнее, чем в contradictions, потому что ложное "да, отвечает"
    хуже ложного "есть противоречие" (человек может принять неверный ответ
    как решённый вопрос). Поэтому confidence-порог в промпте строже, и
    честный числовой confidence обязателен для каждого кандидата — не
    полагаемся только на текстовое "уверен/не уверен" модели (см.
    обсуждение калибровки в чате), число логируется в QuestionAnswerFeedback
    и на нём калибруется реальный порог отсечения позже.

    Возвращает [] при отсутствии подходящих ответов или недоступности
    сервиса — best-effort, не бросает исключение наружу.
    """
    if not candidates:
        return []

    candidates_block = "\n\n".join(
        f"[ID={c['entity_id']}, TYPE={c['entity_type']}]\n{c['text'][:1500]}"
        for c in candidates
    )

    prompt = (
        "Ты — строгий аналитик, определяющий, отвечает ли одна из "
        "существующих записей человека (наблюдения, гипотезы, прогнозы, "
        "убеждения) на его же открытый вопрос. Отвечай ТОЛЬКО валидным "
        "JSON без markdown.\n\n"
        f"ОТКРЫТЫЙ ВОПРОС:\n{question_text[:2000]}\n\n"
        f"СУЩЕСТВУЮЩИЕ ЗАПИСИ (с их ID):\n{candidates_block}\n\n"
        "ЗАДАЧА — найди только записи, которые ДЕЙСТВИТЕЛЬНО дают "
        "содержательный ответ или существенное продвижение к ответу на "
        "вопрос, а не просто касаются той же темы.\n\n"
        "ВАЖНО — частая ошибка, которую нужно избегать: запись на ту же "
        "тему, что и вопрос — это НЕ автоматически ответ. Например, вопрос "
        "'стоит ли нанимать второго разработчика?' и запись 'разработчик "
        "опоздал на созвон' — просто смежная тема, не ответ. Настоящий "
        "ответ — это когда запись содержит информацию, которая прямо "
        "помогает ответить на вопрос: данные, вывод, наблюдение "
        "по существу.\n\n"
        "СТРОГИЕ ПРАВИЛА:\n"
        "1. Каждый найденный ответ ОБЯЗАН содержать дословную цитату "
        "из записи (quote) — не пересказ, а точный фрагмент текста.\n"
        "2. Если не можешь процитировать дословно релевantный фрагмент — "
        "значит записи нечего предложить, не включай её в ответ.\n"
        "3. confidence (0-100) — насколько ты уверен, что это "
        "по-настоящему содержательный ответ на вопрос, а не просто смежная "
        "тема. Указывай честно, только высокую уверенность (85+) для "
        "по-настоящему очевидных случаев — лучше пропустить сомнительное, "
        "чем предложить нерелевантное. Если не уверен — НЕ включай запись "
        "в ответ вовсе, лучше пустой список, чем сомнительное предложение.\n"
        "4. Если подходящих ответов нет вообще — верни пустой список, это "
        "нормальный и ожидаемый результат в большинстве случаев.\n\n"
        "Формат ответа (строго JSON):\n"
        '{\n'
        '  "answers": [\n'
        '    {\n'
        '      "entity_id": 123,\n'
        '      "entity_type": "observation",\n'
        '      "quote": "...",\n'
        '      "confidence": 90\n'
        '    }\n'
        '  ]\n'
        '}'
    )
    try:
        raw = await _call_llm(prompt, task=TASK_ANALYSIS, max_tokens=1000, temperature=0.1)
        result = json.loads(raw)
        items = result.get("answers", [])
        if not isinstance(items, list):
            return []
        valid_ids = {(c["entity_type"], c["entity_id"]) for c in candidates}
        out = []
        for item in items:
            key = (item.get("entity_type"), item.get("entity_id"))
            if key not in valid_ids:
                continue
            if not item.get("quote") or not isinstance(item.get("confidence"), (int, float)):
                continue
            out.append({
                "entity_type": item["entity_type"],
                "entity_id": item["entity_id"],
                "quote": item["quote"],
                "confidence": int(item["confidence"]),
            })
        return out
    except Exception:
        return []


async def classify_fact_or_interpretation(text: str) -> str | None:
    """Определяет тип высказывания: сырой факт, интерпретация автора,
    или смесь обоих. Не оценивает верность/качество суждения — только
    жанр текста. Используется отложенной переоценкой (см. обсуждение в
    чате): "ты бы сказал так же сейчас" имеет смысл для интерпретаций,
    не для сырых фактов. Best-effort — None при недоступности сервиса,
    не должно блокировать сохранение записи."""
    prompt = (
        "Определи тип этого текста — коротко, одним словом.\n\n"
        f"ТЕКСТ: {text[:1000]}\n\n"
        "Категории:\n"
        "- fact: сырое наблюдение, событие, дословная цитата, измеримый факт "
        "('клиент написал X', 'встреча прошла в 14:00')\n"
        "- interpretation: оценка, вывод, мнение автора о том, что это значит "
        "('клиент теряет интерес', 'проект под угрозой')\n"
        "- mixed: и то и другое в одном тексте примерно поровну\n\n"
        "Отвечай ТОЛЬКО валидным JSON: {\"kind\": \"fact\"}"
    )
    try:
        raw = await _call_llm(prompt, task=TASK_ANALYSIS, max_tokens=50, temperature=0.0)
        result = json.loads(raw)
        kind = str(result.get("kind", "")).lower()
        return kind if kind in ("fact", "interpretation", "mixed") else None
    except (httpx.ConnectError, httpx.TimeoutException, httpx.HTTPStatusError) as e:
        print(f"[ai] classify_fact_or_interpretation недоступен: {e}", flush=True)
        return None
    except Exception as e:
        print(f"[ai] classify_fact_or_interpretation ошибка: {e}", flush=True)
        return None

async def classify_observation_relations(hyp_text: str, candidates: list[dict]) -> list[dict]:
    """
    candidates: [{"entity_id": int, "text": str}, ...]

    Для каждого наблюдения-кандидата определяет предполагаемую связь с
    гипотезой: "подтверждает" / "опровергает" / "связано". Тот же
    extractive-принцип, что в find_contradictions — направленная связь
    (подтверждает/опровергает) присваивается ТОЛЬКО при дословной цитате
    и высокой уверенности; иначе — нейтральное "связано". Это осознанное
    смещение в сторону нейтральности: пользователь сам решает направление
    связи при подтверждении предложения, модель не должна навязывать
    интерпретацию его собственного мышления (см. обсуждение в чате —
    инженер/скептик про риск отравления данных калибровки).

    Возвращает [] при недоступности сервиса — best-effort.
    """
    if not candidates:
        return []

    candidates_block = "\n\n".join(
        f"[ID={c['entity_id']}]\n{c['text'][:1000]}"
        for c in candidates
    )

    prompt = (
        "Ты помогаешь определить, как наблюдения человека соотносятся с его "
        "гипотезой. Отвечай ТОЛЬКО валидным JSON без markdown.\n\n"
        f"ГИПОТЕЗА:\n{hyp_text[:1500]}\n\n"
        f"НАБЛЮДЕНИЯ (с их ID):\n{candidates_block}\n\n"
        "Для КАЖДОГО наблюдения определи relation:\n"
        "- 'подтверждает' — только если наблюдение прямо и однозначно "
        "поддерживает гипотезу, и ты можешь процитировать дословный "
        "фрагмент, который это показывает.\n"
        "- 'опровергает' — только если наблюдение прямо и однозначно "
        "противоречит гипотезе, с дословной цитатой.\n"
        "- 'связано' — используй по умолчанию, если наблюдение по теме, "
        "но однозначного направления нет, либо ты не уверен на 90%+, "
        "либо не можешь дать точную цитату. НЕ натягивай направление — "
        "'связано' это нормальный и ожидаемый ответ для большинства "
        "наблюдений.\n\n"
        "СТРОГИЕ ПРАВИЛА:\n"
        "1. 'подтверждает'/'опровергает' ОБЯЗАНЫ сопровождаться дословной "
        "цитатой (quote) из текста наблюдения. Без цитаты — только 'связано'.\n"
        "2. confidence (0-100) — искренняя оценка. Для 'подтверждает'/"
        "'опровергает' используй только 90+.\n"
        "3. Включи в ответ ВСЕ переданные ID, даже если relation='связано'.\n\n"
        "Формат ответа (строго JSON):\n"
        '{\n'
        '  "relations": [\n'
        '    {"entity_id": 123, "relation": "связано", "quote": null, "confidence": 50}\n'
        '  ]\n'
        '}'
    )

    try:
        raw = await _call_llm(prompt, task=TASK_ANALYSIS, max_tokens=1200, temperature=0.1)
        result = json.loads(raw)
        items = result.get("relations", [])
        if not isinstance(items, list):
            return []

        valid_ids = {c["entity_id"] for c in candidates}
        out = []
        for item in items:
            try:
                entity_id = int(item.get("entity_id"))
                if entity_id not in valid_ids:
                    continue
                relation = str(item.get("relation", "связано"))
                confidence = int(item.get("confidence", 0))
                quote = item.get("quote")

                # Страховка от модели, проигнорировавшей инструкцию: без
                # цитаты или низкой уверенности — принудительно нейтрализуем.
                if relation in ("подтверждает", "опровергает"):
                    if not quote or confidence < 90:
                        relation = "связано"
                        quote = None

                out.append({
                    "entity_id": entity_id,
                    "relation": relation,
                    "quote": (str(quote)[:300] if quote else None),
                    "confidence": max(0, min(100, confidence)),
                })
            except (KeyError, ValueError, TypeError):
                continue

        # Наблюдения, которые модель забыла включить, — тоже "связано" по
        # умолчанию, а не выпадают из результата молча.
        returned_ids = {o["entity_id"] for o in out}
        for c in candidates:
            if c["entity_id"] not in returned_ids:
                out.append({"entity_id": c["entity_id"], "relation": "связано", "quote": None, "confidence": 0})

        return out

    except (httpx.ConnectError, httpx.TimeoutException, httpx.HTTPStatusError) as e:
        print(f"[ai] classify_observation_relations недоступен: {e}", flush=True)
        return []
    except Exception as e:
        print(f"[ai] classify_observation_relations ошибка: {e}", flush=True)
        return []
