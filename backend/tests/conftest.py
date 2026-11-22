import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy import text
from app.main import app
from app.db.session import get_db, AsyncSessionLocal, engine


def assert_safe_test_db(url) -> None:
    """TRUNCATE в _clean_db стирает ВСЕ таблицы. Разрешено только отдельной тестовой БД:
    хост postgres-test и имя, оканчивающееся на _test. Иначе прогон падает до очистки."""
    import pytest as _pytest
    host, db = url.host, (url.database or "")
    if host != "postgres-test" or not db.endswith("_test"):
        _pytest.exit(
            f"ОТКАЗ: тесты смотрят на {host}/{db}, а не на postgres-test/*_test. "
            "Запускай через backend-test: docker compose exec backend-test python3 -m pytest ...",
            returncode=2,
        )


@pytest_asyncio.fixture(autouse=True)
async def _clean_db():
    """Очистка перед каждым тестом — TRUNCATE, не rollback: тесты работают
    с реальными закоммиченными транзакциями (см. db_session/client ниже),
    поэтому откат через SAVEPOINT здесь не годится. Безопасно только потому,
    что DATABASE_URL в контейнере backend-test указывает на отдельную БД
    meridian_test — НЕ трогать эту фикстуру, если engine когда-нибудь
    случайно окажется смотрящим на дев/прод базу."""
    assert_safe_test_db(engine.url)
    async with engine.begin() as conn:
        tables = (await conn.execute(text(
            "SELECT tablename FROM pg_tables WHERE schemaname = 'public' "
            "AND tablename != 'alembic_version'"
        ))).scalars().all()
        if tables:
            await conn.execute(text(
                f"TRUNCATE TABLE {', '.join(tables)} RESTART IDENTITY CASCADE"
            ))
    yield


# _no_real_ai_calls (мокинг AI-вызовов) убрана 19.09 — Mistral полностью
# выпилен из ai.py, единственный провайдер теперь локальный Ollama. Алексей
# сознательно выбрал НЕ мокать: тесты бьют в реальную Ollama через
# host.docker.internal (см. OLLAMA_URL/OLLAMA_EMBED_URL в docker-compose.yml,
# backend-test service) — медленнее, чем мок, но проверяет реальную
# интеграцию, а не воображаемое поведение. Если локальная Ollama недоступна
# в момент прогона тестов — AI-функции корректно деградируют (None/[],
# все спроектированы best-effort, см. их докстринги в ai.py), тесты не
# должны падать из-за этого, только медленнее отработать (таймауты).


@pytest_asyncio.fixture(autouse=True)
async def _seed_system_user(_clean_db):
    """_clean_db выше TRUNCATE'ит users вместе со всем остальным — system-
    пользователь (см. миграцию a1b2c3d4e5f6, app/core/entity_registry.py),
    нужный ORM-driven event-log listener'у (before_flush, app/services/
    event_log.py) как fallback-actor для действий без HTTP-контекста,
    вымывается перед КАЖДЫМ тестом. Явная зависимость от _clean_db в
    аргументах фикстуры — гарантирует порядок (досеиваем ПОСЛЕ очистки,
    не до), не полагаясь на порядок autouse-фикстур в файле."""
    async with AsyncSessionLocal() as session:
        from app.models.user import User
        session.add(User(
            username="system", email="system@meridian.internal",
            password_hash=None, google_id=None, display_name="Meridian System",
            bio="Технический аккаунт", is_active=True, is_verified=True,
            onboarding_completed=True, onboarding_step=0, default_visibility="private",
        ))
        await session.commit()
    # Кэш id системного пользователя (event_log.py::_sync_system_user_id_cache,
    # entity_registry.py::_system_user_id_cache) живёт в памяти процесса между
    # тестами — TRUNCATE ... RESTART IDENTITY сбрасывает sequence, id обычно
    # снова 1, но полагаться на конкретное число нельзя. Сбрасываем оба кэша
    # явно на каждый тест, иначе старый закэшированный id может пережить
    # TRUNCATE и незаметно указывать не туда.
    import app.services.event_log as _el
    import app.core.entity_registry as _er
    _el._sync_system_user_id_cache = None
    _er._system_user_id_cache = None
    yield


