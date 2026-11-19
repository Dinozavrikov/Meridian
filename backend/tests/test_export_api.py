"""Экспорт данных: задачи, связи, теги, привязки тегов и шкалы входят в выгрузку, чужое не входит."""
import uuid
from datetime import datetime, timezone

import pytest

from app.core.deps import get_current_user
from app.db.session import AsyncSessionLocal
from app.main import app
from tests.route_utils import iter_api_routes
from app.models.entities import EntityTag, Link, ResearchTask, ScaleDef, ScaleValue, Tag
from tests.conftest import create_test_user

pytestmark = pytest.mark.asyncio

EXPECTED_KEYS = {"exported_at", "user", "hypotheses", "observations", "predictions", "worldview", "questions",
                 "tasks", "links", "tags", "entity_tags", "scale_defs", "scale_values"}


def _export_path() -> str:
    return next(r.path for r in iter_api_routes() if getattr(r, "path", "").endswith("/me/export"))


async def _seed(user_id: int, tag: str):
    async with AsyncSessionLocal() as db:
        task = ResearchTask(user_id=user_id, name=f"task-{tag}", slug=f"t-{tag}")
        dead = ResearchTask(user_id=user_id, name=f"dead-{tag}", slug=f"d-{tag}", deleted_at=datetime.now(timezone.utc))
        t = Tag(user_id=user_id, name=f"tag-{tag}")
        db.add_all([task, dead, t])
        await db.flush()
        db.add(EntityTag(entity_type="task", entity_id=task.id, tag_id=t.id))
        db.add(Link(user_id=user_id, from_type="task", from_id=task.id, to_type="task", to_id=dead.id, link_type="related"))
        db.add(ScaleDef(user_id=user_id, name=f"scale-{tag}", entity_type="hypothesis"))
        db.add(ScaleValue(user_id=user_id, entity_type="task", entity_id=task.id, scale_id="maturity", value=3.0))
        await db.commit()
        return task.id, dead.id


async def _export_as(client, user):
    app.dependency_overrides[get_current_user] = lambda: user
    try:
        return await client.get(_export_path())
    finally:
        app.dependency_overrides.pop(get_current_user, None)


async def test_export_contains_all_kinds_and_only_own_rows(client):
    tag = uuid.uuid4().hex[:8]
    user = await create_test_user(f"exp_{tag}")
    other = await create_test_user(f"exo_{tag}")
    task_id, dead_id = await _seed(user.id, tag)
    await _seed(other.id, f"x{tag}")

    r = await _export_as(client, user)
    assert r.status_code == 200
    body = r.json()
    assert set(body) == EXPECTED_KEYS

    names = {t["name"] for t in body["tasks"]}
    assert names == {f"task-{tag}", f"dead-{tag}"}                      # чужих задач нет
    dead = next(t for t in body["tasks"] if t["name"] == f"dead-{tag}")
    assert dead["deleted_at"] is not None                                 # запись из корзины тоже выгружается
    assert [(l["from_id"], l["to_id"]) for l in body["links"]] == [(task_id, dead_id)]
    assert [t["name"] for t in body["tags"]] == [f"tag-{tag}"]
    assert [(e["entity_type"], e["entity_id"]) for e in body["entity_tags"]] == [("task", task_id)]
    assert [s["name"] for s in body["scale_defs"]] == [f"scale-{tag}"]
    assert [(v["scale_id"], v["value"]) for v in body["scale_values"]] == [("maturity", 3.0)]   # чужих значений нет
