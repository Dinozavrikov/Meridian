from pydantic import BaseModel, Field
from typing import Annotated, Optional, List, Literal
from datetime import datetime
from app.schemas._strict import (
    StrictIn, Short32, Short64, Short128, Short255, LongText, DateStr, Visibility, Int32, Tags, HttpUrlStr, NonEmpty255, RichRequired,
)
from app.schemas.hyp_scales import MaturityLevel, ResearchLoadScore, RiskScore, StabilityScore

cfg = {"from_attributes": True}


# Стадии зрелости наблюдения — единственный источник правды на бэкенде. Зеркало на фронте:
# frontend/lib/observation-constants.ts (синхронность держит тест observation-constants.test.ts).
ObservationStatus = Literal["сырое", "осмысленное", "интегрированное", "архивное"]


class ObsCreate(StrictIn):
    date: DateStr
    author: Short128
    title: NonEmpty255
    text: RichRequired
    tags: Tags = []
    status: ObservationStatus = "осмысленное"
    importance: Optional[Int32] = None  # None = «не оценено»
    visibility: Visibility = "private"
    lab_id: Optional[Int32] = None

class ObsUpdate(ObsCreate):
    pass

class ObsOut(BaseModel):
    id: int
    user_id: int
    slug: str = ""
    date: str
    author: str
    title: str
    text: str
    tags: List[str] = []
    status: str = "осмысленное"
    importance: Optional[int] = None
    visibility: str = "private"
    lab_id: Optional[int] = None
    owner_username: Optional[str] = None
    access: Optional[str] = None   # owner / member / public / opened (открыта через связь, только чтение)
    owner_display_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    model_config = cfg


# Статусы гипотезы — единственный источник правды на бэкенде: core/hypothesis_status.py (синхронность — тест).
HypothesisStatus = Literal["идея", "активная проверка", "ожидание данных", "заморожена", "отвергнута", "частично подтверждена", "подтвердилось", "требует пересмотра"]


class HypCreate(StrictIn):
    name: Short255
    description: LongText = ""
    falsification_criteria: LongText = ""
    date_created: DateStr
    status: HypothesisStatus = "идея"
    stability: StabilityScore = 5
    research_load: ResearchLoadScore = 5
    maturity: MaturityLevel = 0
    risk: RiskScore = 5
    visibility: Visibility = "private"
    lab_id: Optional[Int32] = None
    tags: Tags = []

class HypUpdate(HypCreate):
    pass

class HypOut(BaseModel):
    id: int
    user_id: int
    name: str
    slug: str = ""
    description: str
    falsification_criteria: str = ""
    evidence_diversity: Optional[dict] = None
    date_created: str
    status: str
    stability: int
    research_load: int
    maturity: int
    risk: int
    visibility: str = "private"
    lab_id: Optional[int] = None
    tags: List[str] = []
    is_onboarding: bool = False
    owner_username: Optional[str] = None
    access: Optional[str] = None   # owner / member / public / opened (открыта через связь, только чтение)
    owner_display_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    model_config = cfg


# Статусы прогноза — единственный источник правды на бэкенде. Зеркало на фронте:
# frontend/lib/prediction-status.ts (PREDICTION_STATUSES; синхронность держит prediction-status.test.ts).
PredictionStatus = Literal["не проверен", "подтвердился", "частично подтвердился", "не подтвердился"]
# Уверенность — процент. Раньше был просто Int32, и 500 давало p=5.0 в Brier и портило калибровку.
Confidence = Annotated[int, Field(ge=0, le=100)]


class PredCreate(StrictIn):
    title: Short255 = ""
    text: LongText
    date_created: DateStr
    expected_check_date: datetime
    hypothesis_id: Optional[Int32] = None
    status: PredictionStatus = "не проверен"
    confidence: Optional[Confidence] = None
    result_notes: LongText = ""
    visibility: Visibility = "private"
    lab_id: Optional[Int32] = None
    # False — прогноз-стресс-тест: сбывшийся прогноз ОПРОВЕРГАЕТ гипотезу,
    # а не подтверждает (см. индекс разнообразия доказательств).
    confirms_hypothesis_if_true: bool = True

class PredUpdate(PredCreate):
    pass

class PredClose(StrictIn):
    """Лёгкое закрытие прогноза из очереди проверки — не трогает остальные поля."""
    status: Short64
    result_notes: LongText = ""

class PredOut(BaseModel):
    id: int
    user_id: int
    title: str
    slug: str = ""
    text: str
    date_created: str
    expected_check_date: datetime
    hypothesis_id: Optional[int]
    hyp_name: Optional[str] = None
    status: str
    confidence: Optional[int] = None
    result_notes: str
    visibility: str = "private"
    lab_id: Optional[int] = None
    confirms_hypothesis_if_true: bool = True
    is_onboarding: bool = False
    owner_username: Optional[str] = None
    access: Optional[str] = None   # owner / member / public / opened (открыта через связь, только чтение)
    owner_display_name: Optional[str] = None
    created_at: datetime
    model_config = cfg
    updated_at: datetime


