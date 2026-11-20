from app.core.prediction_status import OPEN_PREDICTION_STATUS
from app.schemas._strict import StrictIn, Short16, Short32, Short128, Short255, LongText, Visibility
import re
import secrets
import hashlib
from urllib.parse import urlencode
import httpx
from fastapi import APIRouter, Depends, HTTPException, Response, Cookie, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text, update
from app.db.session import get_db
from app.models.user import User, PasswordResetToken
from app.models.session import Session as SessionModel
from app.services.session_purge import purge_dead_sessions
from app.services.privacy_facts import RESET_LINK_MINUTES, GOOGLE_STATE_MINUTES, reset_ttl_text
from app.models.entities import Observation, Hypothesis, Prediction
from datetime import date, datetime, timedelta, timezone
from app.schemas.auth import (
    RegisterRequest, LoginRequest, UserOut, OnboardingUpdate,
    ForgotPasswordRequest, ResetPasswordRequest, validate_password_strength,
)
from app.core.security import hash_password, verify_password, create_access_token, create_refresh_token, decode_token, decode_token_payload
from app.core.slug import unique_slug_for
from app.core.deps import get_current_user
from app.core.geoip import is_russian_ip
from app.core.config import settings
from app.services.email import send_email, render_email_html, email_button, esc
from typing import Annotated, Optional
from pydantic import BaseModel, EmailStr, StringConstraints, field_validator

router = APIRouter(prefix="/auth", tags=["auth"])
def cookie_opts() -> dict:
    """Параметры кук входа. Secure читается из настроек при каждом вызове, а не при импорте: так его проверяет тест."""
    return dict(httponly=True, samesite="lax", secure=settings.cookie_secure)

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"

TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"


async def _verify_turnstile(token: str, remote_ip: str) -> bool:
    """Проверка Turnstile-токена на стороне Cloudflare. Fail-CLOSED (в отличие
    от geoip's fail-open) — здесь неопределенность должна блокировать
    регистрацию, не пропускать ее: цена ложного срабатывания (реальный
    человек изредка получает ошибку, может попробовать снова) намного ниже
    цены пропуска (боты проходят молча, если сервис верификации недоступен)."""
    if not settings.TURNSTILE_SECRET_KEY:
        print("[auth] TURNSTILE_SECRET_KEY не настроен — регистрация заблокирована до настройки", flush=True)
        return False
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(TURNSTILE_VERIFY_URL, data={
                "secret": settings.TURNSTILE_SECRET_KEY,
                "response": token,
                "remoteip": remote_ip,
            })
            if resp.status_code != 200:
                print(f"[auth] Turnstile HTTP {resp.status_code}, тело ответа: {resp.text}", flush=True)
                return False
            result = resp.json()
            success = result.get("success", False) is True
            if not success:
                print(f"[auth] Turnstile отклонен Cloudflare: {result}", flush=True)
            return success
    except Exception as e:
        print(f"[auth] Turnstile verify не удался: {type(e).__name__}: {e}", flush=True)
        return False


def _client_ip(request: Request) -> str:
    """IP клиента для гео-проверки. Сайт стоит за nginx (backend не публикует
    свой порт наружу — см. docker-compose.yml, единственный путь снаружи идет
    через nginx), который перезаписывает (не добавляет к клиентскому значению)
    заголовок X-Real-IP собственным $remote_addr — значит X-Real-IP здесь
    ДОВЕРЕННЫЙ, подделать его в обход nginx невозможно. request.client.host
    без этого читал бы IP самого nginx-контейнера для всех запросов —
    геогейтинг увидел бы один internal docker IP на все запросы и
    fail-open'нул бы всех разом, включая пользователей из РФ, без единой
    ошибки в логах. Если когда-нибудь появится Cloudflare/другой прокси
    ПЕРЕД nginx — эту функцию и конфигурацию обратного прокси нужно будет пересмотреть вместе,
    иначе X-Real-IP снова станет подделываемым (Cloudflare нужно доверять
    отдельно, см. real_ip_module)."""
    return request.headers.get("x-real-ip") or (request.client.host if request.client else "")


