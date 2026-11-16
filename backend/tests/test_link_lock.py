"""lock в related: причина, по которой связь нельзя менять."""
from sqlalchemy import update

from app.db.session import AsyncSessionLocal
from app.models.entities import Prediction
from tests.conftest import create_test_user
from tests.test_field_link import _item, _login, _setup


async def test_closed_prediction_reports_status(client):
    await create_test_user("lk_a")
    await _login(client, "lk_a")
    p, h = await _setup(client)
    assert (await _item(client, "prediction", p, "hypothesis"))["lock"] is None
    async with AsyncSessionLocal() as db:
        await db.execute(update(Prediction).where(Prediction.id == p).values(status="частично подтвердился"))
        await db.commit()
    for etype, eid, itype in (("prediction", p, "hypothesis"), ("hypothesis", h, "prediction")):
        assert (await _item(client, etype, eid, itype))["lock"] == {"code": "pred_closed", "status": "частично подтвердился"}


async def test_other_authors_field_link_is_locked(client):
    await create_test_user("lk_b")
    await create_test_user("lk_c")
    await _login(client, "lk_b")
    p, h = await _setup(client)
    assert (await client.put(f"/api/v1/prediction/{p}/visibility", json={"visibility": "public"})).status_code == 200
    assert (await client.put(f"/api/v1/hypothesis/{h}/visibility", json={"visibility": "public"})).status_code == 200
    await _login(client, "lk_c")
    assert (await _item(client, "prediction", p, "hypothesis"))["lock"] == {"code": "other_author"}
