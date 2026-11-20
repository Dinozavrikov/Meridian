from app.schemas._strict import StrictIn, Short16, Short32, Short128, Short255, LongText
from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from app.db.session import get_db
from app.models.user import User
from app.models.i18n import UIStringTranslation, ContentTranslation
from typing import Annotated
from fastapi import HTTPException
from pydantic import Field
from app.core.translatable_resolvers import resolve_content_items
from app.core.translatable_fields import TRANSLATABLE_FIELDS, MAX_CONTENT_ITEMS, MAX_CONTENT_TEXT, MAX_CONTENT_TOTAL
from app.core.deps import get_current_user, get_current_user_optional
from app.services.ai import translate_strings
from app.core.auth_ui_strings import AUTH_UI_STRINGS
import time as _time
from pydantic import BaseModel
import hashlib

router = APIRouter(prefix="/i18n", tags=["i18n"])

# Rate-limit для гостя (без cookie): in-memory окно по IP. У нас 2 пользователя
# на проде, Redis не нужен. 10 запросов в минуту на IP — с запасом хватает на
# первую загрузку auth-страницы (2-5 запросов пачками), и не даёт анониму
# крутить LLM. При нескольких uvicorn-воркерах окно будет по-воркерное, но
# у нас один контейнер.
_GUEST_WINDOW_S = 60
_GUEST_MAX = 10
_guest_requests: dict[str, list[float]] = {}

def _guest_rate_ok(ip: str) -> bool:
    now = _time.monotonic()
    bucket = [t for t in _guest_requests.get(ip, []) if now - t < _GUEST_WINDOW_S]
    if len(bucket) >= _GUEST_MAX:
        _guest_requests[ip] = bucket
        return False
    bucket.append(now)
    _guest_requests[ip] = bucket
    return True



def _hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def _log_translate_failure(endpoint: str, locale: str, n_keys: int, exc: Exception) -> None:
    """Сбой перевода раньше был полностью тихим: клиент получал русские оригиналы
    под видом перевода, а в логах не оставалось ничего. Теперь причина видна."""
    print(f"[i18n] {endpoint}/{locale}: перевод {n_keys} ключей не удался: {type(exc).__name__}: {exc}", flush=True)


def _to_model_payload(to_translate: dict[str, str]) -> tuple[dict[str, str], dict[str, str]]:
    """Динамический канал использует текст как ключ (ключ == значение). Гонять длинный русский
    текст в модель дважды (ключом и значением) незачем: на выходе модель печатает ключи обратно,
    а генерация упирается в пропускную способность памяти видеокарты (замер 20.09: 30 строк —
    61 с против 25 с с короткими ключами, результат равного качества по проверке остатков
    кириллицы). Такие ключи заменяем порядковыми номерами и после перевода возвращаем обратно.
    Обычные ключи (a.b) не трогаем — они дают модели контекст.
    Возвращает (то, что уходит модели, обратное соответствие ключ_для_модели -> исходный ключ)."""
    wire: dict[str, str] = {}
    back: dict[str, str] = {}
    for i, (key, text) in enumerate(to_translate.items()):
        wire_key = str(i) if key == text and str(i) not in to_translate else key
        wire[wire_key] = text
        back[wire_key] = key
    return wire, back


class EnsureRequest(StrictIn):
    strings: dict[str, str]  # key -> русский текст


class EnsureResponse(BaseModel):
    translations: dict[str, str]  # key -> переведённый текст
    # Ключи, которые НЕ удалось перевести (сбой модели): в translations их нет. Русский
    # оригинал больше не выдаётся за перевод — клиент не кэширует его и повторит запрос
    # позже (раньше такая строка навсегда оставалась русской в localStorage).
    missing: list[str] = []