async def _generate_username_from_email(db: AsyncSession, email: str) -> str:
    """Тот же паттерн, что unique_slug_for — база + числовой суффикс при
    коллизии. Локальная часть email очищается под допустимые для username
    символы (буквы/цифры/подчеркивание/дефис, см. RegisterRequest.username_valid);
    если после очистки короче 3 символов — достраивается до 'user'."""
    local = email.split("@")[0]
    base = re.sub(r"[^\w-]", "", local, flags=re.UNICODE)
    if len(base) < 3:
        base = f"user{base}"
    base = base[:28]  # запас под суффикс "-N", итог не длиннее 32
    username = base
    i = 2
    while (await db.execute(select(User).where(User.username == username))).scalar_one_or_none():
        username = f"{base}-{i}"
        i += 1
    return username


async def _issue_tokens(response: Response, user: User, request: Request, db: AsyncSession):
    access = create_access_token(user.username)
    refresh, jti = create_refresh_token(user.username)
    ua = request.headers.get("user-agent", "")[:512]
    ip = request.client.host if request.client else ""
    await purge_dead_sessions(db, user.id)
    db.add(SessionModel(user_id=user.id, jti=jti, user_agent=ua, ip_address=ip))
    await db.commit()
    response.set_cookie("access_token", access, max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60, **cookie_opts())
    response.set_cookie("refresh_token", refresh, max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400, **cookie_opts())


