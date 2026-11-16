"""Единый реестр "entity_type-строка -> ORM-модель" для 6 базовых версионируемых
сущностей (Observation/Hypothesis/Prediction/Worldview/Question/ResearchTask).

Раньше существовало два независимых определения этого словаря
(repost.py::ENTITY_MODELS и entity_access.py::ENTITY_OWNER_MODELS) с
идентичным составом — консолидировано в один источник истины 18.09,
после того как похожее расхождение (узкая 3-типовая копия в comments.py
вместо полного реестра) уже дважды молча теряло question/worldview/task
в notify/unread-каналах. Новый код (before_flush event-log listener и
всё, что появится по тому же принципу) обязан импортировать реестр
отсюда — не заводить третью локальную копию.

Два реестра, оба здесь. ENTITY_MODELS — ровно 6 базовых сущностей: по нему
итерируются граф, лента и unread-рассылка (global_graph.py, comments.py,
feed.py), поэтому добавлять в него не-базовые типы НЕЛЬЗЯ — вложение
появилось бы в графе и ленте как полноценная сущность.
EVENT_LOGGED_MODELS = ENTITY_MODELS + типы, которые только пишутся в events
ORM-слоем (сейчас attachment) и не участвуют в графе/ленте/уведомлениях."""
from app.models.entities import (
    Observation, Hypothesis, Prediction, Worldview, Question, ResearchTask,
    EntityAttachment, EntityTag, EntityImage, SourceDocument, EntityEmbedding,
    EntityStage, EntityReflection, EntityReflectionInsight, ScaleValue,
)
from app.models.i18n import ContentTranslation
from app.models.social import EntityComment, UserCommentSeen, Lab

ENTITY_MODELS: dict[str, type] = {
    "observation": Observation,
    "hypothesis":  Hypothesis,
    "prediction":  Prediction,
    "worldview":   Worldview,
    "question":    Question,
    "task":        ResearchTask,
}

# Модели, за изменениями которых следит before_flush event-log listener
# (app/services/event_log.py). Надмножество ENTITY_MODELS — см. докстринг
# модуля, почему вложения НЕ добавляются в ENTITY_MODELS.
EVENT_LOGGED_MODELS: dict[str, type] = {**ENTITY_MODELS, "attachment": EntityAttachment}

# Полиморфные дочерние таблицы (entity_type/entity_id, без FK на родителя —
# типов-родителей несколько), которые нужно чистить при hard delete любой
# из 6 ENTITY_MODELS сущностей. Добавление новой такой таблицы в будущем
# (например EntityStage) — ОДНА строка здесь, не правка тела before_flush
# listener'а (app/services/event_log.py). Link сюда НЕ входит — у него
# from_type/from_id/to_type/to_id вместо entity_type/entity_id, чистится
# отдельной веткой в listener'е (обе стороны). См.
# backend/docs/EVENT_LOG_AND_CLEANUP.md.
POLYMORPHIC_CHILD_MODELS: dict[str, type] = {
    "comment":       EntityComment,
    "comment_seen":  UserCommentSeen,
    "tag":           EntityTag,
    "image":         EntityImage,
    "attachment":    EntityAttachment,
    "source":        SourceDocument,
    "embedding":     EntityEmbedding,
    "stage":         EntityStage,
    # Найдены при подшаге soft-delete: полиморфные (entity_type/entity_id, без FK),
    # но не чистились при hard delete — «очистить безвозвратно» оставлял бы сирот
    # (в т.ч. raw_dialogue_text рефлексий). EntityHypothesis сюда не входит:
    # parent_type/parent_id — отдельная ветка в event_log.py, как у Link.
    "reflection":          EntityReflection,
    "reflection_insight":  EntityReflectionInsight,
    "scale_value":         ScaleValue,
    "content_translation": ContentTranslation,
}

# ENTITY_MODELS + Lab — единственное место в реестре, где Lab допускается
# как полноценный "родитель" наравне с 6 базовыми сущностями. Нужен
# отдельно от ENTITY_MODELS (Lab туда НЕЛЬЗЯ — граф/лента/unread её не
# ожидают, см. докстринг модуля) и отдельно от EVENT_LOGGED_MODELS (по той
# же причине). Используется только в api/v1/entity_stage.py.
STAGE_ENTITY_MODELS: dict[str, type] = {**ENTITY_MODELS, "lab": Lab}

# Технический пользователь-автор для Event-записей, которые пишет ORM-уровень
# (before_flush-listener), а не HTTP-роут — там неоткуда взять actor_id из
# контекста запроса (см. миграцию a1b2c3d4e5f6). Найден по username, не по
# id — id выделяется через обычный nextval users_id_seq при сидировании,
# намеренно не хардкожен.
SYSTEM_USERNAME = "system"

_system_user_id_cache: int | None = None


async def get_system_user_id(db) -> int:
    """Кэшируется в памяти процесса на первый вызов — id системного
    пользователя не меняется, лишний SELECT на каждый flush не нужен."""
    global _system_user_id_cache
    if _system_user_id_cache is not None:
        return _system_user_id_cache
    from sqlalchemy import select
    from app.models.user import User
    result = await db.execute(select(User.id).where(User.username == SYSTEM_USERNAME))
    user_id = result.scalar_one()
    _system_user_id_cache = user_id
    return user_id