async def ensure_ui_translations(db: AsyncSession, locale: str, strings: dict[str, str], *, cache_only: bool = False) -> EnsureResponse:
    """Готовые переводы из кэша и (если не cache_only) перевод недостающих моделью с записью в кэш.
    Общая часть эндпоинта и скрипта прогрева scripts/warm_i18n.py: права доступа проверяет вызывающий."""
    keys = list(strings.keys())
    hashes = {k: _hash(strings[k]) for k in keys}

    existing = (await db.execute(
        select(UIStringTranslation).where(
            UIStringTranslation.target_lang == locale,
            UIStringTranslation.key.in_(keys),
        )
    )).scalars().all()
    cached = {row.key: row for row in existing}

    result: dict[str, str] = {}
    to_translate: dict[str, str] = {}

    for k in keys:
        row = cached.get(k)
        if row and row.source_hash == hashes[k]:
            result[k] = row.translated_text
        else:
            to_translate[k] = strings[k]

    if to_translate and cache_only:
        return EnsureResponse(translations=result)   # гостю: только готовое, без вызова модели

    if to_translate:
        try:
            wire, back = _to_model_payload(to_translate)
            translated = {back[k]: v for k, v in (await translate_strings(wire, locale)).items()}
        except Exception as e:
            _log_translate_failure("ensure", locale, len(to_translate), e)
            return EnsureResponse(translations=result, missing=list(to_translate))

        for k, v in translated.items():
            result[k] = v

        # Атомарный upsert одним запросом. Обычный "select -> если нет -> add"
        # ловит race condition: две параллельные вставки одного и того же
        # (key, target_lang) — например, если одна страница монтирует
        # переиспользуемый компонент дважды (loading/success состояния) и
        # оба запроса стартуют почти одновременно, не успев увидеть
        # insert друг друга. ON CONFLICT DO UPDATE решает это на уровне БД,
        # без ретраев и без потери самого запроса перевода.
        rows = [
            {
                "key": k,
                "source_hash": hashes[k],
                "target_lang": locale,
                "translated_text": v,
            }
            for k, v in translated.items()
        ]
        if rows:
            stmt = pg_insert(UIStringTranslation).values(rows)
            stmt = stmt.on_conflict_do_update(
                constraint="uq_ui_string_key_lang",
                set_={
                    "source_hash": stmt.excluded.source_hash,
                    "translated_text": stmt.excluded.translated_text,
                },
            )
            await db.execute(stmt)
        await db.commit()

    return EnsureResponse(translations=result)


