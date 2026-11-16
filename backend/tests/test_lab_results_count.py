"""results_count в карточке лабы обязан совпадать с тем, что реально отдаёт
список GET /results?lab_id= тому же зрителю. Раньше счётчик считал закрытые
прогнозы вместо Result, и бейдж «Результаты 1» сидел над пустым списком."""
from datetime import datetime, timezone

import pytest

from app.db.session import AsyncSessionLocal
from app.models.entities import Prediction, Result
from tests.conftest import create_test_user
from tests.test_lab_stats import _create_lab, _login


async def _mk_result(owner_id, lab_id, title, published, vis="lab"):
    async with AsyncSessionLocal() as db:
        r = Result(user_id=owner_id, lab_id=lab_id, title=title, slug=title, body="t",
                   visibility=vis, is_published=published)
        db.add(r)
        await db.flush()
        rid = r.id
        await db.commit()
        return rid


async def _view(client, lab_id):
    """(results_count из карточки лабы, названия из списка) глазами текущего зрителя."""
    lab = await client.get(f"/api/v1/labs/{lab_id}")
    assert lab.status_code == 200, lab.text
    lst = await client.get("/api/v1/results/", params={"lab_id": lab_id})
    assert lst.status_code == 200, lst.text
    return lab.json()["results_count"], {x["title"] for x in lst.json()}


@pytest.mark.asyncio
async def test_results_count_equals_list_for_every_viewer(client):
    owner = await create_test_user("rc_owner")
    await create_test_user("rc_other")
    await _login(client, "rc_owner")
    lab = await _create_lab(client, "RC lab", is_public=True)
    await _mk_result(owner.id, lab["id"], "pub", True)
    await _mk_result(owner.id, lab["id"], "draft", False)

    count, titles = await _view(client, lab["id"])  # участник: видит всё
    assert titles == {"pub", "draft"} and count == 2

    client.cookies.clear()
    count, titles = await _view(client, lab["id"])  # гость: только опубликованное
    assert titles == {"pub"} and count == 1

    await _login(client, "rc_other")  # залогинен, но не участник
    count, titles = await _view(client, lab["id"])
    assert titles == {"pub"} and count == 1


@pytest.mark.asyncio
async def test_closed_prediction_is_not_a_result(client):
    owner = await create_test_user("rc_pred")
    await _login(client, "rc_pred")
    lab = await _create_lab(client, "RC pred lab")
    async with AsyncSessionLocal() as db:
        db.add(Prediction(
            user_id=owner.id, title="Closed", slug="rc-closed", text="t",
            date_created="2024-01-01", expected_check_date=datetime(2025, 1, 1, tzinfo=timezone.utc),
            status="подтверждён", visibility="lab", lab_id=lab["id"],
        ))
        await db.commit()
    count, titles = await _view(client, lab["id"])
    assert (count, titles) == (0, set())


@pytest.mark.asyncio
async def test_results_count_follows_delete(client):
    owner = await create_test_user("rc_del")
    await _login(client, "rc_del")
    lab = await _create_lab(client, "RC del lab")
    await _mk_result(owner.id, lab["id"], "keep", False)
    gone = await _mk_result(owner.id, lab["id"], "gone", False, "private")
    assert (await _view(client, lab["id"]))[0] == 2
    assert (await client.delete(f"/api/v1/results/{gone}")).status_code == 204
    count, titles = await _view(client, lab["id"])
    assert (count, titles) == (1, {"keep"})
