from datetime import datetime
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Text, DateTime, func, UniqueConstraint
from app.db.base import Base
from app.core.encrypted_field import EncryptedText


class UIStringTranslation(Base):
    """Кеш переводов статичных строк интерфейса (построчный, по ключу + языку)."""
    __tablename__ = "ui_string_translations"
    __table_args__ = (UniqueConstraint("key", "target_lang", name="uq_ui_string_key_lang"),)

    id:              Mapped[int]      = mapped_column(primary_key=True)
    key:             Mapped[str]      = mapped_column(Text, index=True)
    source_hash:     Mapped[str]      = mapped_column(String(64))
    target_lang:     Mapped[str]      = mapped_column(String(16), index=True)
    translated_text: Mapped[str]      = mapped_column(Text)
    generated_at:    Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ContentTranslation(Base):
    """Кеш переводов пользовательского контента — ключ (entity_type,
    entity_id, field, target_lang), НЕ сам текст (см. useDynamicT.ts —
    там явный запрет использовать текст-как-ключ для контента: он уникален
    на запись, переиспользования между записями нет, кэш просто раздувается)."""
    __tablename__ = "content_translations"
    __table_args__ = (UniqueConstraint("entity_type", "entity_id", "field", "target_lang", name="uq_content_translation"),)

    id:              Mapped[int]      = mapped_column(primary_key=True)
    entity_type:     Mapped[str]      = mapped_column(String(32), index=True)
    entity_id:       Mapped[int]      = mapped_column(index=True)
    field:           Mapped[str]      = mapped_column(String(32))
    source_hash:     Mapped[str]      = mapped_column(String(64))
    target_lang:     Mapped[str]      = mapped_column(String(16), index=True)
    translated_text: Mapped[str]      = mapped_column(EncryptedText)
    generated_at:    Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