@router.post("/ensure/{locale}", response_model=EnsureResponse)
async def ensure_translations(
    locale: str,
    body: EnsureRequest,
    request: Request,
    user: User | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    if locale == "ru":
        return EnsureResponse(translations=body.strings)

    # Гость: UI-строки auth/гостевого шелла (whitelist) переводятся моделью, чтобы не крутить LLM
    # произвольным текстом от анонима. Любые другие строки гость получает только из кэша:
    # готовый перевод показываем (это публичный текст интерфейса), а модель ради него не работает.
    # Залогиненный без ограничений.
    cache_only = False
    if user is None:
        white = {k: v for k, v in body.strings.items() if v in AUTH_UI_STRINGS}
        rest = {k: v for k, v in body.strings.items() if v not in AUTH_UI_STRINGS}
        if not white:
            cache_only = True
        else:
            ip = (request.client.host if request.client else "unknown")
            rate_ok = _guest_rate_ok(ip)
            if not rest and not rate_ok:
                raise HTTPException(status_code=429, detail="Слишком много запросов, подождите минуту")
            if rest and rate_ok:
                # Пачка страницы смешанная: модель работает только для белого списка, остальное из кэша.
                first = await ensure_ui_translations(db, locale, white)
                second = await ensure_ui_translations(db, locale, rest, cache_only=True)
                return EnsureResponse(translations={**second.translations, **first.translations}, missing=first.missing)
            cache_only = bool(rest)

    return await ensure_ui_translations(db, locale, body.strings, cache_only=cache_only)


class ContentItem(StrictIn):
    entity_type: str
    entity_id: int
    field: Short32
    text: LongText


class EnsureContentRequest(StrictIn):
    items: Annotated[list[ContentItem], Field(max_length=MAX_CONTENT_ITEMS)]


class EnsureContentResponse(BaseModel):
    translations: dict[str, str]  # "entity_type:entity_id:field" -> перевод
    # Ключи, которые НЕ удалось перевести (сбой модели): в translations их нет. Русский
    # оригинал больше не выдаётся за перевод — клиент не кэширует его и повторит запрос
    # позже (раньше такая строка навсегда оставалась русской в localStorage).
    missing: list[str] = []


def _content_key(entity_type: str, entity_id: int, field: str) -> str:
    return f"{entity_type}:{entity_id}:{field}"


@router.post("/ensure-content/{locale}", response_model=EnsureContentResponse)
async def ensure_content_translations(
    locale: str,
    body: EnsureContentRequest,
    user: User | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    """
    Перевод пользовательского контента (не строк интерфейса — см. ensure_translations
    выше). Кэш ключуется по (entity_type, entity_id, field, язык), не по тексту —
    решение "не переводить свой контент" принимает вызывающая сторона (фронт),
    этот эндпоинт переводит ровно то, что ему прислали, без проверки владения.
    """
    for i in body.items:
        if i.field not in TRANSLATABLE_FIELDS.get(i.entity_type, frozenset()):
            raise HTTPException(400, "Это поле нельзя переводить")
        if len(i.text) > MAX_CONTENT_TEXT:
            raise HTTPException(422, "Текст слишком длинный для перевода")
    if sum(len(i.text) for i in body.items) > MAX_CONTENT_TOTAL:
        raise HTTPException(422, "Слишком много текста в одном запросе")
    items = await resolve_content_items(db, user, body.items)
    if locale == "ru":
        return EnsureContentResponse(
            translations={_content_key(i.entity_type, i.entity_id, i.field): i.text for i in items}
        )
    if not items:
        return EnsureContentResponse(translations={})

    hashes = {_content_key(i.entity_type, i.entity_id, i.field): _hash(i.text) for i in items}

    entity_types = {i.entity_type for i in items}
    entity_ids = {i.entity_id for i in items}
    fields = {i.field for i in items}

    existing = (await db.execute(
        select(ContentTranslation).where(
            ContentTranslation.target_lang == locale,
            ContentTranslation.entity_type.in_(entity_types),
            ContentTranslation.entity_id.in_(entity_ids),
            ContentTranslation.field.in_(fields),
        )
    )).scalars().all()
    cached = {(row.entity_type, row.entity_id, row.field): row for row in existing}

    result: dict[str, str] = {}
    to_translate: dict[str, str] = {}
    to_translate_items: dict[str, ContentItem] = {}

    for item in items:
        k = _content_key(item.entity_type, item.entity_id, item.field)
        row = cached.get((item.entity_type, item.entity_id, item.field))
        if row and row.source_hash == hashes[k]:
            result[k] = row.translated_text
        else:
            to_translate[k] = item.text
            to_translate_items[k] = item

    if to_translate and user is None:
        return EnsureContentResponse(translations=result)   # гостю только готовое, модель ради него не работает

    if to_translate:
        try:
            translated = await translate_strings(to_translate, locale)
        except Exception as e:
            _log_translate_failure("ensure-content", locale, len(to_translate), e)
            return EnsureContentResponse(translations=result, missing=list(to_translate))

        for k, v in translated.items():
            result[k] = v

        rows = [
            {
                "entity_type": to_translate_items[k].entity_type,
                "entity_id": to_translate_items[k].entity_id,
                "field": to_translate_items[k].field,
                "source_hash": hashes[k],
                "target_lang": locale,
                "translated_text": v,
            }
            for k, v in translated.items()
        ]
        if rows:
            stmt = pg_insert(ContentTranslation).values(rows)
            stmt = stmt.on_conflict_do_update(
                constraint="uq_content_translation",
                set_={
                    "source_hash": stmt.excluded.source_hash,
                    "translated_text": stmt.excluded.translated_text,
                },
            )
            await db.execute(stmt)
        await db.commit()

    return EnsureContentResponse(translations=result)