class ReflectionFactor(StrictIn):
    factor: str
    weight: float
    direction: Literal["for", "against"]


class PredictionReflectionCreate(StrictIn):
    stage: Literal["creation", "resolution"]
    factors: List[ReflectionFactor]
    raw_dialogue_text: Optional[str] = None


class PredictionReflectionOut(BaseModel):
    """Имя схемы сохранено как есть (используется и для Worldview) — модели
    EntityReflection/EntityReflectionInsight полиморфны, эти схемы теперь
    тоже: entity_type/entity_id вместо prediction_id."""
    id: int
    entity_type: str
    entity_id: int
    stage: Literal["creation", "resolution"]
    factors: List[ReflectionFactor]
    raw_dialogue_text: Optional[str] = None
    created_at: datetime
    model_config = cfg


class PredictionReflectionInsightOut(BaseModel):
    id: int
    entity_type: str
    entity_id: int
    matched: List[dict]
    added: List[str]
    dropped: List[str]
    insight: str
    triggered_by: Literal["manual", "resolution"]
    created_at: datetime
    model_config = cfg


class WvCreate(StrictIn):
    date: DateStr
    belief: LongText
    status: Short64 = "гипотеза"
    confirming_data: LongText = ""
    refuting_data: LongText = ""
    confidence: Optional[Int32] = None
    visibility: Visibility = "private"
    lab_id: Optional[Int32] = None
    tags: Tags = []

class WvUpdate(WvCreate):
    pass

class WvOut(BaseModel):
    id: int
    user_id: int
    date: str
    belief: str
    slug: str = ""
    status: str
    confirming_data: str
    refuting_data: str
    confidence: Optional[int] = None
    visibility: str = "private"
    lab_id: Optional[int] = None
    tags: List[str] = []
    owner_username: Optional[str] = None
    access: Optional[str] = None   # owner / member / public / opened (открыта через связь, только чтение)
    owner_display_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    model_config = cfg


class QuestionCreate(StrictIn):
    title: Short255
    text: LongText = ""
    status: Short64 = "открыт"
    priority: Short32 = "средний"
    importance: Optional[Int32] = None  # None = «не оценено»
    answer: LongText = ""
    date_created: DateStr
    visibility: Visibility = "private"
    lab_id: Optional[Int32] = None
    tags: Tags = []

class QuestionUpdate(QuestionCreate):
    pass

class QuestionOut(BaseModel):
    id: int
    user_id: int
    title: str
    slug: str = ""
    text: str
    status: str
    priority: str
    importance: Optional[int] = None
    answer: str
    date_created: str
    visibility: str = "private"
    lab_id: Optional[int] = None
    tags: List[str] = []
    owner_username: Optional[str] = None
    access: Optional[str] = None   # owner / member / public / opened (открыта через связь, только чтение)
    owner_display_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    model_config = cfg


class TaskCreate(StrictIn):
    name: Short255
    description: LongText = ""
    status: Short64 = "открыта"
    progress: Int32 = 0
    visibility: Visibility = "private"
    lab_id: Optional[Int32] = None

class TaskUpdate(TaskCreate):
    pass

class TaskOut(BaseModel):
    id: int
    user_id: int
    name: str
    slug: str = ""
    description: str
    status: str
    progress: int = 0
    visibility: str = "private"
    lab_id: Optional[int] = None
    owner_username: Optional[str] = None
    access: Optional[str] = None   # owner / member / public / opened (открыта через связь, только чтение)
    owner_display_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    model_config = cfg


class LinkCreate(StrictIn):
    from_type: Short32
    from_id: Int32
    to_type: Short32
    to_id: Int32
    link_type: Short64 = "related"

class LinkOut(BaseModel):
    id: int
    from_type: str
    from_id: int
    to_type: str
    to_id: int
    link_type: str
    model_config = cfg


class SourceDocCreate(StrictIn):
    url: HttpUrlStr

class SourceDocVerdictUpdate(StrictIn):
    verdict: str

ALLOWED_SOURCE_ENTITY_TYPES = ("hypothesis", "prediction", "observation", "question", "task", "worldview", "result")

class SourceDocOut(BaseModel):
    id:             int
    entity_type:    str
    entity_id:      int
    url:            str
    title:          str
    summary:        str
    verdict_reason: str
    source_weight:  int
    source_type:    str
    verdict:        str
    verdict_by_user:bool
    status:         str
    error_msg:      str
    weight_reason:  str
    created_at:     datetime
    updated_at:     datetime
    model_config = cfg

class ResultSourceOriginOut(BaseModel):
    entity_type: str
    entity_id:   int
    entity_name: str

class ResultSourceLinkOut(BaseModel):
    id:     int
    source: SourceDocOut
    origin: ResultSourceOriginOut
    model_config = cfg

