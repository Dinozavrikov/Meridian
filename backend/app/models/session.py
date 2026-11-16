from datetime import datetime
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Boolean, ForeignKey, DateTime, func
from app.db.base import Base


class Session(Base):
    """Одна активная refresh-сессия (одно устройство/браузер)."""
    __tablename__ = "sessions"
    id:            Mapped[int]      = mapped_column(primary_key=True)
    user_id:       Mapped[int]      = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    jti:           Mapped[str]      = mapped_column(String(64), unique=True, index=True)
    user_agent:    Mapped[str]      = mapped_column(String(512), default="")
    ip_address:    Mapped[str]      = mapped_column(String(64), default="")
    revoked:        Mapped[bool]     = mapped_column(Boolean, default=False)
    created_at:    Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_seen_at:  Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