@pytest_asyncio.fixture
async def db_session():
    """Сессия для тестового сетапа (создание test_user и т.п.) — коммитит
    по-настоящему, отдельно от того, что дальше делает HTTP-клиент."""
    async with AsyncSessionLocal() as session:
        yield session


@pytest_asyncio.fixture
async def client():
    """get_db() внутри тестов ведёт себя так же, как в проде — новая сессия
    на каждый запрос, а не одна расшаренная между сетапом теста и ASGI-стеком
    httpx. Это и убирает 'another operation is in progress': раньше сетап-код
    и конкурентные HTTP-запросы боролись за один и тот же asyncpg-connection."""
    async def override_get_db():
        async with AsyncSessionLocal() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test", follow_redirects=False) as c:
        yield c

    app.dependency_overrides.pop(get_db, None)


async def create_test_user(username: str, password: str = "pass12345"):
    """Общий helper для тестов, комбинирующих HTTP-запросы (client) с прямым
    созданием пользователя в БД — раньше был продублирован байт-в-байт в 18
    тестовых файлах как локальная _make_user(db_session, ...). Открывает и
    закрывает СВОЮ AsyncSessionLocal(), не принимает расшаренную db_session:
    долгоживущая db_session-сессия, используемая вперемешку с client-запросами
    в одном тесте, ловит SQLAlchemy "Task ... attached to a different loop"
    на teardown (найдено и разобрано 19.09 — pytest-asyncio закрывает
    фикстуры в порядке, который не гарантирует, что db_session и client не
    столкнутся на одном loop при долгом времени жизни сессии). Открыть-
    использовать-закрыть на каждый вызов устраняет проблему полностью,
    подтверждено на chередующемся сценарии (create → client-запросы →
    create → client-запросы)."""
    from app.models.user import User
    from app.core.security import hash_password
    async with AsyncSessionLocal() as db:
        user = User(username=username, email=f"{username}@example.com",
                    password_hash=hash_password(password), display_name=username)
        db.add(user)
        await db.commit()
        await db.refresh(user)
        db.expunge(user)  # отвязываем от сессии перед её закрытием — иначе
        # доступ к атрибутам user после закрытия сессии кинет
        # DetachedInstanceError на любой не загруженной колонке.
        return user


async def add_lab_member(lab_id: int, user_id: int, role: str = "member"):
    """Тот же принцип, что create_test_user — своя сессия, не расшаренная
    db_session. Раньше дублировалась как _add_member в 13 тестовых файлах."""
    from app.models.social import LabMember
    async with AsyncSessionLocal() as db:
        db.add(LabMember(lab_id=lab_id, user_id=user_id, role=role))
        await db.commit()


@pytest_asyncio.fixture
async def test_user(db_session):
    from app.models.user import User
    from app.core.security import hash_password

    user = User(
        username="testuser",
        email="test@example.com",
        password_hash=hash_password("testpass123"),
        display_name="Test User",
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    yield user


@pytest_asyncio.fixture(autouse=True)
async def _clear_rate_limits():
    """Свежий пул соединений Redis на каждый тест и пустые счетчики ограничения частоты.

    Глобальный клиент приложения держит соединения, привязанные к циклу событий того теста, где они созданы;
    цикл закрывается вместе с тестом, и следующий тест получил бы соединение с чужим закрытым циклом
    (RuntimeError, а в лимитере молчаливый пропуск запроса). Старый пул не закрываем: его транспорты
    принадлежат мертвому циклу, закрытие дало бы ту же ошибку. Счетчики rl:* чистим, иначе сотни входов
    с одного адреса за прогон набора упирались бы в лимит."""
    from redis.asyncio import ConnectionPool
    from app.core.config import settings
    from app.db.redis import redis_client
    pool = ConnectionPool.from_url(settings.REDIS_URL, decode_responses=True)
    redis_client.connection_pool = pool
    try:
        keys = [k async for k in redis_client.scan_iter("rl:*")]
        if keys:
            await redis_client.delete(*keys)
    except Exception:
        pass
    yield
    try:
        await pool.disconnect()
    except Exception:
        pass
