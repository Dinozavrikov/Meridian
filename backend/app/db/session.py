from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import Session
from sqlalchemy.pool import NullPool
from app.core.config import settings

# NullPool в тестах — engine пересоздаётся между тестами не так уж редко
# (session-scoped event loop), а обычный QueuePool держит соединения между
# вызовами и может пережить loop, в котором были открыты — "attached to a
# different loop". Прод/дев продолжают жить на обычном пуле.
if settings.ENVIRONMENT == "test":
    engine = create_async_engine(settings.DATABASE_URL, echo=False, poolclass=NullPool)
else:
    engine = create_async_engine(
        settings.DATABASE_URL,
        echo=settings.ENVIRONMENT == "development",
        pool_size=20,
        max_overflow=40,
    )

class AppSession(Session):
    """Выделенный подкласс Session — единственный, на котором висит
    before_flush-listener event-log'а (см. app/services/event_log.py).
    НЕ регистрируем listener на голом sqlalchemy.orm.Session — это бы
    неявно затронуло любой будущий код в процессе, который создаст свою
    Session (одноразовый скрипт, admin-утилита), даже без всякого
    намерения писать в events. Explicit opt-in через sync_session_class
    ниже — только AsyncSessionLocal (и всё, что через него работает,
    включая services/prediction_reminders.py) участвует в audit-log."""
    pass


AsyncSessionLocal = async_sessionmaker(
    engine, class_=AsyncSession, sync_session_class=AppSession, expire_on_commit=False
)


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


# Регистрация before_flush-listener'а event-log'а (app/services/event_log.py)
# ЗДЕСЬ, а не в main.py — декоратор @event.listens_for выполняется как side
# effect импорта модуля. Если импортировать event_log только из main.py,
# любой код, создающий AsyncSessionLocal() в обход цепочки импортов от
# app.main (management-скрипт, будущий фоновый воркер вне FastAPI-процесса,
# тестовый скрипт), молча не получит listener — без единой ошибки, событие
# просто не запишется. Импорт здесь, сразу после определения AppSession/
# AsyncSessionLocal, гарантирует регистрацию везде, где вообще используется
# эта фабрика сессий. Циклический импорт (event_log.py делает
# `from app.db.session import AppSession`) безопасен: к моменту этой строки
# AppSession уже полностью определён в этом модуле.
from app.services import event_log  # noqa: E402,F401
from app.services import mention_sync  # noqa: E402,F401  (упоминания в тексте)
