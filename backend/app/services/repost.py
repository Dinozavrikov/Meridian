"""
Универсальный механизм репоста сущностей Meridian.
Позволяет скопировать наблюдение/гипотезу/прогноз/убеждение/вопрос
в любой другой тип, с комментарием поверх (паттерн — как в ЖЖ).
"""
from datetime import date
from app.core.entity_registry import ENTITY_MODELS
from app.models.entities import Observation, Hypothesis, Prediction, Worldview, Question, ResearchTask


def extract_content(entity_type: str, obj) -> dict:
    """Универсальное {title, text} представление сущности-источника — для копирования и цитаты."""
    if entity_type == "observation":
        return {"title": obj.title, "text": obj.text}
    if entity_type == "hypothesis":
        return {"title": obj.name, "text": obj.description}
    if entity_type == "prediction":
        return {"title": obj.title, "text": obj.text}
    if entity_type == "worldview":
        return {"title": "", "text": obj.belief}
    if entity_type == "question":
        return {"title": obj.title, "text": obj.text}
    if entity_type == "task":
        return {"title": obj.name, "text": obj.description}
    raise ValueError(f"Unsupported entity type: {entity_type}")


def compose_repost_body(user_comment: str, source_title: str, source_text: str) -> str:
    """Комментарий пользователя сверху, оригинал — цитатой снизу.
    Тот же приём, что уже используется в PublishModal (наблюдения → блог-пост)."""
    quote = f"<blockquote><p>{source_text}</p></blockquote>" if source_text else ""
    comment_html = f"<p>{user_comment}</p>" if user_comment.strip() else ""
    divider = "<hr/>" if comment_html and quote else ""
    return comment_html + divider + quote


async def build_entity(db, target_type: str, *, title: str, text: str, user_id: int,
                        visibility: str, lab_id: int | None, expected_check_date=None):
    """Создаёт новый ORM-объект целевого типа из универсального содержимого,
    включая уникальный slug (баг: раньше slug вообще не проставлялся ни для
    одной из шести веток — совпадений не было только потому, что через репост
    практически не создавали observation/hypothesis/prediction; question и
    task через этот путь уже успели уйти в прод с пустым slug).

    expected_check_date используется только для target_type == "prediction" —
    обязателен на уровне БД (NOT NULL), валидируется вызывающей стороной
    (см. feed.py::repost_entity/repost_comment_entity) до вызова build_entity."""
    from app.core.slug import unique_slug_for
    today = date.today().isoformat()
    model = ENTITY_MODELS[target_type]

    if target_type == "observation":
        from app.core.plain_text import derive_title
        title = (title or "").strip() or derive_title(text) or f"Наблюдение от {today}"
        slug = await unique_slug_for(db, model, title)
        return Observation(user_id=user_id, date=today, author="", title=title, text=text,
                            slug=slug, visibility=visibility, lab_id=lab_id)
    if target_type == "hypothesis":
        name = title or text[:255]
        slug = await unique_slug_for(db, model, name)
        return Hypothesis(user_id=user_id, name=name, description=text, slug=slug,
                           date_created=today, visibility=visibility, lab_id=lab_id)
    if target_type == "prediction":
        slug = await unique_slug_for(db, model, title or text[:255])
        return Prediction(user_id=user_id, title=title, text=text, slug=slug, date_created=today,
                           visibility=visibility, lab_id=lab_id,
                           expected_check_date=expected_check_date)
    if target_type == "worldview":
        belief = text or title
        slug = await unique_slug_for(db, model, belief)
        return Worldview(user_id=user_id, date=today, belief=belief, slug=slug,
                          visibility=visibility, lab_id=lab_id)
    if target_type == "question":
        q_title = title or text[:255]
        slug = await unique_slug_for(db, model, q_title)
        return Question(user_id=user_id, title=q_title, text=text, slug=slug,
                         date_created=today, visibility=visibility, lab_id=lab_id)
    if target_type == "task":
        name = title or text[:255]
        slug = await unique_slug_for(db, model, name)
        return ResearchTask(user_id=user_id, name=name, description=text, slug=slug,
                             visibility=visibility, lab_id=lab_id)
    raise ValueError(f"Unsupported entity type: {target_type}")


# ── Разбор содержимого комментария на текст и вложения ──────────────────────
# Зеркалит детекцию из frontend/lib/embed-utils.ts — комментарий хранит
# картинки/видео как URL на отдельной строке.
import re

_IMG_RE = re.compile(r"\.(jpe?g|png|webp|gif)(\?.*)?$", re.IGNORECASE)
_YT_RE = re.compile(r"(?:youtu\.be/|youtube\.com/(?:watch\?v=|embed/|shorts/))[A-Za-z0-9_-]{11}")
_VIMEO_RE = re.compile(r"vimeo\.com/\d+")


def split_comment_content(text: str) -> tuple[str, list[str]]:
    """Возвращает (текст без вложений, список строк-вложений)."""
    text_lines, attachments = [], []
    for line in text.split("\n"):
        stripped = line.strip()
        if stripped and (_IMG_RE.search(stripped) or _YT_RE.search(stripped) or _VIMEO_RE.search(stripped)):
            attachments.append(stripped)
        else:
            text_lines.append(line)
    return "\n".join(text_lines).strip(), attachments
