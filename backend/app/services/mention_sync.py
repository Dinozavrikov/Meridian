"""Упоминания записей в rich-тексте -> entity_mentions. Слушатель after_flush на AppSession: id новых записей уже есть,
история атрибутов ещё доступна, запись идёт в той же транзакции (rollback снимает и упоминания). Ловит любую ORM-запись
поля, в том числе откат (undo). НЕ ловит массовые UPDATE-запросы мимо ORM: их исправляет скрипт сверки.
Поля берутся из реестра rich (core/text_fields.py); ResultEditSuggestion не извлекается, пока предложение не принято."""
from sqlalchemy import and_, delete, event, inspect, insert

from app.core.mentions import extract_mentions
from app.core.text_fields import RICH_TEXT_FIELDS
from app.db.session import AppSession
from app.models.entities import EntityMention, Hypothesis, Observation, Prediction, Question, Result, Worldview

SOURCE_TYPES = {Observation: "observation", Hypothesis: "hypothesis", Prediction: "prediction",
                Question: "question", Worldview: "worldview", Result: "result"}
FIELDS = {model: RICH_TEXT_FIELDS[model.__name__] for model in SOURCE_TYPES}
_T = EntityMention.__table__


@event.listens_for(AppSession, "after_flush")
def _sync_mentions(session, flush_context) -> None:
    new = set(session.new)
    conn = session.connection()
    # Result удаляется физически и не входит в ENTITY_MODELS (event_log.py его не чистит): свои строки-источники убираем сами.
    # Строки, где Result цель, и каскад БД при удалении лаборатории/пользователя остаются сверке.
    for obj in list(session.deleted):
        if isinstance(obj, Result) and obj.id is not None:
            conn.execute(delete(_T).where(and_(_T.c.source_type == "result", _T.c.source_id == obj.id)))
    for obj in list(session.new) + list(session.dirty):
        etype = SOURCE_TYPES.get(type(obj))
        if etype is None or obj.id is None:
            continue
        state = inspect(obj)
        for field in FIELDS[type(obj)]:
            is_new = obj in new
            if not is_new and not state.attrs[field].history.has_changes():
                continue
            found = extract_mentions(getattr(obj, field))
            if not is_new:
                conn.execute(delete(_T).where(and_(_T.c.source_type == etype, _T.c.source_id == obj.id, _T.c.field == field)))
            if found:
                conn.execute(insert(_T), [{"source_type": etype, "source_id": obj.id, "field": field,
                                           "target_type": tt, "target_id": ti} for tt, ti in found])
