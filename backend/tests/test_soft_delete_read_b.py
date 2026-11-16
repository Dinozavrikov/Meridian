"""Soft-delete, фаза 3b: связи (links_alive), эмбеддинги,
конкурирующие гипотезы, ожидания задач, найденные ответы на вопросы."""
import pytest
from datetime import datetime, timedelta, timezone
from sqlalchemy import select

from app.core.lab_access import links_alive
from app.db.session import AsyncSessionLocal
from app.models.entities import (
    EntityEmbedding, EntityHypothesis, Link, QuestionAnswerFeedback, TaskExpectation,
)
from app.services.embeddings import (
    current_embedding_model, similar_candidates, similar_open_questions, vectors_for,
)
from tests.conftest import create_test_user
from tests.test_soft_delete_api import _build, _delete_url, _login, _make


def _base(etype):
    return _delete_url(etype, 0).rsplit("/", 1)[0]


@pytest.mark.asyncio
async def test_links_alive_hides_links_with_trashed_endpoint(test_user):
    async with AsyncSessionLocal() as db:
        live = _build("observation", test_user.id, "b3-l-live", False, 0)
        dead = _build("observation", test_user.id, "b3-l-dead", True, 1)
        db.add_all([live, dead])
        await db.commit()
        await db.refresh(live)
        await db.refresh(dead)
        db.add_all([
            Link(user_id=test_user.id, from_type="observation", from_id=live.id, to_type="hypothesis", to_id=999101),
            Link(user_id=test_user.id, from_type="observation", from_id=dead.id, to_type="hypothesis", to_id=999102),
            Link(user_id=test_user.id, from_type="hypothesis", from_id=999103, to_type="observation", to_id=dead.id),
        ])
        await db.commit()
        rows = (await db.execute(select(Link.to_id).where(links_alive()))).scalars().all()
        assert rows == [999101]


@pytest.mark.asyncio
async def test_task_graph_drops_trashed_observation_and_its_edge(client):
    u = await create_test_user("b3_graph")
    tid = await _make("task", u.id)
    hid = await _make("hypothesis", u.id)
    oid = await _make("observation", u.id)
    async with AsyncSessionLocal() as db:
        db.add_all([
            EntityHypothesis(parent_type="task", parent_id=tid, hypothesis_id=hid),
            Link(user_id=u.id, from_type="observation", from_id=oid, to_type="hypothesis", to_id=hid),
        ])
        await db.commit()
    await _login(client, u.username)
    url = f"{_delete_url('task', tid)}/graph"

    async def state():
        g = (await client.get(url)).json()
        node = any(n["type"] == "observation" and n["entity_id"] == oid for n in g["nodes"])
        edge = any(f"o_{oid}" in (e["from"], e["to"]) for e in g["edges"])
        return node, edge

    assert await state() == (True, True)
    assert (await client.delete(_delete_url("observation", oid))).status_code == 204
    assert await state() == (False, False)
    assert (await client.post(f"/api/v1/observation/{oid}/restore")).status_code == 204
    assert await state() == (True, True)


@pytest.mark.asyncio
async def test_embedding_reads_skip_trashed_parents(test_user):
    model = current_embedding_model()
    alive = await _make("observation", test_user.id, suffix="-emb-a")
    dead = await _make("observation", test_user.id, dead=True, suffix="-emb-d")
    q_alive = await _make("question", test_user.id, suffix="-emb-a")
    q_dead = await _make("question", test_user.id, dead=True, suffix="-emb-d")
    vec = [0.1] * 1024
    async with AsyncSessionLocal() as db:
        for et, eid in (("observation", alive), ("observation", dead), ("question", q_alive), ("question", q_dead)):
            db.add(EntityEmbedding(user_id=test_user.id, entity_type=et, entity_id=eid, text_snapshot="t",
                                   embedding=vec, embedding_model=model))
        await db.commit()
        got = await similar_candidates(db, test_user.id, vec, limit=20)
        assert {(e.entity_type, e.entity_id) for e in got} == {("observation", alive), ("question", q_alive)}
        assert set(await vectors_for(db, "observation", [alive, dead])) == {alive}
        oq = await similar_open_questions(db, test_user.id, vec, limit=10)
        assert {e.entity_id for e in oq} == {q_alive}


@pytest.mark.asyncio
async def test_question_hypotheses_and_competition_hide_trashed_hypothesis(client):
    u = await create_test_user("b3_qh")
    qid = await _make("question", u.id)
    hid = await _make("hypothesis", u.id)
    async with AsyncSessionLocal() as db:
        db.add(EntityHypothesis(parent_type="question", parent_id=qid, hypothesis_id=hid))
        await db.commit()
    await _login(client, u.username)
    base = _delete_url("question", qid)

    async def ids():
        r = await client.get(f"{base}/hypotheses")
        assert r.status_code == 200, r.text
        return [h["id"] for h in r.json()]

    assert await ids() == [hid]
    assert (await client.delete(_delete_url("hypothesis", hid))).status_code == 204
    assert await ids() == []
    rc = await client.get(f"{base}/competition")
    assert rc.status_code == 200, rc.text
    assert "T-p2-hypothesis" not in rc.text
    assert (await client.post(f"/api/v1/hypothesis/{hid}/restore")).status_code == 204
    assert await ids() == [hid]


@pytest.mark.asyncio
async def test_answer_feedback_hides_trashed_question_or_source(client):
    u = await create_test_user("b3_fb")
    qid = await _make("question", u.id)
    oid = await _make("observation", u.id)
    async with AsyncSessionLocal() as db:
        fb = QuestionAnswerFeedback(user_id=u.id, question_id=qid, source_entity_type="observation",
                                    source_entity_id=oid, matched_quote="цитата", confidence=80)
        db.add(fb)
        await db.commit()
        await db.refresh(fb)
        fid = fb.id
    await _login(client, u.username)
    pending = f"{_base('question')}/answer-feedback/pending"

    async def ids():
        r = await client.get(pending)
        assert r.status_code == 200, r.text
        return [x["feedback_id"] for x in r.json()]

    assert await ids() == [fid]
    assert (await client.delete(_delete_url("question", qid))).status_code == 204
    assert await ids() == []
    r = await client.post(f"{_base('question')}/answer-feedback/{fid}/verdict", json={"verdict": "rejected"})
    assert r.status_code == 404
    assert (await client.post(f"/api/v1/question/{qid}/restore")).status_code == 204
    assert await ids() == [fid]
    assert (await client.delete(_delete_url("observation", oid))).status_code == 204
    assert await ids() == []
    assert (await client.post(f"/api/v1/observation/{oid}/restore")).status_code == 204
    assert await ids() == [fid]


@pytest.mark.asyncio
async def test_pending_task_expectations_hide_trashed_task(client):
    u = await create_test_user("b3_exp")
    tid = await _make("task", u.id)
    async with AsyncSessionLocal() as db:
        e = TaskExpectation(task_id=tid, user_id=u.id, expectation_confidence=70, expectation_text="ожидаю",
                            check_at=datetime.now(timezone.utc) - timedelta(days=1), status="pending")
        db.add(e)
        await db.commit()
        await db.refresh(e)
        eid = e.id
    await _login(client, u.username)
    url = f"{_base('task')}/expectations/pending"

    async def ids():
        r = await client.get(url)
        assert r.status_code == 200, r.text
        return [x["id"] for x in r.json()]

    assert await ids() == [eid]
    assert (await client.delete(_delete_url("task", tid))).status_code == 204
    assert await ids() == []
    assert (await client.post(f"/api/v1/task/{tid}/restore")).status_code == 204
    assert await ids() == [eid]
