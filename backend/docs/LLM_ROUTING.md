# Маршрутизация локальных моделей по типам задач

Код: `app/services/llm_router.py`. Вызовы моделей в `app/services/ai.py` называют тип задачи, роутер
выбирает адрес и модель. Смена модели под задачу — переменная окружения, не правка кода.

| Задача | Функции `ai.py` | Переменные (по умолчанию) |
|---|---|---|
| `translate` | `translate_strings` | `LLM_TRANSLATE_MODEL` / `_URL` (`OLLAMA_MODEL`) |
| `analysis` | `analyze_source`, `diff_reflections`, `find_contradictions`, `find_question_answers`, `classify_*` | `LLM_ANALYSIS_MODEL` / `_URL` (`OLLAMA_MODEL`) |
| `reflection` | `generate_reflection_question`, `generate_thinking_pattern_summary` | `LLM_REFLECTION_MODEL` / `_URL` (`OLLAMA_MODEL`) |
| `vision` | `describe_image` | `LLM_VISION_MODEL` / `_URL` (`OLLAMA_VISION_MODEL`) |
| `embedding` | `get_embedding` | `LLM_EMBEDDING_MODEL` / `_URL` (`OLLAMA_EMBED_MODEL`) |

Пустая переменная игнорируется. Общие адреса: `OLLAMA_URL` (чат и vision), `OLLAMA_EMBED_URL`
(по умолчанию выводится из `OLLAMA_URL`). Прод: переменные задаются в серверном `docker-compose.yml`
(секции `backend` и `recheck-worker`), он не синхронизируется скриптом деплоя.

## Правила
- Новый вызов модели — только через `_call_llm(..., task=TASK_*)`, `resolve(...)`; прямое чтение `OLLAMA_*`
  в `ai.py` запрещено (`tests/test_llm_router.py` разбирает файл как дерево и падает).
- Смена модели ЭМБЕДДИНГОВ: размерность обязана быть 1024 (колонка `Vector(1024)`), после смены обязательно
  `python3 scripts/reembed_embeddings.py` (векторы разных моделей несовместимы), затем проверка поиска.
- Другой сервер (не Ollama) для чат-задач: указывается `LLM_<ЗАДАЧА>_URL` с OpenAI-совместимым путём
  `/v1/chat/completions`. Для эмбеддингов адрес должен говорить на протоколе Ollama `/api/embeddings`.
- Заменённая модель удаляется (`ollama rm`) после проверки новой на реальных данных задачи — склад старых
  моделей на машине не держим.
- Контекст модели и бюджет промпта — см. раздел «Контекст модели» ниже (num_ctx задаётся в Modelfile).

## Эмбеддинги: метка модели и единая точка чтения
- Каждый вектор в `entity_embeddings` помечен моделью (`embedding_model`). Векторы разных моделей несовместимы
  (косинус между ними — шум, размерность 1024 может совпасть, и ошибки не будет).
- ВСЕ запросы по векторам идут через `app/services/embeddings.py` (`similar_query`, `similar_candidates`,
  `similar_open_questions`, `vectors_for`) и берут только векторы ТЕКУЩЕЙ модели. Обход (обращение к `EntityEmbedding`
  или `cosine_distance` вне этого модуля) ловит `tests/test_embedding_guard.py`; исключение — `contradiction_recheck.py`
  (использует таблицу как индекс сущностей, векторы не сравнивает).
- После смены модели старые векторы не участвуют в поиске (поиск пуст, а не мусорный), в логе при старте и при пустой
  выдаче появляется строка `[embeddings] … не участвуют в поиске`. Лечение: `env PYTHONPATH=/app python3
  scripts/reembed_embeddings.py` (только устаревшие; `--all` — все).
- LLM получает из поиска ТЕКСТЫ найденных записей, а не векторы: `find_similar` -> `find_contradictions` /
  `find_question_answers` / `classify_observation_relations`.

## Контекст модели
- Реальный контекст задаёт `PARAMETER num_ctx` в Modelfile (Ollama), а НЕ запрос: у `qwen2.5-custom` с 21.09 это 8192 (было 4096).
  Пересоздание: `printf 'FROM qwen2.5-custom:latest\nPARAMETER num_ctx 8192\n' > Modelfile && ollama create qwen2.5-custom -f Modelfile`
  (системный промпт и шаблон наследуются; перед этим сохраните `ollama show qwen2.5-custom --modelfile`, копии — `~/ollama-backups/`).
  Расход видеопамяти растёт вместе с контекстом (KV-кэш): проверяйте `ollama ps` и `rocm-smi --showmeminfo vram`.
- Ollama обрезает промпт длиннее контекста БЕЗ ошибки, причём не «хвост», а до ≈ половины контекста. Замер 21.09: контекст 4096 —
  `prompt_eval_count` = 2050 при 12000, 20000 и 30000 символов; контекст 8192 — 30000 символов дают 4098. Переполнение стоит
  половины контекста, поэтому промпт нужно держать в бюджете (см. ниже).
- Объявленный контекст: `LLM_<ЗАДАЧА>_CONTEXT` / `LLM_CONTEXT_TOKENS` (по умолчанию 8192); должен совпадать с реальным num_ctx.
- Бюджет: 2,8 символа на токен (замер: 3,1 на русском, с запасом), системный промпт + шаблон ≈ 700 токенов на каждый запрос
  (`LLM_SYSTEM_OVERHEAD_TOKENS`, замер + запас), резерв под ответ — `max_tokens` вызова (не больше 1500).
- Тексты переменной длины (кандидаты и т.п.) урезаются заранее и равномерно (`llm_router.fit_texts`): короткие остаются целыми,
  длинные делят остаток поровну, лишние кандидаты отбрасываются с хвоста; в лог идёт `[llm] … тексты урезаны`.
  Применено: `find_contradictions`. Остальные функции со списками кандидатов подключаются по мере разбора.
- `_call_llm` пишет `[llm] … Ollama оставит ≈ половину контекста`, если промпт всё равно не помещается.
- Худший случай входа для `find_question_answers`, `classify_observation_relations`, `classify_fact_or_interpretation` и
  `generate_reflection_question` проверяет `tests/test_llm_budget_all.py` (промпт из максимальных входов обязан помещаться в контекст).
  `generate_thinking_pattern_summary` покрыта `tests/test_llm_budget_thinking.py` (инсайты от новых к старым, старые отбрасываются).
  `analyze_source` помещается по построению (вход ≤ 6000 символов). `diff_reflections` покрыта `tests/test_llm_budget_diff.py`:
  факторы (произвольный текст пользователя) урезаются внутри JSON (`shrink_json_strings`: ключи и длины списков сохраняются),
  картинки получают не больше 25% места, текст прогноза ≤ 2000. Реальные размеры на проде 21.09: факторы ≤ 3372 символов
  (среднее 233), инсайты ≤ 454, тексты прогнозов ≤ 412 — типичный вход помещается с запасом, защита нужна на выбросы
  (вставленный длинный текст).

## Подбор моделей (оценка 21.09)
Кандидаты против `qwen2.5-custom` на реальном коде (`translate_strings`, `classify_fact_or_interpretation`, `find_contradictions`):
`qwen2.5:7b` не переводит 21 строку из 50 (возвращает русский), `gemma3:4b` быстрее в 2,6 раза, но ломает плейсхолдеры и теряет смысл
в японском, `gemma3:12b` скорости не даёт. Модель не заменена, кандидаты удалены. Оговорка: кандидаты шли без системного промпта
Modelfile. Смена модели под задачу — `LLM_<ЗАДАЧА>_MODEL` (см. выше) плюс проверка тем же набором.