@router.post("/register", response_model=UserOut)
async def register(body: RegisterRequest, request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    if body.website:
        # Honeypot сработал — молча отклоняем как обычную ошибку валидации,
        # не палим боту, что именно его вычислили (не 403 "бот обнаружен").
        raise HTTPException(status_code=400, detail="Не удалось создать аккаунт")
    if not await _verify_turnstile(body.turnstile_token, _client_ip(request)):
        raise HTTPException(status_code=400, detail="Не удалось подтвердить, что вы не робот — попробуйте еще раз")

    exists = await db.execute(
        select(User).where((User.username == body.username) | (User.email == body.email))
    )
    if exists.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Пользователь уже существует")
    user = User(
        username=body.username, email=body.email,
        password_hash=hash_password(body.password),
        display_name=body.display_name or body.username,
    )
    db.add(user)
    await db.flush()  # user.id нужен ниже, но коммитим все вместе одной транзакцией

    today = date.today().isoformat()
    now = datetime.now(timezone.utc)

    # Стартовый цикл: наблюдение + две связки гипотеза/прогноз.
    # Связка 1 (мгновенная): закрывается в первую сессию, учит UI confirm/refute.
    # Связка 2 (отложенная, 3 дня): крючок для возврата, про самого пользователя.
    obs_slug = await unique_slug_for(db, Observation, "Первая запись")
    obs = Observation(
        user_id=user.id, date=today, author=user.display_name or user.username,
        title="Первая запись", slug=obs_slug,
        text="Я завел(а) аккаунт в Meridian.",
        status="сырое", visibility="private",
    )
    db.add(obs)

    hyp1_name = "После первого знакомства я пойму, как пользоваться Meridian, без инструкции"
    hyp1_slug = await unique_slug_for(db, Hypothesis, hyp1_name)
    hyp1 = Hypothesis(
        user_id=user.id,
        name=hyp1_name, slug=hyp1_slug,
        description="Стартовая гипотеза Meridian — проверьте ее прямо сейчас, познакомившись с интерфейсом.",
        falsification_criteria="Если после нескольких примеров в ленте я все еще путаю, что делают кнопки подтвердить / опровергнуть / частично — гипотеза неверна.",
        date_created=today, status="идея", visibility="private",
        is_onboarding=True,
    )
    db.add(hyp1)
    await db.flush()  # hyp1.id нужен для прогноза ниже

    pred1_slug = await unique_slug_for(db, Prediction, "Разберусь в кнопках подтвердить опровергнуть")
    pred1 = Prediction(
        user_id=user.id,
        title="Я разберусь, что делают кнопки подтвердить / опровергнуть / частично", slug=pred1_slug,
        text="Я разберусь, что делают кнопки подтвердить / опровергнуть / частично, посмотрев на несколько примеров в ленте.",
        date_created=today, hypothesis_id=hyp1.id, status=OPEN_PREDICTION_STATUS,
        visibility="private", is_onboarding=True,
        expected_check_date=now,
    )
    db.add(pred1)

    hyp2_name = "Я неплохо предсказываю, как пройдут ближайшие несколько дней"
    hyp2_slug = await unique_slug_for(db, Hypothesis, hyp2_name)
    hyp2 = Hypothesis(
        user_id=user.id,
        name=hyp2_name, slug=hyp2_slug,
        description="Стартовая гипотеза Meridian — раскройте ее и добавьте свои наблюдения и прогнозы.",
        falsification_criteria="Если через 3 дня реальность разойдется с тем, что я ожидал сейчас, — значит я переоцениваю точность своей интуиции.",
        date_created=today, status="идея", visibility="private",
        is_onboarding=True,
    )
    db.add(hyp2)
    await db.flush()  # hyp2.id нужен для прогноза ниже

    pred2_slug = await unique_slug_for(db, Prediction, "Следующие 3 дня пройдут примерно так как я ожидаю")
    pred2 = Prediction(
        user_id=user.id,
        title="Следующие 3 дня пройдут примерно так, как я ожидаю сейчас", slug=pred2_slug,
        text="Следующие 3 дня пройдут примерно так, как я ожидаю сейчас — без крупных сюрпризов.",
        date_created=today, hypothesis_id=hyp2.id, status=OPEN_PREDICTION_STATUS,
        visibility="private", is_onboarding=True,
        expected_check_date=now + timedelta(hours=72),
    )
    db.add(pred2)

    await db.commit()
    await db.refresh(user)
    await _issue_tokens(response, user, request, db)
    return user


@router.post("/login", response_model=UserOut)
async def login(body: LoginRequest, request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    # Обычный поиск по username.
    result = await db.execute(select(User).where(User.username == body.username))
    user = result.scalar_one_or_none()

    # Fallback для Unicode-логинов:
    # сравниваем UTF-8 байты, обходя возможную проблему collation/asyncpg.
    if not user:
        result = await db.execute(
            select(User).where(
                text("convert_to(username, 'UTF8') = convert_to(:username, 'UTF8')")
            ).params(username=body.username)
        )
        user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=401, detail="Неверные данные")

    if not user.password_hash or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Неверные данные")

    await _issue_tokens(response, user, request, db)
    return user


@router.post("/refresh", response_model=UserOut)
async def refresh(response: Response, refresh_token: Optional[str] = Cookie(None), db: AsyncSession = Depends(get_db)):
    if not refresh_token:
        raise HTTPException(status_code=401, detail="Нет refresh токена")
    payload = decode_token_payload(refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Токен недействителен")
    username = payload.get("sub")
    jti = payload.get("jti")
    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="Пользователь не найден")
    if jti:
        sess = (await db.execute(select(SessionModel).where(SessionModel.jti == jti))).scalar_one_or_none()
        if not sess or sess.revoked:
            raise HTTPException(status_code=401, detail="Сессия отозвана")
        sess.last_seen_at = datetime.now(timezone.utc)
        await db.commit()
    response.set_cookie("access_token", create_access_token(user.username), max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60, **cookie_opts())
    return user


@router.post("/logout")
async def logout(response: Response, refresh_token: Optional[str] = Cookie(None), db: AsyncSession = Depends(get_db)):
    if refresh_token:
        payload = decode_token_payload(refresh_token)
        jti = payload.get("jti") if payload else None
        if jti:
            sess = (await db.execute(select(SessionModel).where(SessionModel.jti == jti))).scalar_one_or_none()
            if sess:
                sess.revoked = True
                await db.commit()
    response.delete_cookie("access_token")
    response.delete_cookie("refresh_token")
    return {"ok": True}


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)):
    return user


