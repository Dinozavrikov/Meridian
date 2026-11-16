"""Предпросмотр записи для карточки при наведении: короткое содержимое, автор, теги, показатели, число связей.

Доступ — как у просмотра самой записи (get_entity_for_view), но недоступное отдаётся как 404, а не 403:
предпросмотр по угаданному id не должен подтверждать, что запись существует. Гость видит только публичное."""
import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user_optional
from app.core.entity_registry import ENTITY_MODELS
from app.core.lab_access import get_entity_for_read, get_entity_for_view, links_alive
from app.db.session import get_db
from app.models.entities import EntityTag, Link, Tag
from app.services.link_effect import preview_effects
from app.models.user import User
from app.services.repost import extract_content
from app.services.direct_links import count_direct_links

router = APIRouter(tags=["entity_preview"])

EXCERPT_LIMIT = 280
# Показатели по типу записи: берутся, только если поле есть и заполнено.
METRIC_KEYS: dict[str, tuple[str, ...]] = {
    "observation": ("importance",),
    "hypothesis": ("maturity", "risk", "stability"),
    "prediction": ("confidence", "expected_check_date"),
    "worldview": ("confidence",),
    "question": ("priority", "importance"),
    "task": ("progress",),
}
_TAGS = re.compile(r"<[^>]+>")


_BLOCK_EDGE = re.compile(r"<\s*/?\s*(?:p|div|li|ul|ol|h[1-6]|blockquote|br|tr)\b[^>]*>", re.IGNORECASE)


def _plain(value: Optional[str], limit: int, keep_breaks: bool = False) -> str:
    """Текст без тегов. keep_breaks: границы блоков (p, br, li, заголовки) становятся переводом строки, абзацы не
    слипаются; HTML-сущности разворачиваются. Без него (заголовки) всё в одну строку, как раньше."""
    if not keep_breaks:
        text = re.sub(r"\s+", " ", _TAGS.sub(" ", value or "")).strip()
        return text[:limit]
    import html as _html
    raw = _TAGS.sub(" ", _BLOCK_EDGE.sub("\n", value or ""))
    lines = [re.sub(r"[^\S\n]+", " ", ln).strip() for ln in _html.unescape(raw).split("\n")]
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()[:limit]


class PreviewAuthorOut(BaseModel):
    username: str
    display_name: str = ""
    avatar_url: Optional[str] = None


class PreviewMetricOut(BaseModel):
    key: str
    value: float | int | str


class PreviewOut(BaseModel):
    type: str
    id: int
    title: str
    excerpt: str
    status: Optional[str] = None
    visibility: Optional[str] = None
    created_at: Optional[str] = None
    author: PreviewAuthorOut
    is_owner: bool
    tags: list[str] = []
    metrics: list[PreviewMetricOut] = []
    links_count: int = 0
    effect: Optional[dict] = None  # вклад прогноза в сигнал его гипотезы; только владельцу гипотезы
    effects: list[dict] = []  # у наблюдения: вклад в сигнал каждой гипотезы зрителя, с которой оно связано


@router.get("/{entity_type}/{entity_id}/preview", response_model=PreviewOut)
async def entity_preview(entity_type: str, entity_id: int,
                         user: Optional[User] = Depends(get_current_user_optional), db: AsyncSession = Depends(get_db)):
    model = ENTITY_MODELS.get(entity_type)
    if model is None:
        raise HTTPException(404, "Не найдено")
    # get_entity_for_read: строгая проверка + запись, открытая через связь; корзину и чужое приватное отсекает
    obj = await get_entity_for_read(db, model, entity_id, user.id if user else None, hide_as_404=True)

    content = extract_content(entity_type, obj)
    excerpt = _plain(content["text"], EXCERPT_LIMIT, keep_breaks=True)
    title = _plain(content["title"], 160) or excerpt[:100]
    author = await db.get(User, obj.user_id)

    tags = (await db.execute(
        select(Tag.name).join(EntityTag, EntityTag.tag_id == Tag.id)
        .where(EntityTag.entity_type == entity_type, EntityTag.entity_id == entity_id).order_by(Tag.name)
    )).scalars().all()

    metrics = []
    for key in METRIC_KEYS.get(entity_type, ()):
        v = getattr(obj, key, None)
        if v is None:
            continue
        metrics.append(PreviewMetricOut(key=key, value=v.isoformat() if hasattr(v, "isoformat") else v))

    # то же число, что в заголовке «Связи» менеджера: прямые связи, видимые зрителю
    links_count = await count_direct_links(db, user.id if user else None, entity_type, entity_id)

    effect, effects = await preview_effects(db, user.id if user else None, entity_type, obj)
    created = getattr(obj, "created_at", None)
    return PreviewOut(
        type=entity_type, id=entity_id, title=title, excerpt=excerpt,
        status=getattr(obj, "status", None), visibility=getattr(obj, "visibility", None),
        created_at=created.isoformat() if created else None,
        author=PreviewAuthorOut(username=author.username if author else "", display_name=author.display_name if author else "",
                             avatar_url=author.avatar_url if author else None),
        is_owner=bool(user and obj.user_id == user.id),
        tags=list(tags), metrics=metrics, links_count=links_count, effect=effect, effects=effects,
    )
