"""get_related: рёбра подгружаются слоями обхода, а не все связи платформы разом.
ОХРАННЫЕ (зелёные и до патча): глубина, ребро FK прогноз -> гипотеза и конкурирующая задача на втором слое.
КРАСНЫЙ на старом коде: запросы к links параметризованы узлами слоя."""
import contextlib

import pytest
from sqlalchemy import event

from app.db.session import AsyncSessionLocal, engine
from app.models.entities import EntityHypothesis, Link
from tests.conftest import create_test_user
from tests.test_calibration_residue import _mk
from tests.test_lab_signal import _login
from tests.test_link_effect import _hyp, _link, _obs, _pred


async def _related(client, t, i):
    r = await client.get(f"/api/v1/graph/related/{t}/{i}")
    assert r.status_code == 200, r.text
    return r.json()["related"]


@pytest.mark.asyncio
async def test_chain_depth_five_reached_sixth_not(client):
    u = await create_test_user("rl_a")
    root = await _mk("hypothesis", u.id, "rl-root")
    obs = [await _mk("observation", u.id, f"rl-o{i}") for i in range(1, 7)]
    async with AsyncSessionLocal() as db:
        db.add(Link(user_id=u.id, from_type="observation", from_id=obs[0], to_type="hypothesis", to_id=root, link_type="связано"))
        db.add_all([Link(user_id=u.id, from_type="observation", from_id=a, to_type="observation", to_id=b, link_type="связано")
                    for a, b in zip(obs, obs[1:])])
        await db.commit()
    await _login(client, u.username)
    got = {i["id"] for i in (await _related(client, "hypothesis", root)).get("observation", [])}
    assert got == set(obs[:5])


@pytest.mark.asyncio
async def test_prediction_reached_through_hypothesis_on_second_layer(client):
    await create_test_user("rl_b"); await _login(client, "rl_b")
    h = await _hyp(client)
    p = await _pred(client, h)
    o = await _obs(client, 5)
    await _link(client, "observation", o, "hypothesis", h, "подтверждает")
    rel = await _related(client, "observation", o)
    assert [i["id"] for i in rel["hypothesis"]] == [h]
    pred = [i for i in rel["prediction"] if i["id"] == p]
    assert len(pred) == 1 and pred[0]["parent_id"] == h and pred[0]["direct"] is False


@pytest.mark.asyncio
async def test_competing_task_reached_through_hypothesis_on_second_layer(client):
    u = await create_test_user("rl_c"); await _login(client, u.username)
    h = await _hyp(client)
    o = await _obs(client, 5)
    await _link(client, "observation", o, "hypothesis", h, "подтверждает")
    t = await _mk("task", u.id, "rl-t")
    async with AsyncSessionLocal() as db:
        db.add(EntityHypothesis(parent_type="task", parent_id=t, hypothesis_id=h, role="alternative"))
        await db.commit()
    rel = await _related(client, "observation", o)
    task = [i for i in rel.get("task", []) if i["id"] == t]
    assert len(task) == 1 and task[0]["parent_id"] == h and task[0]["source"] == "competing"


@contextlib.contextmanager
def _statements():
    box = []
    eng = getattr(engine, "sync_engine", engine)

    def cb(conn, cursor, statement, parameters, context, executemany):
        box.append((statement, parameters))
    event.listen(eng, "before_cursor_execute", cb)
    try:
        yield box
    finally:
        event.remove(eng, "before_cursor_execute", cb)


def _ints(parameters):
    vals = parameters.values() if isinstance(parameters, dict) else (parameters or ())
    return {v for v in vals if isinstance(v, int) and not isinstance(v, bool)}


@pytest.mark.asyncio
async def test_link_queries_are_parametrized_by_layer_nodes(client):
    u = await create_test_user("rl_d"); noise_u = await create_test_user("rl_n")
    root = await _mk("hypothesis", u.id, "rl-d-root")
    mine = await _mk("observation", u.id, "rl-d-o")
    noise = [await _mk("observation", noise_u.id, f"rl-n{i}") for i in range(20)]
    async with AsyncSessionLocal() as db:
        db.add(Link(user_id=u.id, from_type="observation", from_id=mine, to_type="hypothesis", to_id=root, link_type="связано"))
        db.add_all([Link(user_id=noise_u.id, from_type="observation", from_id=a, to_type="observation", to_id=b, link_type="связано")
                    for a, b in zip(noise, noise[1:])])
        await db.commit()
    await _login(client, u.username)
    with _statements() as box:
        rel = await _related(client, "hypothesis", root)
    assert [i["id"] for i in rel["observation"]] == [mine]
    sel = [p for s, p in box if s.lstrip().startswith(f"SELECT {Link.__tablename__}.")]
    assert sel, "запросов к links не видно"
    for p in sel:
        assert _ints(p) & {root, mine}, f"запрос к links без узлов слоя: {p}"