@router.patch("/onboarding", response_model=UserOut)
async def update_onboarding(body: OnboardingUpdate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    user.onboarding_step = body.step
    user.onboarding_completed = body.completed
    await db.commit()
    await db.refresh(user)
    return user


class ProfileUpdate(StrictIn):
    """Пропущенное поле остается как есть; плохой тип, длина или видимость дают 422."""
    display_name: Optional[Short128] = None
    bio: Optional[Annotated[str, StringConstraints(max_length=2000)]] = None
    default_visibility: Optional[Visibility] = None


@router.patch("/me", response_model=UserOut)
async def update_me(body: ProfileUpdate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if body.display_name is not None:
        user.display_name = body.display_name
    if body.bio is not None:
        user.bio = body.bio
    if body.default_visibility is not None:
        user.default_visibility = body.default_visibility
    await db.commit()
    await db.refresh(user)
    return user


class PasswordChange(StrictIn):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def new_password_strong(cls, v: str) -> str:
        return validate_password_strength(v)


class EmailChange(StrictIn):
    password: str
    new_email: EmailStr


@router.post("/change-email", response_model=UserOut)
async def change_email(body: EmailChange, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not verify_password(body.password, user.password_hash):
        raise HTTPException(400, "Неверный пароль")
    existing = (await db.execute(select(User).where(User.email == body.new_email, User.id != user.id))).scalar_one_or_none()
    if existing:
        raise HTTPException(400, "Этот email уже используется")
    user.email = body.new_email
    await db.commit()
    await db.refresh(user)
    return user


@router.post("/change-password")
async def change_password(body: PasswordChange, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(400, "Текущий пароль неверен")
    user.password_hash = hash_password(body.new_password)
    await db.commit()
    return {"ok": True}


@router.post("/forgot-password")
async def forgot_password(body: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    """
    Всегда возвращает {"ok": True} независимо от того, найден ли email —
    иначе ответ раскрывал бы существование аккаунта перебором почт.
    """
    user = (await db.execute(select(User).where(User.email == body.email))).scalar_one_or_none()
    if user:
        if user.password_hash is None:
            # Google-only аккаунт — своего пароля нет, восстанавливать нечего.
            await send_email(
                to=user.email,
                subject="Восстановление пароля в Meridian",
                body=(
                    f"Аккаунт Meridian на {user.email} использует вход через Google — "
                    "отдельного пароля у него нет. Чтобы войти, используйте кнопку "
                    "«Войти через Google» на странице входа."
                ),
                html=render_email_html(
                    preheader="Этот аккаунт входит через Google",
                    body_html=(
                        f'<p style="margin:0 0 8px 0;">Вы запросили восстановление пароля для аккаунта '
                        f'Meridian, привязанного к {esc(user.email)}.</p>'
                        '<p style="margin:0;">Этот аккаунт использует вход через Google — отдельного пароля '
                        'у него нет. Чтобы войти, используйте кнопку «Войти через Google» на странице входа.</p>'
                    ),
                ),
            )
        else:
            raw_token = secrets.token_urlsafe(32)
            token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
            expires_at = datetime.now(timezone.utc) + timedelta(minutes=RESET_LINK_MINUTES)
            db.add(PasswordResetToken(user_id=user.id, token_hash=token_hash, expires_at=expires_at))
            await db.commit()

            reset_url = f"https://miridin.com/reset-password?token={raw_token}"
            await send_email(
                to=user.email,
                subject="Восстановление пароля в Meridian",
                body=(
                    f"Чтобы сбросить пароль, перейдите по ссылке (действует {reset_ttl_text()}): {reset_url}\n\n"
                    "Если вы не запрашивали это письмо — просто проигнорируйте его, пароль останется прежним."
                ),
                html=render_email_html(
                    preheader=f"Ссылка для сброса пароля — действует {reset_ttl_text()}",
                    body_html=(
                        '<p style="margin:0 0 8px 0;">Вы запросили сброс пароля для вашего аккаунта Meridian.</p>'
                        f'<p style="margin:0 0 16px 0;">Ссылка действует {reset_ttl_text()}.</p>'
                        f'{email_button(reset_url, "Сбросить пароль")}'
                        '<p style="margin:20px 0 0 0;font-size:13px;color:rgba(242,239,233,0.45);">'
                        'Если вы не запрашивали это письмо — просто проигнорируйте его, ничего не изменится.</p>'
                    ),
                ),
            )
    return {"ok": True}


@router.post("/reset-password")
async def reset_password(body: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    token_hash = hashlib.sha256(body.token.encode()).hexdigest()
    now = datetime.now(timezone.utc)
    rt = (await db.execute(
        select(PasswordResetToken).where(
            PasswordResetToken.token_hash == token_hash,
            PasswordResetToken.used_at.is_(None),
            PasswordResetToken.expires_at > now,
        )
    )).scalar_one_or_none()
    if not rt:
        raise HTTPException(400, "Ссылка недействительна или истекла")

    user = await db.get(User, rt.user_id)
    if not user:
        raise HTTPException(400, "Ссылка недействительна или истекла")

    user.password_hash = hash_password(body.new_password)
    rt.used_at = now

    # Разлогиниваем все сессии — сбросить пароль мог не владелец аккаунта,
    # а тот, кто получил доступ к почте (см. предупреждение в письме ниже).
    await db.execute(
        update(SessionModel).where(SessionModel.user_id == user.id).values(revoked=True)
    )
    await db.commit()

    await send_email(
        to=user.email,
        subject="Пароль в Meridian изменен",
        body=(
            "Пароль вашего аккаунта Meridian только что был изменен. Если это были не вы — "
            "срочно запросите новый сброс пароля через 'Забыли пароль?' на странице входа. "
            "Все сессии на других устройствах уже завершены этим действием."
        ),
        html=render_email_html(
            preheader="Пароль изменен — если это были не вы, действуйте немедленно",
            body_html=(
                '<p style="margin:0 0 8px 0;">Пароль вашего аккаунта Meridian только что был изменен.</p>'
                '<p style="margin:0;padding:12px 16px;background:rgba(231,76,60,0.08);'
                'border-left:2px solid #E74C3C;border-radius:4px;color:#e0a0a0;">'
                '<strong>Это были не вы?</strong> Кто-то другой мог получить доступ к вашей почте. '
                'Срочно запросите новый сброс пароля через страницу входа — все сессии на других '
                'устройствах уже завершены этим действием.</p>'
            ),
        ),
    )
    return {"ok": True}


class SessionOut(BaseModel):
    id: int
    user_agent: str
    ip_address: str
    created_at: str
    last_seen_at: str
    is_current: bool


@router.get("/sessions", response_model=list[SessionOut])
async def list_sessions(request: Request, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
                         refresh_token: Optional[str] = Cookie(None)):
    current_jti = None
    if refresh_token:
        payload = decode_token_payload(refresh_token)
        current_jti = payload.get("jti") if payload else None

    rows = (await db.execute(
        select(SessionModel).where(SessionModel.user_id == user.id, SessionModel.revoked == False)  # noqa: E712
        .order_by(SessionModel.last_seen_at.desc())
    )).scalars().all()

    return [
        SessionOut(
            id=s.id, user_agent=s.user_agent, ip_address=s.ip_address,
            created_at=s.created_at.isoformat(), last_seen_at=s.last_seen_at.isoformat(),
            is_current=(s.jti == current_jti),
        ) for s in rows
    ]


@router.delete("/sessions/{session_id}", status_code=204)
async def revoke_session(session_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    sess = (await db.execute(select(SessionModel).where(SessionModel.id == session_id, SessionModel.user_id == user.id))).scalar_one_or_none()
    if not sess:
        raise HTTPException(404, "Сессия не найдена")
    sess.revoked = True
    await db.commit()


class AccountDelete(StrictIn):
    password: Short255


@router.delete("/me")
async def delete_account(body: AccountDelete, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not user.password_hash:
        # Google-only аккаунт — пароля никогда не было, подтверждение паролем
        # физически невозможно. Пока нет отдельного подтверждения для этого
        # случая (например, повторный проход через Google) — блокируем явным
        # 400, а не даем удалить аккаунт без всякого подтверждения вообще.
        raise HTTPException(400, "У аккаунта без пароля пока нет способа подтвердить удаление — обратитесь в поддержку")
    if not verify_password(body.password, user.password_hash):
        raise HTTPException(400, "Неверный пароль")
    await db.delete(user)
    await db.commit()
    return {"ok": True}



@router.get("/google/available")
async def google_available(request: Request):
    """Фронт дергает это при загрузке страницы логина, чтобы решить —
    рисовать кнопку 'Войти через Google' или нейтральную плашку. Гео-гейтинг:
    авторизация через Google для пользователей из РФ не предоставляется
    (см. meridian-web memory — соответствие требованиям законодательства РФ).
    Fail-open на неопределенном IP (см. is_russian_ip) — не блокирует
    легитимных пользователей при сбое геобазы."""
    return {"available": not is_russian_ip(_client_ip(request))}


@router.get("/google/login")
async def google_login(request: Request, response: Response):
    """Редирект на Google OAuth consent screen. Гео-проверка здесь ТОЖЕ
    (не только на /available) — прямой заход на этот URL, минуя фронт,
    должен быть отбит так же, как скрытая кнопка. state — CSRF-защита:
    случайный токен кладем в httponly cookie и требуем его обратно в
    callback как query-параметр; несовпадение = отклоненный запрос."""
    if is_russian_ip(_client_ip(request)):
        raise HTTPException(403, "Авторизация через Google недоступна для пользователей из Российской Федерации в соответствии с требованиями законодательства РФ")
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(503, "Google-авторизация не настроена")

    state = secrets.token_urlsafe(32)
    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "access_type": "online",
        "prompt": "select_account",
    }
    redirect = RedirectResponse(url=f"{GOOGLE_AUTH_URL}?{urlencode(params)}")
    redirect.set_cookie("google_oauth_state", state, max_age=GOOGLE_STATE_MINUTES * 60, **cookie_opts())
    return redirect


@router.get("/google/callback")
async def google_callback(
    request: Request, response: Response, db: AsyncSession = Depends(get_db),
    code: Optional[str] = None, state: Optional[str] = None, error: Optional[str] = None,
    google_oauth_state: Optional[str] = Cookie(None),
):
    """Обмен code на профиль, автопривязка/создание юзера, выдача обычных
    access/refresh токенов через _issue_tokens (Google-логин после этого шага
    неотличим от обычного — та же сессия, те же куки)."""
    frontend_base = settings.cors_origins[0] if settings.cors_origins else "/"

    if is_russian_ip(_client_ip(request)):
        raise HTTPException(403, "Авторизация через Google недоступна для пользователей из Российской Федерации в соответствии с требованиями законодательства РФ")

    if error or not code:
        return RedirectResponse(url=f"{frontend_base}/login?google_error=denied")
    if not state or not google_oauth_state or state != google_oauth_state:
        raise HTTPException(400, "Неверный state — возможная CSRF-атака или истекшая сессия авторизации")

    async with httpx.AsyncClient(timeout=15) as client:
        token_resp = await client.post(GOOGLE_TOKEN_URL, data={
            "code": code,
            "client_id": settings.GOOGLE_CLIENT_ID,
            "client_secret": settings.GOOGLE_CLIENT_SECRET,
            "redirect_uri": settings.GOOGLE_REDIRECT_URI,
            "grant_type": "authorization_code",
        })
        if token_resp.status_code >= 400:
            print(f"[auth] Google token exchange failed: {token_resp.status_code} {token_resp.text[:300]}", flush=True)
            return RedirectResponse(url=f"{frontend_base}/login?google_error=token_exchange_failed")
        access_token = token_resp.json().get("access_token")

        userinfo_resp = await client.get(GOOGLE_USERINFO_URL, headers={"Authorization": f"Bearer {access_token}"})
        if userinfo_resp.status_code >= 400:
            print(f"[auth] Google userinfo failed: {userinfo_resp.status_code} {userinfo_resp.text[:300]}", flush=True)
            return RedirectResponse(url=f"{frontend_base}/login?google_error=userinfo_failed")
        profile = userinfo_resp.json()

    google_id = profile.get("sub")
    email = profile.get("email")
    email_verified = profile.get("email_verified", False)
    display_name = profile.get("name") or (email.split("@")[0] if email else "")

    if not google_id or not email:
        return RedirectResponse(url=f"{frontend_base}/login?google_error=incomplete_profile")
    if not email_verified:
        return RedirectResponse(url=f"{frontend_base}/login?google_error=email_not_verified")

    user = (await db.execute(select(User).where(User.google_id == google_id))).scalar_one_or_none()
    if not user:
        user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
        if user:
            user.google_id = google_id
            await db.commit()
            await db.refresh(user)
        else:
            username = await _generate_username_from_email(db, email)
            user = User(
                username=username, email=email, google_id=google_id,
                password_hash=None, display_name=display_name,
            )
            db.add(user)
            await db.commit()
            await db.refresh(user)

    redirect = RedirectResponse(url=frontend_base)
    # _issue_tokens вызывает response.set_cookie(...) — куки должны попасть
    # именно в реально возвращаемый объект (redirect), а не в FastAPI-инжектнутый
    # `response`-параметр (это два разных объекта; FastAPI мержит заголовки из
    # `response`-параметра только когда эндпоинт возвращает ЕГО ЖЕ, не другой
    # Response). Раньше здесь был баг: куки уходили в response, но реально
    # отдавался redirect — сессия молча терялась.
    await _issue_tokens(redirect, user, request, db)
    redirect.delete_cookie("google_oauth_state")
    return redirect