class AvailableLabSourceOut(BaseModel):
    source:         SourceDocOut
    origin:         ResultSourceOriginOut
    already_linked: bool
    is_own:         bool
    model_config = cfg

class ResultSourceLinkCreate(StrictIn):
    source_document_id: Int32


class ScaleLevelIn(StrictIn):
    value: float
    label: str = ""
    desc: str = ""

class ScaleDefCreate(StrictIn):
    entity_type: str
    name: str
    description: str = ""
    min_val: int = 0
    max_val: int = 10
    step: int = 1
    group_by: str = "none"
    color: str = "#4A90D9"
    levels: List[ScaleLevelIn] = []

class ScaleDefUpdate(StrictIn):
    name: Optional[str] = None
    description: Optional[str] = None
    min_val: Optional[int] = None
    max_val: Optional[int] = None
    step: Optional[int] = None
    group_by: Optional[str] = None
    color: Optional[str] = None
    levels: Optional[List[ScaleLevelIn]] = None

class ScaleDefOut(BaseModel):
    id: int
    builtin_key: Optional[str] = None
    entity_type: str
    name: str
    description: str
    min_val: int
    max_val: int
    step: int
    group_by: str
    color: str
    levels: List[ScaleLevelIn] = []
    model_config = cfg

class ScaleLevelsOverride(StrictIn):
    """PUT для описаний встроенной шкалы — меняются только levels."""
    levels: List[ScaleLevelIn]

class ScaleValueIn(StrictIn):
    entity_type: str
    entity_id: int
    scale_id: str
    value: Optional[float] = None  # None — сбросить (удалить запись)

class MaturitySuggestionOut(BaseModel):
    id: int
    hypothesis_id: int
    raw_signal: float
    current_level: int
    suggested_level: int
    reason: str
    status: str
    pred_signal: Optional[float] = None
    obs_signal: Optional[float] = None
    lab_signal: Optional[float] = None
    model_config = cfg


class ScaleValueOut(BaseModel):
    entity_type: str
    entity_id: int
    scale_id: str
    value: float
    model_config = cfg


ALLOWED_IMAGE_ENTITY_TYPES = ALLOWED_SOURCE_ENTITY_TYPES

class EntityImageOut(BaseModel):
    id:              int
    entity_type:     str
    entity_id:       int
    url:             str
    thumb_url:       str
    width:           int
    height:          int
    size_bytes:      int
    orig_size_bytes: int
    created_at:      datetime
    model_config = cfg


class ContradictionItem(BaseModel):
    entity_type: str
    entity_id: int
    existing_quote: str
    new_quote: str
    relation: str
    confidence: int

class ContradictionCheckRequest(StrictIn):
    entity_type: str
    entity_id: int
    text: str

class ContradictionFeedbackVerdict(StrictIn):
    verdict: str  # accepted | rejected


class QuestionAnswerItem(BaseModel):
    entity_type: str
    entity_id: int
    quote: str
    confidence: int


class QuestionAnswerFeedbackVerdict(StrictIn):
    verdict: str  # accepted | rejected


class TaskExpectationCreate(StrictIn):
    expectation_confidence: int  # 0-100
    expectation_text: str
    scale_id: int | None = None
    expectation_value: float | None = None
    # Ровно один способ задать момент проверки: либо явная абсолютная дата
    # (точность до минуты, из datetime-picker на фронте), либо количество
    # дней от текущего момента на сервере (пресеты 7/30/90). Если check_at
    # передан — он в приоритете, check_in_days игнорируется.
    check_at: datetime | None = None
    check_in_days: int = 30


class TaskExpectationResolve(StrictIn):
    outcome_confidence: int
    outcome_value: float | None = None
    outcome_text: str | None = None


class TaskExpectationOut(BaseModel):
    id: int
    task_id: int
    scale_id: int | None
    expectation_confidence: int
    expectation_text: str
    expectation_value: float | None
    check_at: datetime
    status: str
    outcome_confidence: int | None
    outcome_value: float | None
    outcome_text: str | None
    model_config = cfg


class ResultCreate(StrictIn):
    title: Short255
    body: LongText = ""
    lab_id: Int32
    visibility: Visibility = "private"


class ResultUpdate(StrictIn):
    title: Short255
    body: LongText
    visibility: Visibility


class ResultOut(BaseModel):
    id: int
    user_id: int
    lab_id: int
    title: str
    slug: str = ""
    body: str
    visibility: str
    is_published: bool
    owner_username: Optional[str] = None
    owner_display_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    model_config = cfg


class ResultEditSuggestionCreate(StrictIn):
    proposed_body: str


class ResultEditSuggestionOut(BaseModel):
    id: int
    result_id: int
    author_id: int
    proposed_body: str
    status: str
    author_username: Optional[str] = None
    author_display_name: Optional[str] = None
    created_at: datetime
    decided_at: Optional[datetime] = None
    decided_by: Optional[int] = None
    model_config = cfg
