"""
Регрессионные тесты на read-path видимость графа лабы (Этап 5 спецификации
Laboratories). Write-path (нельзя ПРИВЯЗАТЬ сущность к чужой лабе без
членства) уже покрыт test_lab_attach_membership.py — эти тесты проверяют
обратное: нельзя УВИДЕТЬ узлы приватной лабы через граф, даже зная entity_id
напрямую, если не состоишь в лабе.

graph.py::get_lab_graph доверяет инварианту "lab_id set ⟹ visibility=='lab'"
(обеспечивается resolve_lab_attachment на всех путях записи) без повторной
per-entity visibility-проверки — тест целится в сам эндпоинт /graph/lab/{id},
а не в отдельные сущности.

graph.py::get_related — BFS с per-node visibility check (см. docstring
_visible) — тест целится в то, что приватная гипотеза из чужой лабы не
протекает через связанный публичный/свой узел как "мост".
"""
import pytest
from tests.conftest import create_test_user, add_lab_member


async def _login(client, username, password="pass12345"):
    r = await client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200


async def _create_lab(client, name, is_public=False):
    r = await client.post("/api/v1/labs", json={
        "name": name, "is_public": is_public,
        "goal_type": "task", "new_goal_title": f"Goal for {name}",
    })
    assert r.status_code == 200, r.text
    return r.json()


@pytest.mark.asyncio
async def test_outsider_cannot_view_private_lab_graph(client):
    await create_test_user("graphlab_owner1")
    await create_test_user("graphlab_outsider1")
    await _login(client, "graphlab_owner1")
    lab = await _create_lab(client, "Private Lab Graph1", is_public=False)

    r = await client.post("/api/v1/hypotheses/", json={
        "name": "Secret hypothesis", "description": "x", "date_created": "2026-08-12",
        "visibility": "lab", "lab_id": lab["id"],
    })
    assert r.status_code == 201, r.text

    await _login(client, "graphlab_outsider1")
    r = await client.get(f"/api/v1/graph/lab/{lab['id']}")
    assert r.status_code == 403, "не участник закрытой лабы не должен видеть её граф вообще"


@pytest.mark.asyncio
async def test_member_can_view_lab_graph_with_hypothesis_node(client):
    await create_test_user("graphlab_owner2")
    member = await create_test_user("graphlab_member2")
    await _login(client, "graphlab_owner2")
    lab = await _create_lab(client, "Private Lab Graph2", is_public=False)

    r = await client.post("/api/v1/hypotheses/", json={
        "name": "Visible to members hypothesis", "description": "x", "date_created": "2026-08-12",
        "visibility": "lab", "lab_id": lab["id"],
    })
    assert r.status_code == 201, r.text

    await add_lab_member(lab["id"], member.id)

    await _login(client, "graphlab_member2")
    r = await client.get(f"/api/v1/graph/lab/{lab['id']}")
    assert r.status_code == 200, r.text
    labels = [n["label"] for n in r.json()["nodes"]]
    assert "Visible to members hypothesis" in labels


@pytest.mark.asyncio
async def test_related_does_not_leak_private_lab_hypothesis_via_bridge(client):
    """Сценарий IDOR из докстринга get_related: приватная гипотеза чужой лабы
    связана (Link) с публичным наблюдением. Не-участник лабы видит публичное
    наблюдение напрямую, но приватная гипотеза не должна протечь через него
    как мост в related-графе."""
    await create_test_user("graphrel_owner1")
    await create_test_user("graphrel_outsider1")
    await _login(client, "graphrel_owner1")
    lab = await _create_lab(client, "Private Lab Graph3", is_public=False)

    r = await client.post("/api/v1/hypotheses/", json={
        "name": "Bridge-test private hypothesis", "description": "x", "date_created": "2026-08-12",
        "visibility": "lab", "lab_id": lab["id"],
    })
    assert r.status_code == 201, r.text
    hyp_id = r.json()["id"]

    r = await client.post("/api/v1/observations/", json={
        "date": "2026-08-12", "author": "Owner", "title": "Public bridge", "text": "Public bridge observation",
        "visibility": "public",
    })
    assert r.status_code == 201, r.text
    obs_id = r.json()["id"]

    r = await client.post("/api/v1/graph/links", params={
        "from_type": "observation", "from_id": obs_id,
        "to_type": "hypothesis", "to_id": hyp_id,
    })
    assert r.status_code == 200, r.text

    await _login(client, "graphrel_outsider1")
    r = await client.get(f"/api/v1/graph/related/observation/{obs_id}")
    assert r.status_code == 200, r.text
    body = r.json()
    hyp_items = body.get("related", {}).get("hypothesis", [])
    titles = [item.get("title") for item in hyp_items]
    assert "Bridge-test private hypothesis" not in titles, (
        "приватная гипотеза чужой лабы протекла через мост-наблюдение в related-графе"
    )

    obs_items = body.get("related", {}).get("observation", [])
    assert len(obs_items) == 0, (
        "outsider не должен видеть ничего связанного, кроме корня (сам root в 'related' не входит)"
    )
