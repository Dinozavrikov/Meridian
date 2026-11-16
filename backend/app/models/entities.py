from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Text, Integer, Boolean, DateTime, ForeignKey, CheckConstraint, UniqueConstraint, Index, func, text as sa_text
from sqlalchemy.dialects.postgresql import JSONB
from datetime import datetime
from app.db.base import Base, TimestampMixin
from app.models.mixins import SoftDeleteMixin, soft_delete_index
from pgvector.sqlalchemy import Vector


class Observation(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "observations"
    id:     Mapped[int] = mapped_column(primary_key=True)
    user_id:Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    date:   Mapped[str] = mapped_column(String(10))
    author: Mapped[str] = mapped_column(String(128))
    title:  Mapped[str] = mapped_column(String(255), default="")
    slug:   Mapped[str] = mapped_column(String(80), default="")
    text:   Mapped[str] = mapped_column(Text)
    status:     Mapped[str]        = mapped_column(String(64), default="осмысленное")
    # None = «не оценено» (это не то же самое, что 0 = «оценено как наименьшее»)
    importance: Mapped[int | None] = mapped_column(Integer, nullable=True, default=None)
    visibility: Mapped[str]      = mapped_column(String(16), default="private", index=True)
    lab_id:     Mapped[int | None] = mapped_column(ForeignKey("labs.id", ondelete="SET NULL"), nullable=True, index=True)
    # 'fact' | 'interpretation' | 'mixed' | None (ещё не классифицировано).
    # Считается фоново после сохранения (services/ai.py::classify_fact_or_interpretation),
    # не блокирует создание записи. Используется отложенной переоценкой,
    # чтобы приоритизировать именно интерпретации — "ты бы сказал так же
    # сейчас" имеет смысл для мнений, не для сырых фактов.
    content_kind: Mapped[str | None] = mapped_column(String(16), nullable=True)

    __table_args__ = (
        Index("idx_observations_created_at", sa_text("created_at DESC")),
        soft_delete_index("observations"),
        UniqueConstraint("slug", name="observations_slug_unique"),
        # Пустое название ломает подписи в графе; схема и форма отсекают его раньше, это страховка
        # для кода, который пишет Observation(...) в обход схемы. \s ловит и табы с переводами строк.
        CheckConstraint(r"title !~ '^\s*$'", name="observations_title_not_blank"),
    )


class Hypothesis(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "hypotheses"
    id:             Mapped[int] = mapped_column(primary_key=True)
    user_id:        Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name:           Mapped[str] = mapped_column(String(255))
    slug:           Mapped[str] = mapped_column(String(80), default="")
    description:    Mapped[str] = mapped_column(Text, default="")
    # Что убедило бы пользователя, что гипотеза НЕВЕРНА — фиксируется до того,
    # как накопятся подтверждающие данные (см. обсуждение confirmation bias
    # в продуктовом плане). Не hard-constraint в БД (default="") — фронт
    # мягко подталкивает заполнить, но не блокирует сохранение полностью.
    falsification_criteria: Mapped[str] = mapped_column(Text, default="")
    date_created:   Mapped[str] = mapped_column(String(10))
    status:         Mapped[str] = mapped_column(String(64), default="идея")
    stability:      Mapped[int] = mapped_column(Integer, default=5)
    research_load:  Mapped[int] = mapped_column(Integer, default=5)
    maturity:       Mapped[int] = mapped_column(Integer, default=0)
    risk:           Mapped[int] = mapped_column(Integer, default=5)
    # Кэш последнего расчёта индекса разнообразия доказательств (наблюдения/
    # источники/прогнозы, бакетированные по независимости — см.
    # services/evidence_diversity.py). NULL = ещё не считалось. Пересчитывается
    # лениво при открытии гипотезы, если инвалидирован (см. diversity_computed_at
    # и события изменения Link/SourceDocument/Prediction).
    evidence_diversity_cache: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    diversity_computed_at:    Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    visibility: Mapped[str]       = mapped_column(String(16), default="private", index=True)
    lab_id:     Mapped[int | None] = mapped_column(ForeignKey("labs.id", ondelete="SET NULL"), nullable=True, index=True)
    # Бегущий накопленный сигнал доказательств (surprisal-based) от закрытых
    # прогнозов, привязанных к этой гипотезе. См. services/hypothesis_evidence.py
    evidence_signal: Mapped[float] = mapped_column(default=0.0)
    is_onboarding: Mapped[bool] = mapped_column(Boolean, default=False)

    __table_args__ = (
        Index("idx_hypotheses_created_at", sa_text("created_at DESC")),
        soft_delete_index("hypotheses"),
        UniqueConstraint("slug", name="hypotheses_slug_unique"),
    )


class Prediction(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "predictions"
    id:                  Mapped[int] = mapped_column(primary_key=True)
    user_id:             Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title:               Mapped[str] = mapped_column(String(255), default="")
    slug:                Mapped[str] = mapped_column(String(80), default="")
    text:                Mapped[str] = mapped_column(Text)
    date_created:        Mapped[str] = mapped_column(String(10))
    expected_check_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    hypothesis_id:       Mapped[int | None] = mapped_column(ForeignKey("hypotheses.id", ondelete="SET NULL"), nullable=True)
    status:              Mapped[str] = mapped_column(String(64), default="не проверен")
    confidence:          Mapped[int | None] = mapped_column(Integer, nullable=True)  # 0-100, субъективная уверенность
    result_notes:        Mapped[str] = mapped_column(Text, default="")
    visibility: Mapped[str]       = mapped_column(String(16), default="private", index=True)
    lab_id:     Mapped[int | None] = mapped_column(ForeignKey("labs.id", ondelete="SET NULL"), nullable=True, index=True)
    reminder_sent: Mapped[bool] = mapped_column(Boolean, default=False)
    is_onboarding: Mapped[bool] = mapped_column(Boolean, default=False)
    # False — прогноз-стресс-тест: "если это сбудется, гипотеза как раз
    # НЕВЕРНА" (см. обсуждение индекса разнообразия доказательств).
    # Default True сохраняет прежнее поведение для всех существующих
    # данных: сбывшийся прогноз подтверждает родительскую гипотезу.
    confirms_hypothesis_if_true: Mapped[bool] = mapped_column(Boolean, default=True)
    # Сколько закрытие реально внесло в hypothesis.evidence_signal (с калибровкой на момент закрытия).
    # NULL — закрыт до появления колонки; 0.0 — закрыт без гипотезы; число — внесённый вклад.
    signal_contribution: Mapped[float | None] = mapped_column(nullable=True)
    # Вклад в СИГНАЛ ЛАБОРАТОРИИ гипотезы (совместный, отдельно от личного). NULL — закрыт до колонки;
    # 0.0 — не участвует (нет лаборатории, лаборатории разные, автор не участник); число — внесённый вклад.
    lab_signal_contribution: Mapped[float | None] = mapped_column(nullable=True)

    __table_args__ = (
        Index("idx_predictions_created_at", sa_text("created_at DESC")),
        soft_delete_index("predictions"),
        UniqueConstraint("slug", name="predictions_slug_unique"),
    )


class EntityReflection(Base):
    """Append-only журнал факторов рефлексии — полиморфный (entity_type/
    entity_id), изначально был только под Prediction (stage creation/
    resolution), теперь используется и для Worldview (только stage='creation'
    — у убеждения нет стадии "резолюции", вся лента пересмотров хранится
    в одной стадии, сравнение — первая/последняя версия, как в run_manual_diff).
    Без FK — entity_id может указывать на разные таблицы, тот же паттерн,
    что у EntityComment/EntityImage. Без TimestampMixin: реальная таблица
    содержит только created_at, без updated_at — записи не редактируются,
    только добавляются."""
    __tablename__ = "prediction_reflections"
    id:                Mapped[int] = mapped_column(primary_key=True)
    entity_type:        Mapped[str] = mapped_column(String(32))  # 'prediction' | 'worldview'
    entity_id:          Mapped[int] = mapped_column(Integer)
    stage:              Mapped[str] = mapped_column(String(16))  # 'creation' | 'resolution'
    factors:            Mapped[list] = mapped_column(JSONB)
    raw_dialogue_text:  Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at:         Mapped[datetime] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        Index("ix_prediction_reflections_entity", "entity_type", "entity_id"),
        Index("ix_prediction_reflections_entity_stage", "entity_type", "entity_id", "stage", "created_at"),
    )


class UserThinkingPattern(Base):
    """Append-only лента агрегирующих обзоров паттернов мышления поперёк
    множества прогнозов. Генерируется по накоплению данных (не по календарю),
    см. review.md п.12 — не таблица "текущего состояния", а лента записей,
    каждая — снимок обзора на момент, когда был пройден очередной порог."""
    __tablename__ = "user_thinking_patterns"
    id:             Mapped[int] = mapped_column(primary_key=True)
    user_id:        Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    summary:        Mapped[str] = mapped_column(Text)
    based_on_count: Mapped[int] = mapped_column(Integer)
    created_at:     Mapped[datetime] = mapped_column(DateTime(timezone=True))


class EntityReflectionInsight(Base):
    """Append-only журнал результатов diff факторов — полиморфный, как и
    EntityReflection. Может создаваться многократно на сущность: по ручному
    запросу ('manual'), и автоматически при резолюции прогноза ('resolution')
    — у Worldview всегда 'manual', там нет авто-триггера при закрытии."""
    __tablename__ = "prediction_reflection_insights"
    id:            Mapped[int] = mapped_column(primary_key=True)
    entity_type:   Mapped[str] = mapped_column(String(32))
    entity_id:     Mapped[int] = mapped_column(Integer)
    matched:       Mapped[list] = mapped_column(JSONB)
    added:         Mapped[list] = mapped_column(JSONB)
    dropped:       Mapped[list] = mapped_column(JSONB)
    insight:       Mapped[str] = mapped_column(Text)
    triggered_by:  Mapped[str] = mapped_column(String(16))  # 'manual' | 'resolution'
    created_at:    Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (Index("ix_prediction_reflection_insights_entity", "entity_type", "entity_id"),)


class Worldview(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "worldview"
    id:              Mapped[int] = mapped_column(primary_key=True)
    user_id:         Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    date:            Mapped[str] = mapped_column(String(10))
    belief:          Mapped[str] = mapped_column(Text)
    slug:            Mapped[str] = mapped_column(String(80), default="")
    status:          Mapped[str] = mapped_column(String(64), default="гипотеза")
    confirming_data: Mapped[str] = mapped_column(Text, default="")
    refuting_data:   Mapped[str] = mapped_column(Text, default="")
    confidence:      Mapped[int | None] = mapped_column(Integer, nullable=True)  # 1-5, уверенность в убеждении
    visibility: Mapped[str]       = mapped_column(String(16), default="private", index=True)
    lab_id:     Mapped[int | None] = mapped_column(ForeignKey("labs.id", ondelete="SET NULL"), nullable=True, index=True)

    __table_args__ = (
        Index("idx_worldview_created_at", sa_text("created_at DESC")),
        soft_delete_index("worldview"),
        UniqueConstraint("slug", name="worldview_slug_unique"),
    )


class Question(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "questions"
    id:           Mapped[int] = mapped_column(primary_key=True)
    user_id:      Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title:        Mapped[str] = mapped_column(String(255))
    slug:         Mapped[str] = mapped_column(String(80), default="")
    text:         Mapped[str] = mapped_column(Text, default="")
    status:       Mapped[str] = mapped_column(String(64), default="открыт")
    priority:     Mapped[str] = mapped_column(String(32), default="средний")
    # None = «не оценено» (это не то же самое, что 0 = «оценено как наименьшее»)
    importance:   Mapped[int | None] = mapped_column(Integer, nullable=True, default=None)
    answer:       Mapped[str] = mapped_column(Text, default="")
    date_created: Mapped[str] = mapped_column(String(10))
    visibility: Mapped[str]       = mapped_column(String(16), default="private", index=True)
    lab_id:     Mapped[int | None] = mapped_column(ForeignKey("labs.id", ondelete="SET NULL"), nullable=True, index=True)

    __table_args__ = (
        Index("idx_questions_created_at", sa_text("created_at DESC")),
        soft_delete_index("questions"),
        UniqueConstraint("slug", name="questions_slug_unique"),
    )


class ResearchTask(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "research_tasks"
    id:          Mapped[int] = mapped_column(primary_key=True)
    user_id:     Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name:        Mapped[str] = mapped_column(String(255))
    slug:        Mapped[str] = mapped_column(String(80), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    status:      Mapped[str] = mapped_column(String(64), default="открыта")
    progress:    Mapped[int] = mapped_column(Integer, default=0)
    visibility:  Mapped[str] = mapped_column(String(16), default="private", index=True)
    lab_id:      Mapped[int | None] = mapped_column(ForeignKey("labs.id", ondelete="SET NULL"), nullable=True, index=True)

    __table_args__ = (
        soft_delete_index("research_tasks"),
        UniqueConstraint("slug", name="research_tasks_slug_unique"),
    )


class Result(Base, TimestampMixin):
    """Финальный артефакт исследования лабы — синтезированный документ со
    сквозными ссылками (через Link) на прогнозы/наблюдения/гипотезы, а не
    вердикт одного прогноза (см. ТЗ п.11, п.24 — сознательное исключение из
    принципа "не плодить сущности": Result выражает то, что Prediction в
    принципе не может — агрегат из многих источников, не привязанный 1:1 ни
    к одной записи). lab_id обязателен — в отличие от прочих сущностей,
    результат не бывает личным вне контекста лабы; удаление лабы удаляет её
    результаты каскадно (нет валидной комбинации "результат без лабы").
    is_published — единственный переключатель публичного чтения вне лабы;
    публикация не выводится из visibility лабы (см. ТЗ п.23/п.24) и не
    равнозначна visibility='public' самого результата — устанавливается
    только через отдельный эндпоинт, только owner/admin лабы, и только пока
    visibility=='lab' (не из 'private')."""
    __tablename__ = "results"
    id:          Mapped[int] = mapped_column(primary_key=True)
    user_id:     Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    lab_id:      Mapped[int] = mapped_column(ForeignKey("labs.id", ondelete="CASCADE"), index=True)
    title:       Mapped[str] = mapped_column(String(255))
    slug:        Mapped[str] = mapped_column(String(80), default="")
    body:        Mapped[str] = mapped_column(Text, default="")
    visibility:  Mapped[str] = mapped_column(String(16), default="private", index=True)
    is_published: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    __table_args__ = (UniqueConstraint("slug", name="results_slug_unique"),)


class ResultSourceLink(Base, TimestampMixin):
    """Result цитирует уже существующий SourceDocument, прикреплённый к другой
    сущности этой же лабы — без дублирования данных источника и без
    повторного скрейпинга (решение с Алексеем 16.08: вариант Б, чистая связь,
    не копия — см. обсуждение в сессии). Проверка "источник реально из этой
    лабы" — на сервере при создании связи (link_source), не только в списке
    /available, чтобы нельзя было подсунуть чужой source_document_id напрямую."""
    __tablename__ = "result_source_links"
    id:                 Mapped[int] = mapped_column(primary_key=True)
    result_id:          Mapped[int] = mapped_column(ForeignKey("results.id", ondelete="CASCADE"), index=True)
    source_document_id: Mapped[int] = mapped_column(ForeignKey("source_documents.id", ondelete="CASCADE"), index=True)

    __table_args__ = (UniqueConstraint("result_id", "source_document_id", name="result_source_links_unique"),)


class ResultEditSuggestion(Base):
    """Предложенная участником лабы полная альтернативная версия body —
    не гранулярный diff (см. обсуждение с Алексеем: diff вычисляется на лету
    во фронтенде через npm-библиотеку, для сравнения; хранится всегда целая
    версия, не патч — упрощает модель и избегает протухания diff'а, если
    документ меняется между подачей предложения и его рассмотрением).
    Только owner/admin лабы решает status; заявитель не может сам принять
    свою же правку. created_at — через тот же TimestampMixin, что и везде в
    проекте (naive DateTime); нет собственного updated_at — запись меняется
    только один раз, при решении (status/decided_at), не годовым onupdate."""
    __tablename__ = "result_edit_suggestions"
    id:            Mapped[int] = mapped_column(primary_key=True)
    result_id:     Mapped[int] = mapped_column(ForeignKey("results.id", ondelete="CASCADE"), index=True)
    author_id:     Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    proposed_body: Mapped[str] = mapped_column(Text)
    status:        Mapped[str] = mapped_column(String(16), default="pending", index=True)  # pending|accepted|rejected
    created_at:    Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
    decided_at:    Mapped[datetime | None] = mapped_column(nullable=True)
    decided_by:    Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)


class Tag(Base):
    __tablename__ = "tags"
    id:      Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name:    Mapped[str] = mapped_column(String(128))
    __table_args__ = (UniqueConstraint("user_id", "name"),)


class EntityTag(Base):
    __tablename__ = "entity_tags"
    entity_type: Mapped[str] = mapped_column(String(32), primary_key=True)
    entity_id:   Mapped[int] = mapped_column(Integer, primary_key=True)
    tag_id:      Mapped[int] = mapped_column(ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True)


class Link(Base):
    __tablename__ = "links"
    id:        Mapped[int] = mapped_column(primary_key=True)
    user_id:   Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    from_type: Mapped[str] = mapped_column(String(32))
    from_id:   Mapped[int] = mapped_column(Integer)
    to_type:   Mapped[str] = mapped_column(String(32))
    to_id:     Mapped[int] = mapped_column(Integer)
    link_type: Mapped[str] = mapped_column(String(64), default="related")
    # когда создана; у связей, созданных до появления колонки, NULL (дата неизвестна)
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, server_default=func.now())
    __table_args__ = (UniqueConstraint("user_id", "from_type", "from_id", "to_type", "to_id"),)


class ScaleDef(Base, TimestampMixin):
    """Кастомная шкала пользователя, либо переопределение описаний встроенной
    (тогда builtin_key задан, а entity_type/min_val/... не используются)."""
    __tablename__ = "scale_defs"
    id:           Mapped[int]       = mapped_column(primary_key=True)
    user_id:      Mapped[int]       = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    builtin_key:  Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    entity_type:  Mapped[str]       = mapped_column(String(32), default="", index=True)
    name:         Mapped[str]       = mapped_column(String(128), default="")
    description:  Mapped[str]       = mapped_column(Text, default="")
    min_val:      Mapped[int]       = mapped_column(Integer, default=0)
    max_val:      Mapped[int]       = mapped_column(Integer, default=10)
    step:         Mapped[int]       = mapped_column(Integer, default=1)
    group_by:     Mapped[str]       = mapped_column(String(32), default="none")
    color:        Mapped[str]       = mapped_column(String(16), default="#4A90D9")
    levels:       Mapped[str]       = mapped_column(Text, default="[]")  # JSON [{value,label,desc}]
    __table_args__ = (UniqueConstraint("user_id", "builtin_key"),)


class ScaleValue(Base):
    """Значение шкалы для произвольной сущности любого типа.
    scale_id — id встроенной шкалы ("maturity") либо "custom_<ScaleDef.id>"."""
    __tablename__ = "scale_values"
    user_id:     Mapped[int]   = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    entity_type: Mapped[str]   = mapped_column(String(32), primary_key=True)
    entity_id:   Mapped[int]   = mapped_column(Integer, primary_key=True)
    scale_id:    Mapped[str]   = mapped_column(String(64), primary_key=True)
    value:       Mapped[float] = mapped_column(default=0)


class CalibrationStat(Base):
    """Калибровка прогнозиста в конкретном разрезе (личное/публичное/лаборатория).
    scope_type: 'personal' | 'public' | 'lab' | 'lab_member'
    scope_key:  user_id, либо lab_id, либо "lab_id:user_id" для lab_member."""
    __tablename__ = "calibration_stats"
    scope_type: Mapped[str]   = mapped_column(String(16), primary_key=True)
    scope_key:  Mapped[str]   = mapped_column(String(64), primary_key=True)
    n_closed:   Mapped[int]   = mapped_column(Integer, default=0)
    brier_sum:  Mapped[float] = mapped_column(default=0.0)
    updated_at: Mapped[str]   = mapped_column(String(32), default="")
class MaturitySuggestion(Base, TimestampMixin):
    """Предложение изменить зрелость гипотезы по формуле — не применяется
    автоматически, ждёт явного accept/dismiss от пользователя."""
    __tablename__ = "maturity_suggestions"
    id:               Mapped[int]   = mapped_column(primary_key=True)
    hypothesis_id:    Mapped[int]   = mapped_column(ForeignKey("hypotheses.id", ondelete="CASCADE"), index=True)
    raw_signal:       Mapped[float] = mapped_column(default=0.0)
    current_level:    Mapped[int]  = mapped_column(Integer)
    suggested_level:  Mapped[int]  = mapped_column(Integer)
    reason:           Mapped[str]  = mapped_column(Text, default="")
    status:           Mapped[str]  = mapped_column(String(16), default="pending")  # pending|accepted|dismissed
    # части raw_signal числами (текст баннера собирает фронт); у строк до миграции NULL — тогда показываем reason
    pred_signal:      Mapped[float | None] = mapped_column(nullable=True)
    obs_signal:       Mapped[float | None] = mapped_column(nullable=True)
    lab_signal:       Mapped[float | None] = mapped_column(nullable=True)
    from sqlalchemy import Index as _Index, text as _text
    # не более одного pending на гипотезу (get_maturity_suggestion читает через scalar_one_or_none)
    __table_args__ = (_Index("uq_maturity_suggestions_one_pending", "hypothesis_id", unique=True,
                             postgresql_where=_text("status = 'pending'")),)
class HypStatusHistory(Base):
    __tablename__ = "hyp_status_history"
    id:            Mapped[int] = mapped_column(primary_key=True)
    hypothesis_id: Mapped[int] = mapped_column(ForeignKey("hypotheses.id", ondelete="CASCADE"), index=True)
    status:        Mapped[str] = mapped_column(String(64))
    changed_at:    Mapped[str] = mapped_column(String(32), default="")


class EntityHypothesis(Base):
    """Полиморфная связь «конкурирующая гипотеза» — привязывается к Задаче ИЛИ Вопросу.
    Для Задач доступно и лично, и в лабе (как было изначально с TaskHypothesis);
    для Вопросов — строго внутри лабораторий (см. labs/[id]/page.tsx)."""
    __tablename__ = "entity_hypotheses"
    parent_type:   Mapped[str] = mapped_column(String(16), primary_key=True, default="task")  # "task" | "question"
    parent_id:     Mapped[int] = mapped_column(Integer, primary_key=True)
    hypothesis_id: Mapped[int] = mapped_column(ForeignKey("hypotheses.id", ondelete="CASCADE"), primary_key=True)
    # role: leading | alternative | rejected — решение автора, расчёты не меняет; stance — как гипотеза соотносится с записью
    role:          Mapped[str] = mapped_column(String(16), default="alternative", server_default="alternative")
    stance:        Mapped[str] = mapped_column(String(64), default="связано", server_default="связано")


class Event(Base):
    """Append-only лог действий для ленты (см. ACCESS_POLICY.md / labs feed spec).
    Лента строится ЧТЕНИЕМ ИЗ ЭТОЙ ТАБЛИЦЫ, а не UNION ALL по сущностям —
    только так можно показать действия (привязка, конкурирующая гипотеза,
    смена статуса), у которых нет собственной строки-сущности."""
    __tablename__ = "events"
    id:            Mapped[int]      = mapped_column(primary_key=True)
    type:          Mapped[str]      = mapped_column(String(32), index=True)
    # Список типов неполный и растёт: полный — grep "emit_event(" по backend/app. В старую ленту попадают
    # FEED_EVENT_TYPES (api/v1/feed.py), в ленту-группы ещё и visibility_changed (GROUP_ACTIVITY_EVENT_TYPES).
    actor_id:      Mapped[int]      = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    entity_type:   Mapped[str]      = mapped_column(String(32), index=True)
    entity_id:     Mapped[int]      = mapped_column(Integer, index=True)
    related_type:  Mapped[str | None] = mapped_column(String(32), nullable=True)
    related_id:    Mapped[int | None] = mapped_column(Integer, nullable=True)
    lab_id:        Mapped[int | None] = mapped_column(ForeignKey("labs.id", ondelete="CASCADE"), nullable=True, index=True)
    visibility:    Mapped[str]      = mapped_column(String(16), default="private", index=True)
    meta:          Mapped[dict]     = mapped_column(JSONB, default=dict)
    created_at:    Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=sa_text("now()"), index=True)

    __table_args__ = (
        Index("ix_events_lab_created", "lab_id", "created_at"),
        Index("ix_events_visibility_created", "visibility", "created_at"),
    )


class TaskScale(Base):
    """Шкала измерения внутри исследовательской задачи."""
    __tablename__ = "task_scales"
    id:           Mapped[int]   = mapped_column(primary_key=True)
    task_id:      Mapped[int]   = mapped_column(ForeignKey("research_tasks.id", ondelete="CASCADE"), index=True)
    name:         Mapped[str]   = mapped_column(String(128))
    description:  Mapped[str]   = mapped_column(Text, default="")
    min_val:      Mapped[float] = mapped_column(default=0)
    max_val:      Mapped[float] = mapped_column(default=10)
    current_val:  Mapped[float] = mapped_column(default=0)
    value_labels: Mapped[str]   = mapped_column(Text, default="{}")   # JSON {val: label}
    auto_formula: Mapped[str]   = mapped_column(String(512), default="")  # e.g. "confirming / (confirming + refuting)"
    unit:         Mapped[str]   = mapped_column(String(32), default="")   # e.g. "%", "баллов"

class TaskScaleHypothesis(Base):
    """Привязка шкалы к конкурирующей гипотезе внутри задачи."""
    __tablename__ = "task_scale_hypotheses"
    task_scale_id: Mapped[int] = mapped_column(ForeignKey("task_scales.id", ondelete="CASCADE"), primary_key=True)
    hypothesis_id: Mapped[int] = mapped_column(ForeignKey("hypotheses.id", ondelete="CASCADE"), primary_key=True)


class SourceDocument(Base, TimestampMixin):
    """Внешний источник, прикреплённый к произвольной сущности
    (гипотеза, прогноз и т.д.) через полиморфную пару entity_type/entity_id —
    тот же паттерн, что уже используется в entity_comments/scale_values."""
    __tablename__ = "source_documents"
    id:             Mapped[int]  = mapped_column(primary_key=True)
    user_id:        Mapped[int]  = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    entity_type:    Mapped[str]  = mapped_column(String(32))
    entity_id:      Mapped[int]  = mapped_column(Integer)
    url:            Mapped[str]  = mapped_column(String(2048))
    title:          Mapped[str]  = mapped_column(String(512),  default="")
    summary:        Mapped[str]  = mapped_column(Text,         default="")
    verdict_reason: Mapped[str]  = mapped_column(Text,         default="")
    source_weight:  Mapped[int]  = mapped_column(Integer,      default=5)   # 1-10
    source_type:    Mapped[str]  = mapped_column(String(64),   default="unknown")
    verdict:        Mapped[str]  = mapped_column(String(32),   default="pending")  # confirms|refutes|unclear|pending
    verdict_by_user:Mapped[bool] = mapped_column(Boolean,      default=False)
    status:         Mapped[str]  = mapped_column(String(32),   default="pending")  # pending|processing|done|error
    error_msg:      Mapped[str]  = mapped_column(Text,         default="")
    weight_reason:  Mapped[str]  = mapped_column(Text,         default="")

    __table_args__ = (Index("ix_source_documents_entity", "entity_type", "entity_id"),)


class EntityImage(Base, TimestampMixin):
    """Изображение, прикреплённое к произвольной сущности — тот же полиморфный
    паттерн entity_type/entity_id, что и SourceDocument. Хранится в двух видах:
    сжатый полноразмерный (filename) и миниатюра для списков (thumb_filename)."""
    __tablename__ = "entity_images"
    id:              Mapped[int] = mapped_column(primary_key=True)
    user_id:         Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    entity_type:     Mapped[str] = mapped_column(String(32))
    entity_id:       Mapped[int] = mapped_column(Integer)
    filename:        Mapped[str] = mapped_column(String(255))
    thumb_filename:  Mapped[str] = mapped_column(String(255))
    width:           Mapped[int] = mapped_column(Integer, default=0)
    height:          Mapped[int] = mapped_column(Integer, default=0)
    size_bytes:      Mapped[int] = mapped_column(Integer, default=0)
    orig_size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    description:     Mapped[str | None] = mapped_column(Text, nullable=True)  # генерируется в фоне через локальную vision-модель (OLLAMA_VISION_MODEL) после загрузки

    __table_args__ = (Index("ix_entity_images_entity", "entity_type", "entity_id"),)


class EntityEmbedding(Base, TimestampMixin):
    """Векторное представление сущности (Observation/Hypothesis/Prediction)
    для семантического поиска. Полиморфная связка entity_type/entity_id —
    по тому же паттерну, что EntityReflection/EntityHypothesis, без FK на
    конкретную таблицу, т.к. типов несколько.
    text_snapshot хранится, чтобы фиксировать, на каком именно тексте
    посчитан эмбеддинг — при редактировании сущности эмбеддинг устаревает,
    и по расхождению текста легко понять, что пора пересчитать."""
    __tablename__ = "entity_embeddings"
    id:            Mapped[int] = mapped_column(primary_key=True)
    user_id:       Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    entity_type:   Mapped[str] = mapped_column(String(32), index=True)
    entity_id:     Mapped[int] = mapped_column(index=True)
    text_snapshot: Mapped[str] = mapped_column(Text)
    embedding:     Mapped[list[float]] = mapped_column(Vector(1024))
    # Какой моделью посчитан вектор. Векторы разных моделей несовместимы (косинус между ними — шум, а
    # размерность может совпасть), поэтому поиск берёт только векторы текущей модели
    # (services/embeddings.py::similar_query), а после смены модели их нужно пересчитать.
    embedding_model: Mapped[str] = mapped_column(String(64))
    # Когда эту сущность в последний раз прогоняли через отложенную
    # переоценку (см. services/contradiction_recheck.py) — NULL значит
    # "ещё ни разу". Без этого поля пришлось бы либо пересчитывать одну
    # и ту же запись в каждом суточном прогоне, либо засорять
    # contradiction_feedback фиктивными "проверочными" строками.
    last_checked_at: Mapped[datetime | None] = mapped_column(nullable=True)

    __table_args__ = (
        UniqueConstraint("entity_type", "entity_id", name="uq_entity_embeddings_entity"),
    )


class ContradictionFeedback(Base, TimestampMixin):
    """Лог каждого показанного пользователю предложенного противоречия
    и его вердикта — накопление golden-set для few-shot промптов и
    будущей калибровки/дообучения (см. обсуждение в чате, пункт 1 плана:
    механизм обучения на практике без готового датасета на старте)."""
    __tablename__ = "contradiction_feedback"
    id:               Mapped[int] = mapped_column(primary_key=True)
    user_id:          Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    source_entity_type:   Mapped[str] = mapped_column(String(32))
    source_entity_id:     Mapped[int] = mapped_column()
    matched_entity_type:  Mapped[str] = mapped_column(String(32))
    matched_entity_id:    Mapped[int] = mapped_column()
    existing_quote:   Mapped[str] = mapped_column(Text)
    new_quote:        Mapped[str] = mapped_column(Text)
    relation:         Mapped[str] = mapped_column(String(50))
    confidence:       Mapped[int] = mapped_column(Integer)
    verdict:          Mapped[str] = mapped_column(String(16), default="pending")  # pending | accepted | rejected


class TaskExpectation(Base, TimestampMixin):
    """Неявный прогноз, рождающийся из факта закрытия Задачи — не через
    отдельную ручную сущность Prediction (сознательно НЕ переиспользуем
    эту таблицу: смешение бытовых implicit-прогнозов с калибровкой по
    гипотезам рискует незаметно испортить существующие агрегаты, см.
    обсуждение в чате).

    ПРИВАТНОСТЬ: у этой сущности НЕТ поля visibility и не может быть —
    даже если сама задача видна в лабе, ожидание/рефлексия пользователя
    о собственном решении не наследует эту видимость никогда. Владелец
    строго тот, кто выполнил закрытие (user_id из контекста запроса),
    а не создатель задачи — в общей задаче их можно перепутать.

    expectation_text — снимок (не ссылка), берётся один раз в момент
    закрытия. Тот же принцип, что matched_quote в QuestionAnswerFeedback:
    последующее редактирование чего-либо стороннего на него не влияет.

    LLM здесь не участвует нигде — ни при создании, ни при проверке:
    цитата на проверке — это просто повторное чтение expectation_text,
    не поиск. Поэтому rate-limit не требуется."""
    __tablename__ = "task_expectations"
    id:                   Mapped[int]       = mapped_column(primary_key=True)
    task_id:              Mapped[int]       = mapped_column(ForeignKey("research_tasks.id", ondelete="CASCADE"), index=True)
    user_id:              Mapped[int]       = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    scale_id:             Mapped[int | None] = mapped_column(ForeignKey("task_scales.id", ondelete="SET NULL"), nullable=True)
    expectation_confidence: Mapped[int]     = mapped_column(Integer)          # 0-100
    expectation_text:     Mapped[str]       = mapped_column(Text)             # снимок, не ссылка
    expectation_value:    Mapped[float | None] = mapped_column(nullable=True) # если привязано к шкале
    check_at:             Mapped[datetime]  = mapped_column(DateTime(timezone=True))
    status:                Mapped[str]      = mapped_column(String(16), default="pending")  # pending | checked | dismissed
    outcome_confidence:    Mapped[int | None] = mapped_column(Integer, nullable=True)
    outcome_value:         Mapped[float | None] = mapped_column(nullable=True)
    outcome_text:          Mapped[str | None] = mapped_column(Text, nullable=True)


class QuestionAnswerFeedback(Base, TimestampMixin):
    """Лог каждого найденного возможного ответа на открытый Вопрос из
    личного корпуса пользователя (Наблюдения/Гипотезы/Прогнозы/Убеждения)
    и вердикта по нему — та же архитектура, что ContradictionFeedback:
    и explicit-проверка по клику на странице вопроса, и implicit-проверка
    в фоне при сохранении любой сущности пишут сюда. Дедуп повторных
    нуджей по одной и той же паре (question, source_entity) идёт через
    проверку существования pending/accepted/rejected записи перед вызовом
    LLM — дорогой шаг (LLM) выполняется только если дешёвый (запрос к
    этой таблице) не нашёл уже показанного варианта.
    user_id — ЯВНО владелец ВОПРОСА (не источника-ответа), чтобы implicit-
    проверка при сохранении сущности пользователя А физически не могла
    зацепить чужой (пользователя Б) вопрос — фильтрация по user_id всегда
    на уровне SQL-запроса кандидатов, а не проверяется постфактum."""
    __tablename__ = "question_answer_feedback"
    id:               Mapped[int] = mapped_column(primary_key=True)
    user_id:          Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    question_id:      Mapped[int] = mapped_column(ForeignKey("questions.id", ondelete="CASCADE"), index=True)
    source_entity_type: Mapped[str] = mapped_column(String(32))
    source_entity_id:   Mapped[int] = mapped_column()
    matched_quote:    Mapped[str] = mapped_column(Text)
    # Числовой confidence от LLM (не текстовое "уверен/не уверен") — модель
    # систематически переоценивает собственную уверенность в тексте, число
    # даёт объективную точку для будущей калибровки порога отсечения.
    confidence:       Mapped[int] = mapped_column(Integer)
    verdict:          Mapped[str] = mapped_column(String(16), default="pending")  # pending | accepted | rejected


class EntityStage(Base, TimestampMixin):
    """Опциональная привязка любой из 6 базовых сущностей (или лабы) к одной
    из 8 фиксированных, единых на всю платформу стадий пути "домашнее
    исследование -> проверенный продукт" (см. STAGE_VALUES ниже).

    Стадии — НЕ кастомная машина состояний (это будущий отдельный Workflow,
    шаг 7 общего плана — Stage НЕ его частный случай). Порядок линейный, но
    переходы свободны в обе стороны, без валидации "логичности" — это
    ориентир для пользователя, не строгий процесс.

    Запись создаётся ТОЛЬКО по явному действию пользователя (см.
    api/v1/entity_stage.py) — отсутствие записи означает "стадия не
    отслеживается", это нормальное и самое частое состояние, не ошибка и
    не подразумеваемая стадия "question" по умолчанию.

    Без FK на entity_id — тот же полиморфный паттерн, что у EntityComment/
    EntityTag/EntityAttachment (entity_type может указывать на любую из 6
    базовых сущностей ИЛИ на lab — единственная полиморфная таблица в
    проекте, которая допускает lab в качестве родителя)."""
    __tablename__ = "entity_stages"
    id:            Mapped[int] = mapped_column(primary_key=True)
    entity_type:   Mapped[str] = mapped_column(String(32))
    entity_id:     Mapped[int] = mapped_column(Integer)
    user_id:       Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    current_stage: Mapped[str] = mapped_column(String(32))

    __table_args__ = (UniqueConstraint("entity_type", "entity_id", name="entity_stages_entity_unique"),)


# Фиксированный, не кастомизируемый лабой порядок стадий — единый на всю
# платформу Python-enum, не таблица в БД. Порядок линейный (для сортировки/
# отображения), но переходы между ними в API не валидируются как строго
# последовательные — см. докстринг EntityStage выше.
STAGE_VALUES: list[str] = [
    "question", "research", "experiments", "prototype",
    "real_world_testing", "evidence", "proven_product", "market_handoff",
]


class EntityAttachment(Base, TimestampMixin):
    """Файловое вложение к сущности (код, документы, прочие файлы) — тот же
    полиморфный паттерн entity_type/entity_id, что у EntityImage и
    SourceDocument (FK на родителя нет: типов несколько).

    Картинки по-прежнему живут в EntityImage (сжатие, миниатюры, AI-описание) —
    здесь kind="image" и колонки thumb_filename/width/height/description
    зарезервированы под будущую консолидацию и пока не заполняются: эндпоинт
    загрузки вложений картинки отклоняет.

    kind определяется сервером по расширению и содержимому файла (не по
    Content-Type клиента). Файл лежит на диске вне статически раздаваемого
    uploads/ и отдаётся только через авторизованный эндпоинт; storage_path —
    имя файла в хранилище (uuid + расширение), НЕ путь от клиента.

    text_content — текст инлайн в БД (только kind=code/document, только
    текстовые файлы до лимита), чтобы участвовать в event-log обычным
    diff-ом колонок и показываться без похода в файловое хранилище.

    Мягкое удаление: deleted_at + фильтрация в выдаче. Физическое удаление
    файла — отдельная GC-задача (не реализована; при hard delete строки
    event-log снапшот сохранит storage_path)."""
    __tablename__ = "entity_attachments"
    id:             Mapped[int] = mapped_column(primary_key=True)
    user_id:        Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    entity_type:    Mapped[str] = mapped_column(String(32))
    entity_id:      Mapped[int] = mapped_column(Integer)
    kind:           Mapped[str] = mapped_column(String(16))  # image | code | document | other
    filename:       Mapped[str] = mapped_column(String(255))  # оригинальное имя, только для показа
    storage_path:   Mapped[str] = mapped_column(String(255))
    mime_type:      Mapped[str] = mapped_column(String(128))  # серверный, не от клиента
    size_bytes:     Mapped[int] = mapped_column(Integer)
    language:       Mapped[str | None] = mapped_column(String(32), nullable=True)
    text_content:   Mapped[str | None] = mapped_column(Text, nullable=True)
    thumb_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    width:          Mapped[int | None] = mapped_column(Integer, nullable=True)
    height:         Mapped[int | None] = mapped_column(Integer, nullable=True)
    description:    Mapped[str | None] = mapped_column(Text, nullable=True)
    deleted_at:     Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (Index("ix_entity_attachments_entity", "entity_type", "entity_id"),)


class EntityAttachmentVersion(Base):
    """Предыдущее состояние содержимого EntityAttachment, сохранённое при
    замене (PUT .../file или .../text) или при restore (который сам является
    заменой в этих же терминах — см. attachments.py). Не полиморфная модель:
    обычный FK на entity_attachments.id, cascade делает сама БД (ON DELETE
    CASCADE), эта таблица НЕ в POLYMORPHIC_CHILD_MODELS.

    superseded_at — момент, когда эта версия перестала быть текущей (не
    created_at этой строки, хоть на практике они и совпадают): это и есть
    точка отсчёта retention в attachment_gc.py.

    Файл версии (storage_path) — физически ОТДЕЛЬНЫЙ файл на диске, не
    расшаренная ссылка на текущий/другую версию (см. restore: копирование,
    а не переуказание — иначе просроченный по времени файл версии мог бы
    быть физически удалён GC, пока на него ссылается ещё что-то живое)."""
    __tablename__ = "entity_attachment_versions"
    id:            Mapped[int] = mapped_column(primary_key=True)
    attachment_id: Mapped[int] = mapped_column(ForeignKey("entity_attachments.id", ondelete="CASCADE"))
    filename:      Mapped[str] = mapped_column(String(255))
    storage_path:  Mapped[str] = mapped_column(String(255))
    text_content:  Mapped[str | None] = mapped_column(Text, nullable=True)
    mime_type:     Mapped[str] = mapped_column(String(128))
    size_bytes:    Mapped[int] = mapped_column(Integer)
    language:      Mapped[str | None] = mapped_column(String(32), nullable=True)
    superseded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    __table_args__ = (Index("ix_entity_attachment_versions_attachment", "attachment_id", "superseded_at"),)


class PredictionCalibrationResidue(Base):
    """«Сухой остаток» окончательно удалённого прогноза — ровно то, что нужно калибровке,
    и ничего из содержания. Пишется в purge_entity (services/soft_delete.py) в той же
    транзакции, что и физическое удаление прогноза.

    Зачем: удаление прогноза (в корзину и окончательно) не должно «улучшать» track record.
    Живые и лежащие в корзине прогнозы считаются калибровкой прямо из predictions; после
    «удалить окончательно» строка исчезает, и без остатка неудачи можно было бы стереть.

    Хранится: уверенность, исход (status), видимость/лаба на момент удаления (чтобы работала
    та же политика видимости, что у самих прогнозов), имена тегов гипотезы (для калибровки
    по тегам). НЕ хранится: заголовок, текст, slug, id — ничего, по чему восстановить
    содержание. Каскад PR A (POLYMORPHIC_CHILD_MODELS) сюда не относится: строка не
    привязана к сущности; при удалении пользователя уходит по FK."""
    __tablename__ = "prediction_calibration_residue"
    id:            Mapped[int]        = mapped_column(primary_key=True)
    user_id:       Mapped[int]        = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    visibility:    Mapped[str]        = mapped_column(String(16), default="private", index=True)
    lab_id:        Mapped[int | None] = mapped_column(ForeignKey("labs.id", ondelete="SET NULL"), nullable=True, index=True)
    confidence:    Mapped[int | None] = mapped_column(Integer, nullable=True)
    status:        Mapped[str]        = mapped_column(String(64))
    is_onboarding: Mapped[bool]       = mapped_column(Boolean, default=False)
    tag_names:     Mapped[list]       = mapped_column(JSONB, default=list)
    purged_at:     Mapped[datetime]   = mapped_column(DateTime(timezone=True), server_default=func.now())
    # вклад в сигнал лаборатории: прогноз исчез, а его вклад в сумму lab_signal остаётся (NULL у старых остатков)
    hypothesis_id: Mapped[int | None] = mapped_column(ForeignKey("hypotheses.id", ondelete="SET NULL"), nullable=True, index=True)
    lab_signal_contribution: Mapped[float | None] = mapped_column(nullable=True)


class RecordShare(Base):
    """Согласие владельца: запись (entity_type, entity_id) открыта участникам лаборатории lab_id через связь с записью
    (via_type, via_id). Без строки связь ничего не открывает (см. lab_access.opened_via_link_condition)."""
    __tablename__ = "record_shares"
    id:          Mapped[int] = mapped_column(primary_key=True)
    entity_type: Mapped[str] = mapped_column(String(32))
    entity_id:   Mapped[int] = mapped_column(Integer)
    lab_id:      Mapped[int] = mapped_column(ForeignKey("labs.id", ondelete="CASCADE"))
    via_type:    Mapped[str] = mapped_column(String(32))
    via_id:      Mapped[int] = mapped_column(Integer)
    granted_by:  Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    created_at:  Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (UniqueConstraint("entity_type", "entity_id", "lab_id", "via_type", "via_id", name="uq_record_shares"),
                      Index("ix_record_shares_entity", "entity_type", "entity_id"), Index("ix_record_shares_lab", "lab_id"))


class EntityMention(Base):
    """Упоминание записи в rich-тексте другой записи (<a href="meridian://тип/id">). НЕ связь: в сигнал и граф связей
    не входит. Без FK (полиморфно): сироты скрываются при чтении, чистятся при физическом удалении (event_log) и сверкой."""
    __tablename__ = "entity_mentions"
    id:          Mapped[int] = mapped_column(primary_key=True)
    source_type: Mapped[str] = mapped_column(String(32))
    source_id:   Mapped[int] = mapped_column(Integer)
    field:       Mapped[str] = mapped_column(String(32))
    target_type: Mapped[str] = mapped_column(String(32))
    target_id:   Mapped[int] = mapped_column(Integer)
    created_at:  Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (UniqueConstraint("source_type", "source_id", "field", "target_type", "target_id", name="uq_entity_mentions"),
                      Index("ix_entity_mentions_source", "source_type", "source_id"),
                      Index("ix_entity_mentions_target", "target_type", "target_id"))

