"""Гвардовый тест: любое НОВОЕ чтение шести базовых сущностей (select/get/join/select_from/
update/delete по Observation/Hypothesis/Prediction/Worldview/Question/ResearchTask, включая
динамические через переменную model/Model/ENTITY_MODELS[...]) обязано либо иметь рядом признак
soft-delete-защиты (deleted_at/get_live/parent_alive_subquery/links_alive/entity_visibility_filter/
get_entity_for_view.../require_owned_entity/include_deleted/not_deleted/trashed_ids), либо быть
явно занесено в ALLOWLIST ниже с обоснованием. Падение теста — сигнал: посмотреть на новую
строку и решить, защита нужна или запись в ALLOWLIST оправдана.

Список собран построчным разбором вывода сканера при подшаге soft-delete (24.09.2026)."""
import pathlib
import re

MODELS = "Observation|Hypothesis|Prediction|Worldview|Question|ResearchTask"
Q = re.compile(
    rf"select\(\s*(?:{MODELS})\b|\.get\(\s*(?:{MODELS})\b|\.(?:outer)?join\(\s*(?:{MODELS})\b|"
    rf"select_from\(\s*(?:{MODELS})\b|\b(?:update|delete)\(\s*(?:{MODELS})\b"
)
DYN = re.compile(
    r"select\(\s*(?:model|Model|owner_model|other_model)\b|"
    r"\.get\(\s*(?:model|Model|owner_model|other_model)\b|ENTITY_MODELS\[|_ENTITY_MODELS\["
)
GUARD = re.compile(
    r"deleted_at|get_live|not_deleted|entity_visibility_filter|parent_alive_subquery|links_alive|"
    r"get_entity_for_(?:view|read|lab_manage)|require_owned_entity|_visibility_filter|trashed_ids|include_deleted"
)
SKIP_DIRS = ("app/models/", "app/api/v1/trash.py", "app/services/soft_delete.py",
             "app/core/lab_access.py", "app/core/slug.py")  # slug.py — сам генератор slug'ов, читает только model.id при проверке занятости

