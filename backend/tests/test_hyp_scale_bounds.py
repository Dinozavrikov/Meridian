"""Оценки гипотезы вне шкалы отклоняются и не попадают в базу, края шкалы сохраняются."""
import pytest
from pydantic import ValidationError

from app.db.session import AsyncSessionLocal
from app.models.entities import Hypothesis
from app.schemas.entities import HypCreate
from app.schemas.hyp_scales import MATURITY_MAX, RESEARCH_LOAD_MAX, RISK_MAX, STABILITY_MAX
from tests.test_lab_maturity_hyp_put import _put_body
from tests.test_lab_maturity_votes import _setup

BOUNDS = {"maturity": MATURITY_MAX, "risk": RISK_MAX,
          "stability": STABILITY_MAX, "research_load": RESEARCH_LOAD_MAX}


def _create_rejects(field, value):
    try:
        HypCreate(name="x", date_created="2026-08-06", **{field: value})
    except ValidationError:
        return True
    return False


async def _stored(hid, field):
    async with AsyncSessionLocal() as db:
        return getattr(await db.get(Hypothesis, hid), field)


@pytest.mark.asyncio
@pytest.mark.parametrize("field", list(BOUNDS))
async def test_hyp_scale_bounds(client, field):
    _, _, lab, h = await _setup(client, "sb", 0)
    for edge in (0, BOUNDS[field]):
        r = await client.put(f"/api/v1/hypotheses/{h}", json=_put_body(lab, **{field: edge}))
        assert r.status_code == 200, r.text
        assert await _stored(h, field) == edge
    for bad in (-1, BOUNDS[field] + 1):
        assert _create_rejects(field, bad), f"create accepts {field}={bad}"
        r = await client.put(f"/api/v1/hypotheses/{h}", json=_put_body(lab, **{field: bad}))
        assert r.status_code == 422, f"{field}={bad}: {r.status_code}"
        assert await _stored(h, field) == BOUNDS[field]
