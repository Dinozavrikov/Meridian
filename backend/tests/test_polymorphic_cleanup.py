"""PR A — устранение сиротства полиморфных дочерних таблиц при hard delete
любой из 6 ENTITY_MODELS сущностей (see entity_registry.py::POLYMORPHIC_CHILD_MODELS
и event_log.py::_capture_event_log, ветка cascade-cleanup внутри tracked_deleted).
Найденный баг: EntityTag не чистился для prediction/task; EntityComment/
EntityImage/EntityAttachment/SourceDocument/EntityEmbedding/UserCommentSeen/Link
не чистились вообще ни для одного из 6 типов."""
import pytest
from sqlalchemy import select

from app.db.session import AsyncSessionLocal
from app.models.entities import (
    Observation, Prediction, Tag, EntityTag, EntityImage, EntityAttachment,
    SourceDocument, EntityEmbedding, Link, EntityStage,
)
from app.models.social import EntityComment, UserCommentSeen
from app.schemas.entities import TaskCreate
from app.api.v1.tasks import create_task


async def _count(db, model, **where):
    q = select(model)
    for k, v in where.items():
        q = q.where(getattr(model, k) == v)
    return len((await db.execute(q)).scalars().all())


@pytest.mark.asyncio
async def test_delete_observation_cleans_all_polymorphic_children_and_links(test_user):
    async with AsyncSessionLocal() as db:
        obs = Observation(
            user_id=test_user.id, date="2026-09-22", author="t", title="t",
            text="текст", status="осмысленное", importance=0,
            visibility="private", lab_id=None,
        )
        db.add(obs)
        await db.commit()
        await db.refresh(obs)
        oid = obs.id

        tag = Tag(user_id=test_user.id, name="физика")
        db.add(tag)
        await db.commit()
        await db.refresh(tag)

        db.add_all([
            EntityTag(entity_type="observation", entity_id=oid, tag_id=tag.id),
            EntityComment(entity_type="observation", entity_id=oid, author_id=test_user.id, content="комментарий"),
            UserCommentSeen(user_id=test_user.id, entity_type="observation", entity_id=oid),
            EntityImage(user_id=test_user.id, entity_type="observation", entity_id=oid,
                        filename="a.png", thumb_filename="a_thumb.png", width=10, height=10, size_bytes=100),
            EntityAttachment(user_id=test_user.id, entity_type="observation", entity_id=oid,
                              kind="code", filename="a.py", storage_path="uuid1.py",
                              mime_type="text/x-python", size_bytes=10),
            SourceDocument(user_id=test_user.id, entity_type="observation", entity_id=oid, url="https://example.com/src"),
            EntityEmbedding(user_id=test_user.id, entity_type="observation", entity_id=oid,
                             text_snapshot="текст", embedding=[0.1] * 1024, embedding_model="model-test"),
            EntityStage(user_id=test_user.id, entity_type="observation", entity_id=oid, current_stage="question"),
            # обе стороны Link — сущность и как from, и как to
            Link(user_id=test_user.id, from_type="observation", from_id=oid, to_type="hypothesis", to_id=999001),
            Link(user_id=test_user.id, from_type="hypothesis", from_id=999002, to_type="observation", to_id=oid),
        ])
        await db.commit()

        await db.delete(obs)
        await db.commit()

        assert await _count(db, EntityTag, entity_type="observation", entity_id=oid) == 0
        assert await _count(db, EntityComment, entity_type="observation", entity_id=oid) == 0
        assert await _count(db, UserCommentSeen, entity_type="observation", entity_id=oid) == 0
        assert await _count(db, EntityImage, entity_type="observation", entity_id=oid) == 0
        assert await _count(db, EntityAttachment, entity_type="observation", entity_id=oid) == 0
        assert await _count(db, SourceDocument, entity_type="observation", entity_id=oid) == 0
        assert await _count(db, EntityEmbedding, entity_type="observation", entity_id=oid) == 0
        assert await _count(db, EntityStage, entity_type="observation", entity_id=oid) == 0
        assert await _count(db, Link, from_type="observation", from_id=oid) == 0
        assert await _count(db, Link, to_type="observation", to_id=oid) == 0


@pytest.mark.asyncio
async def test_delete_prediction_regression_cleans_entity_tag(test_user):
    """Регресс на подтверждённый исходный баг — до фикса EntityTag не
    чистился для prediction. Этот тест падал бы на старом коде."""
    async with AsyncSessionLocal() as db:
        from datetime import datetime, timezone
        pred = Prediction(
            user_id=test_user.id, title="p", slug="p-cleanup-test", text="x",
            date_created="2026-09-22",
            expected_check_date=datetime(2026, 12, 1, tzinfo=timezone.utc),
            visibility="private", lab_id=None,
        )
        db.add(pred)
        await db.commit()
        await db.refresh(pred)
        pid = pred.id

        tag = Tag(user_id=test_user.id, name="прогноз-тег")
        db.add(tag)
        await db.commit()
        await db.refresh(tag)
        db.add(EntityTag(entity_type="prediction", entity_id=pid, tag_id=tag.id))
        await db.commit()

        await db.delete(pred)
        await db.commit()

        assert await _count(db, EntityTag, entity_type="prediction", entity_id=pid) == 0


@pytest.mark.asyncio
async def test_delete_task_regression_cleans_entity_tag(test_user):
    """Тот же регресс, что выше, для task — второй подтверждённый случай бага."""
    async with AsyncSessionLocal() as db:
        db.sync_session.info["actor_id"] = test_user.id
        body = TaskCreate(name="t", description="d", status="открыта", progress=0, visibility="private")
        out = await create_task(body, test_user, db)
        tid = out.id

        tag = Tag(user_id=test_user.id, name="задача-тег")
        db.add(tag)
        await db.commit()
        await db.refresh(tag)
        db.add(EntityTag(entity_type="task", entity_id=tid, tag_id=tag.id))
        await db.commit()

        from app.models.entities import ResearchTask
        task = await db.get(ResearchTask, tid)
        await db.delete(task)
        await db.commit()

        assert await _count(db, EntityTag, entity_type="task", entity_id=tid) == 0


@pytest.mark.asyncio
async def test_delete_does_not_touch_other_entities_children(test_user):
    """WHERE должен фильтровать по entity_id, не только entity_type — удаление
    одной Observation не должно задеть дочерние записи другой."""
    async with AsyncSessionLocal() as db:
        obs_a = Observation(
            user_id=test_user.id, date="2026-09-22", author="t", title="a", slug="cleanup-obs-a",
            text="a", status="осмысленное", importance=0, visibility="private", lab_id=None,
        )
        obs_b = Observation(
            user_id=test_user.id, date="2026-09-22", author="t", title="b", slug="cleanup-obs-b",
            text="b", status="осмысленное", importance=0, visibility="private", lab_id=None,
        )
        db.add_all([obs_a, obs_b])
        await db.commit()
        await db.refresh(obs_a)
        await db.refresh(obs_b)

        tag = Tag(user_id=test_user.id, name="общий-тег")
        db.add(tag)
        await db.commit()
        await db.refresh(tag)

        db.add_all([
            EntityTag(entity_type="observation", entity_id=obs_a.id, tag_id=tag.id),
            EntityTag(entity_type="observation", entity_id=obs_b.id, tag_id=tag.id),
        ])
        await db.commit()

        await db.delete(obs_a)
        await db.commit()

        assert await _count(db, EntityTag, entity_type="observation", entity_id=obs_a.id) == 0
        assert await _count(db, EntityTag, entity_type="observation", entity_id=obs_b.id) == 1
