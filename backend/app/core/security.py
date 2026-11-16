import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__truncate_error=False)


def hash_password(password: str) -> str:
    return pwd_context.hash(password[:72])


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain[:72], hashed)


def create_access_token(subject: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode(
        {"sub": subject, "exp": expire, "type": "access"},
        settings.SECRET_KEY, algorithm=settings.ALGORITHM
    )


def create_refresh_token(subject: str) -> tuple[str, str]:
    """Возвращает (token, jti) — jti нужен для записи в таблицу sessions."""
    jti = uuid.uuid4().hex
    expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    token = jwt.encode(
        {"sub": subject, "exp": expire, "type": "refresh", "jti": jti},
        settings.SECRET_KEY, algorithm=settings.ALGORITHM
    )
    return token, jti


def decode_token(token: str) -> Optional[str]:
    """Старое поведение — только username, используется для access-токена."""
    payload = decode_token_payload(token)
    return payload.get("sub") if payload else None


def decode_token_payload(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        return None
