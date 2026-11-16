from app.schemas._strict import StrictIn, Short16, Short32, Short128, Short255, LongText
from pydantic import BaseModel, EmailStr, field_validator
import re


def validate_password_strength(v: str) -> str:
    """Общая проверка пароля — используется при регистрации, смене пароля
    (change-password) и сбросе (reset-password), чтобы порог не расходился
    по местам (раньше change-password проверял >=6, здесь было >=8 — баг
    несогласованности, найден 2026-09-12)."""
    if len(v.encode()) > 72:
        raise ValueError("Пароль слишком длинный")
    if len(v) < 8:
        raise ValueError("Минимум 8 символов")
    return v


class RegisterRequest(StrictIn):
    username: str
    email: EmailStr
    password: str
    display_name: Short128 = ""
    turnstile_token: str
    # Honeypot: поле, невидимое человеку (скрыто CSS на фронте), но видимое
    # примитивным ботам, парсящим HTML формы. Непустое значение — сигнал
    # бота, отклоняем ДО реальной проверки Turnstile (дешевле по CPU/сети,
    # не тратим вызов к Cloudflare API на то, что и так очевидно). Название
    # поля намеренно звучит правдоподобно для бота ("website"), не "honeypot"
    # — иначе умный бот просто узнает паттерн по имени поля.
    website: str = ""

    @field_validator("username")
    @classmethod
    def username_valid(cls, v: str) -> str:
        v = v.strip()
        if " " in v:
            raise ValueError("Имя пользователя не может содержать пробелы — используйте _ или -")
        if not re.match(r"^[\w-]{3,32}$", v, re.UNICODE):
            raise ValueError("3–32 символа, буквы, цифры, _ и -, без пробелов")
        return v

    @field_validator("password")
    @classmethod
    def password_strong(cls, v: str) -> str:
        return validate_password_strength(v)


class LoginRequest(StrictIn):
    username: str
    password: str


class ForgotPasswordRequest(StrictIn):
    email: EmailStr


class ResetPasswordRequest(StrictIn):
    token: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def new_password_strong(cls, v: str) -> str:
        return validate_password_strength(v)


class UserOut(BaseModel):
    id: int
    username: str
    email: str
    display_name: str
    bio: str
    is_verified: bool
    onboarding_completed: bool
    onboarding_step: int
    default_visibility: str
    avatar_url: str | None = None

    model_config = {"from_attributes": True}


class OnboardingUpdate(StrictIn):
    step: int
    completed: bool = False