# path -> {содержимое_строки.strip(): "почему безопасно без явного deleted_at рядом"}.
# Ключ — текст строки, не номер: устойчиво к сдвигу соседних строк от несвязанных правок
# (номера уже дважды расходились с реальностью после соседних патчей — это чинит саму причину).
ALLOWLIST: dict[str, dict[str, str]] = {
    "app/api/v1/all_sources.py": {
        'select(Hypothesis.id, Hypothesis.name).where(Hypothesis.id.in_(hyp_ids))':
            "id/name гипотез только для подписи источника в списке SourceDocument своих же (уже "
            "отфильтрованных по parent_alive_subquery выше) записей — не самостоятельная выдача",
        'select(Prediction.id, Prediction.title, Prediction.text).where(Prediction.id.in_(pred_ids))':
            "то же для Prediction.title/text",
    },
    "app/services/mention_reconcile.py": {
        'live[etype] = set((await db.execute(select(model.id))).scalars().all())':
            "сверка упоминаний: записи в корзине считаются живыми (при restore упоминания возвращаются), нужны ВСЕ id",
        'for sid, html in (await db.execute(select(model.id, getattr(model, field)))).all():':
            "то же: текст записей в корзине тоже сверяется, скрытие мёртвых идёт при чтении (get_related)",
    },
    "app/api/v1/comments.py": {
        '(await db.execute(select(model.id).where(model.user_id == user.id))).scalars().all()':
            "my_entities по ENTITY_OWNER_MODELS — множество id для сравнения, не выдача записей",
        'entity = await db.get(model, eid) if model else None':
            "entity только для entity_slug/entity_title в уведомлении об own-сущности",
        'entity = await db.get(model, entity_id) if model else None':
            "entity только для recipient_roles (кому слать письмо), не выдача записи",
    },
    "app/api/v1/entity_stage.py": {
        'model = STAGE_ENTITY_MODELS[entity_type]':
            "присваивание модели, не select; visibility ниже по функции идёт через "
            "entity_visibility_filter (у lab своя ветка)",
    },
    "app/api/v1/feed.py": {
        'objs = (await db.execute(select(model).where(model.id.in_(ids)))).scalars().all()':
            "ids уже отфильтрованы по _events_alive() (parent_alive_subquery) при сборе ids_by_type "
            "(строка встречается дважды в файле — для entities и для related_titles, оба места безопасны)",
    },
    "app/api/v1/global_graph.py": {
        'model = ENTITY_MODELS[src["from_type"]]':
            "column FK-рёбра within: ids_by_type построены из model.id.where(visibility=public, deleted_at IS NULL) выше",
        'select(model.id, col).where(model.id.in_(from_ids), col.in_(to_ids))': "то же",
        'other_model = ENTITY_MODELS[other_type]': "expand: other_model только для get_live() на выходе ниже по функции",
        'model = ENTITY_MODELS[entity_type]': "ids уже отфильтрованы (аргумент функции — публичные живые id)",
        'rows = (await db.execute(select(model.id, col).where(model.id.in_(ids), col.isnot(None)))).all()':
            "select(model.id, col) — forward-сторона, id уже живые (см. выше)",
        'owner_model = ENTITY_MODELS[other_type]': "owner_model только для get_live() ниже",
        'rows = (await db.execute(select(owner_model.id, col).where(col.in_(ids)))).all()':
            "backward column: col.in_(ids) — ids уже живые",
    },
    "app/api/v1/hypotheses.py": {
        'while (await db.execute(select(Hypothesis).where(Hypothesis.slug == slug))).scalar_one_or_none():':
            "генератор слага обязан видеть корзину — п.6 ТЗ, покрыто test_dead_entity_keeps_slug_reserved",
    },
    "app/api/v1/observations.py": {
        'while (await db.execute(select(Observation).where(Observation.slug == slug))).scalar_one_or_none():': "то же (слаг)",
    },
    "app/api/v1/predictions.py": {
        'while (await db.execute(select(Prediction).where(Prediction.slug == slug))).scalar_one_or_none():': "то же (слаг)",
        'hyp = await db.get(Hypothesis, pred.hypothesis_id)':
            "инвалидация кэша разнообразия должна сработать и для гипотезы в корзине — иначе кэш "
            "устареет после restore (строка встречается дважды в файле — update_pred и close_pred)",
    },
    "app/api/v1/questions.py": {
        'while (await db.execute(select(Question).where(Question.slug == slug))).scalar_one_or_none():': "то же (слаг)",
        'entity = await db.get(model, fb.source_entity_id)':
            "entity только для подписи источника в авто-комментарии; degrade — просто fb.source_entity_type",
        'question = await db.get(Question, fb.question_id)': "question уже прошёл parent_alive_subquery выше (patched в фазе 3c)",
    },
    "app/api/v1/sources.py": {
        'hyp = await db.get(Hypothesis, doc.entity_id)':
            "инвалидация кэша разнообразия — как и predictions.py (строка встречается дважды в файле)",
    },
    "app/api/v1/tasks.py": {
        'while (await db.execute(select(ResearchTask).where(ResearchTask.slug == slug))).scalar_one_or_none():': "то же (слаг)",
        'task = await db.get(ResearchTask, tid)':
            "task только для lab_id/visibility события competing_hypothesis — вызывается после "
            "get_entity_for_lab_manage выше в той же функции",
        'o = await db.get(Observation, lnk.from_id)':
            "Observation только внутри links_alive()-отфильтрованного цикла по links выше в той же функции",
    },
    "app/api/v1/users.py": {
        'select(Hypothesis.status, func.count()).where(Hypothesis.user_id == uid, hyp_cond).group_by(Hypothesis.status)':
            "hyp_cond = entity_visibility_filter(...) определён выше по функции, вне окна сканера",
        '.join(Hypothesis, Hypothesis.id == ScaleValue.entity_id)':
            "hyp_cond из той же функции, что и выше",
        'select(model.id, model.slug, getattr(model, title_field), model.created_at)':
            "RECENT_CONFIG, cond = await vis_cond(model) в той же строке",
        'rows = (await db.execute(select(model).where(model.user_id == user.id))).scalars().all()':
            "экспорт собственных данных пользователя (/me/export) — корзина обязана попасть в выгрузку",
    },
    "app/api/v1/worldview.py": {
        'while (await db.execute(select(Worldview).where(Worldview.slug == slug))).scalar_one_or_none():': "то же (слаг)",
    },
    "app/services/calibration_source.py": {
        'q = (select(model.status, func.count())':
            "калибровка намеренно включает корзину — решение продукта, см. docstring файла",
    },
    "app/services/contradiction_recheck.py": {
        'entity = await db.get(model, emb.entity_id)': "entity_id уже отфильтрован parent_alive_subquery на выборке embeddings выше",
    },
    "app/services/contradictions.py": {
        'pred = await db.get(Prediction, entity_id)':
            "get_live не нужен: это уже сам проверяемый прогноз, вызывающий код (contradictions.py api) "
            "сам вызвал get_live выше",
        'cand_pred = await db.get(Prediction, c["entity_id"])':
            "только для подписи уверенности к уже найденному эмбеддингом кандидату (сам эмбеддинг отфильтрован)",
    },
    "app/services/embeddings.py": {
        '.join(Question, Question.id == EntityEmbedding.entity_id)':
            "join внутри similar_query, которая уже фильтрует parent_alive_subquery на EntityEmbedding",
    },
    "app/services/entity_postprocess.py": {
        'obs = await db.get(Observation, entity_id)':
            "obs.id пришёл от вызывающего роута, который только что закоммитил создание/обновление "
            "этой же записи (владение/видимость уже проверены синхронно перед коммитом); узкое окно "
            "гонки с soft-delete между коммитом и стартом фоновой задачи не создаёт нового доступа — "
            "content_kind не отображается в UI и исключён из event-log diff (_EXCLUDED_FIELDS), плюс "
            "`if obs is not None` guard на случай отсутствия записи",
    },
    "app/services/entity_hypotheses.py": {
        'parent = await db.get(model, parent_id)': "вызывается после can_link/get_entity_for_lab_manage в вызывающем коде",
    },
    "app/services/entity_image_description.py": {
        'entity = await db.get(model, entity_id)':
            "best-effort контекст для vision-промпта после уже состоявшейся загрузки картинки; узкое окно "
            "гонки (мгновение между upload и фоновой задачей) не создаёт нового доступа — не показывается пользователю",
    },
    "app/services/hypothesis_evidence.py": {
        'await db.execute(select(Hypothesis.id).where(Hypothesis.id == hyp.id).with_for_update())':
            "только блокировка строки (id наружу не отдаётся): пересчёты одной гипотезы идут по очереди, гипотеза из корзины блокируется так же",
        'hyp = (await db.execute(select(Hypothesis).where(Hypothesis.id == pred.hypothesis_id)':
            "закрытие прогноза работает и при гипотезе в корзине (как прежний db.get); новое — только чтение с блокировкой, чтобы два закрытия не затёрли evidence_signal друг друга",
        'hyp_lab_id = await db.scalar(select(Hypothesis.lab_id).where(Hypothesis.id == hypothesis_id))':
            "только lab_id для сверки лаборатории вкладов в lab_signal, не выдача записи; гипотеза из корзины сохраняет лабораторию, вклады не должны обнуляться мягким удалением (как у прогнозов), get_live вернул бы None",
        'hyp = await db.get(Hypothesis, pred.hypothesis_id)': "инвалидация кэша разнообразия — как predictions.py",
    },
    "app/services/observation_suggestions.py": {
        '.join(Hypothesis, (': "Hypothesis.deleted_at.is_(None) добавлен рядом внутри многострочного join (см. патч 24.09)",
    },
    "app/services/prediction_reflections.py": {
        'pred = await db.get(Prediction, prediction_id)': "pred только для user_id (кому шлём thinking-pattern), не выдача записи",
    },
    "app/services/question_answers.py": {
        'question = await db.get(Question, question_id)': "question_id приходит от роута questions.py, который уже вызывает get_live",
        'q = await db.get(Question, emb.entity_id)':
            "emb.entity_id уже отфильтрован parent_alive_subquery внутри similar_open_questions (embeddings.py)",
    },
    "app/services/repost.py": {
        'model = ENTITY_MODELS[target_type]': "построение НОВОЙ записи, не чтение существующей",
    },
    "app/services/thinking_patterns.py": {
        '.select_from(Prediction)': "паттерны мышления намеренно включают прогнозы из корзины — решение продукта (симметрично калибровке)",
        '.join(Prediction, Prediction.id == EntityReflectionInsight.entity_id)': "то же",
    },
}


def test_no_unguarded_reads_of_base_entities():
    offenders = []
    for path in sorted(pathlib.Path("app").rglob("*.py")):
        ps = path.as_posix()
        if any(ps.startswith(s) for s in SKIP_DIRS):
            continue
        lines = path.read_text(encoding="utf-8").split("\n")
        allowed = ALLOWLIST.get(ps, {})
        for i, line in enumerate(lines, start=1):
            if line.lstrip().startswith("#"):
                continue
            if not (Q.search(line) or DYN.search(line)):
                continue
            window = "\n".join(lines[max(0, i - 3): i + 8])
            if GUARD.search(window):
                continue
            if line.strip() in allowed:
                continue
            offenders.append(f"{ps}:{i}: {line.strip()[:120]}")
    assert not offenders, (
        "Новое чтение 6 базовых сущностей без признака soft-delete-защиты и без записи в "
        "ALLOWLIST (tests/test_soft_delete_guard.py):\n" + "\n".join(offenders)
    )
