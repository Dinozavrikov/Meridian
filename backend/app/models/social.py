from datetime import datetime
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Text, Integer, Boolean, ForeignKey, UniqueConstraint, Index, text as sa_text
from app.db.base import Base, TimestampMixin
from app.core.encrypted_field import EncryptedText


class Lab(Base, TimestampMixin):
    __tablename__ = "labs"
    id:          Mapped[int]  = mapped_column(primary_key=True)
    owner_id:    Mapped[int]  = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name:        Mapped[str]  = mapped_column(String(128))
    slug:        Mapped[str]  = mapped_column(String(128), unique=True, index=True)
    description: Mapped[str]  = mapped_column(Text, default="")
    is_public:   Mapped[bool] = mapped_column(Boolean, default=False)
    # Цель лабы — ровно одна Задача или Вопрос, вокруг которых она собрана.
    # "task" | "question"; goal_id ссылается на research_tasks.id / questions.id
    # (без FK-констрейнта — типы разные, целостность проверяется в коде).
    goal_type:   Mapped[str | None] = mapped_column(String(16), nullable=True)
    goal_id:     Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Если True — заявка на вступление принимается автоматически, без ручного одобрения
    open_join:   Mapped[bool] = mapped_column(Boolean, default=False)


class LabMember(Base):
    __tablename__ = "lab_members"
    lab_id:  Mapped[int] = mapped_column(ForeignKey("labs.id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    # "owner" | "admin" | "member"
    role:    Mapped[str] = mapped_column(String(32), default="member")
    # PK уже (lab_id, user_id) — отдельный UniqueConstraint избыточен, в реальной
    # БД никогда не создавался (autogenerate его добавлял как "новый")


class LabJoinRequest(Base, TimestampMixin):
    """Заявка на вступление в закрытую или публичную лабу — владелец/админ принимает
    или отклоняет (с указанием причины) во вкладке «Заявки»."""
    __tablename__ = "lab_join_requests"
    id:             Mapped[int]        = mapped_column(primary_key=True)
    lab_id:         Mapped[int]        = mapped_column(ForeignKey("labs.id", ondelete="CASCADE"), index=True)
    user_id:        Mapped[int]        = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    message:        Mapped[str]        = mapped_column(Text, default="")
    status:         Mapped[str]        = mapped_column(String(16), default="pending")  # pending|accepted|declined
    decline_reason: Mapped[str]        = mapped_column(Text, default="")
    __table_args__ = (UniqueConstraint("lab_id", "user_id", name="uq_lab_join_request"),)


class HypothesisPost(Base, TimestampMixin):
    __tablename__ = "hypothesis_posts"
    id:            Mapped[int] = mapped_column(primary_key=True)
    hypothesis_id: Mapped[int] = mapped_column(ForeignKey("hypotheses.id", ondelete="CASCADE"), index=True)
    author_id:     Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title:         Mapped[str] = mapped_column(String(255), default="")
    content:       Mapped[str] = mapped_column(Text)


class PostComment(Base, TimestampMixin):
    __tablename__ = "post_comments"
    id:        Mapped[int] = mapped_column(primary_key=True)
    post_id:   Mapped[int] = mapped_column(ForeignKey("hypothesis_posts.id", ondelete="CASCADE"), index=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    content:   Mapped[str] = mapped_column(Text)


class Follow(Base):
    __tablename__ = "follows"
    follower_id:  Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    following_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    # PK уже (follower_id, following_id) — отдельный UniqueConstraint избыточен, в реальной
    # БД никогда не создавался (autogenerate его добавлял как "новый")


class ObservationPost(Base, TimestampMixin):
    __tablename__ = "observation_posts"
    id:             Mapped[int] = mapped_column(primary_key=True)
    observation_id: Mapped[int] = mapped_column(ForeignKey("observations.id", ondelete="CASCADE"), index=True)
    author_id:      Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title:          Mapped[str] = mapped_column(String(255), default="")
    content:        Mapped[str] = mapped_column(Text)

    __table_args__ = (Index("idx_observation_posts_created_at", sa_text("created_at DESC")),)


class EntityComment(Base, TimestampMixin):
    __tablename__ = "entity_comments"
    id:          Mapped[int] = mapped_column(primary_key=True)
    entity_type: Mapped[str] = mapped_column(String(32), index=True)  # observation|hypothesis|prediction|question|task
    entity_id:   Mapped[int] = mapped_column(index=True)
    author_id:   Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    content:     Mapped[str] = mapped_column(Text)
    parent_id:   Mapped[int | None] = mapped_column(ForeignKey("entity_comments.id", ondelete="CASCADE"), nullable=True, index=True)
    # позиция в дискуссии: confirm|neutral|refute. Null — для старых комментариев и для CommentsPanel (позже удалён)
    # (личные заметки к своим записям), где позиция не имеет смысла.
    stance:      Mapped[str | None] = mapped_column(String(16), nullable=True)
    # Маркер происхождения — например 'reflection_followup' для личных
    # выводов из фичи рефлексии (см. reflection_insight_panel.tsx). Null для
    # обычных заметок/комментариев. Нужен, чтобы отличать их для агрегации
    # в "паттернах мышления", не смешивая с произвольными заметками.
    source:      Mapped[str | None] = mapped_column(String(32), nullable=True)

    __table_args__ = (Index("idx_entity_comments_created_at", sa_text("created_at DESC")),)


class UserCommentSeen(Base):
    __tablename__ = "user_comment_seen"
    id:          Mapped[int] = mapped_column(primary_key=True)
    user_id:     Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    entity_type: Mapped[str] = mapped_column(String(32))
    entity_id:   Mapped[int] = mapped_column()
    seen_at:     Mapped[datetime] = mapped_column(default=datetime.utcnow)


class Conversation(Base, TimestampMixin):
    """Личный диалог между двумя пользователями."""
    __tablename__ = "conversations"
    id:            Mapped[int] = mapped_column(primary_key=True)
    user_a_id:     Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    user_b_id:     Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    last_message_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, index=True)
    __table_args__ = (UniqueConstraint("user_a_id", "user_b_id"),)


class Message(Base, TimestampMixin):
    __tablename__ = "messages"
    id:              Mapped[int]  = mapped_column(primary_key=True)
    conversation_id: Mapped[int]  = mapped_column(ForeignKey("conversations.id", ondelete="CASCADE"), index=True)
    author_id:       Mapped[int]  = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    content:         Mapped[str]  = mapped_column(EncryptedText)
    read:            Mapped[bool] = mapped_column(Boolean, default=False)

    __table_args__ = (Index("idx_messages_created_at", sa_text("created_at DESC")),)


class Repost(Base, TimestampMixin):
    """Репост записи — полноценная независимая копия с комментарием поверх (как в ЖЖ)."""
    __tablename__ = "reposts"
    id:               Mapped[int]        = mapped_column(primary_key=True)
    user_id:          Mapped[int]        = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    comment:          Mapped[str]        = mapped_column(Text, default="")
    source_type:      Mapped[str]        = mapped_column(String(32))
    source_id:        Mapped[int]        = mapped_column(Integer)
    source_author_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    new_type:         Mapped[str]        = mapped_column(String(32))
    new_id:           Mapped[int]        = mapped_column(Integer)
    target:           Mapped[str]        = mapped_column(String(16), default="personal")  # personal|lab
    lab_id:           Mapped[int | None] = mapped_column(ForeignKey("labs.id", ondelete="SET NULL"), nullable=True, index=True)

    __table_args__ = (Index("idx_reposts_created_at", sa_text("created_at DESC")),)
