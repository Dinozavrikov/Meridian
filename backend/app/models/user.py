from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Boolean, Text, ForeignKey, DateTime, func
from datetime import datetime
from app.db.base import Base, TimestampMixin


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id:            Mapped[int]  = mapped_column(primary_key=True)
    username:      Mapped[str]  = mapped_column(String(64), unique=True, index=True)
    email:         Mapped[str]  = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str | None]  = mapped_column(String(255), nullable=True)
    google_id:     Mapped[str | None]  = mapped_column(String(64), nullable=True, unique=True, index=True)
    display_name:  Mapped[str]  = mapped_column(String(128), default="")
    bio:           Mapped[str]  = mapped_column(Text, default="")
    is_active:     Mapped[bool] = mapped_column(Boolean, default=True)
    is_verified:   Mapped[bool] = mapped_column(Boolean, default=False)
    onboarding_completed: Mapped[bool] = mapped_column(Boolean, default=False)
    onboarding_step:      Mapped[int]  = mapped_column(default=0)
    default_visibility:   Mapped[str]  = mapped_column(String(16), default="private")
    avatar_url:            Mapped[str | None] = mapped_column(String(255), nullable=True)


class NotificationPrefs(Base):
    __tablename__ = "notification_prefs"
    user_id:              Mapped[int]  = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    new_messages:         Mapped[bool] = mapped_column(Boolean, default=True)
    comments:             Mapped[bool] = mapped_column(Boolean, default=True)
    prediction_reminders: Mapped[bool] = mapped_column(Boolean, default=False)


class PasswordResetToken(Base):
    """Одноразовый токен сброса пароля. Храним хэш, не сам токен (см. миграцию
    92c310cb9aeb) — компрометация БД не должна давать готовые ссылки сброса.
    used_at вместо удаления строки — отличить "использован" от "не найден"
    при разборе инцидентов."""
    __tablename__ = "password_reset_tokens"
    id:          Mapped[int]      = mapped_column(primary_key=True)
    user_id:     Mapped[int]      = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash:  Mapped[str]      = mapped_column(String(64), unique=True, index=True)
    expires_at:  Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at:     Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at:  Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
