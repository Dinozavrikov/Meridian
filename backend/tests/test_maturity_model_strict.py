"""Открытый симулятор зрелости: управляющие символы отвергаются, лишние поля по-прежнему запрещены, обычный запрос проходит."""
import pytest
from pydantic import ValidationError

from app.api.v1.maturity_model import ObservationIn, PredictionIn, SimulateIn


@pytest.mark.parametrize("bad", ["a\x00b", "a\x1fb"])
def test_control_characters_are_rejected_also_in_nested_schemas(bad):
    with pytest.raises(ValidationError):
        PredictionIn(outcome=bad)
    with pytest.raises(ValidationError):
        SimulateIn(predictions=[{"outcome": bad}])


def test_ordinary_text_and_known_fields_pass():
    PredictionIn(outcome="строка\nтаб\t<b>html</b>")
    ObservationIn(sign=1, importance=None)
    SimulateIn()


def test_unknown_fields_are_still_forbidden():
    with pytest.raises(ValidationError):
        SimulateIn(unexpected=1)
    with pytest.raises(ValidationError):
        ObservationIn(sign=1, extra_field=2)


@pytest.mark.asyncio
async def test_endpoint_answers_for_an_empty_request_and_rejects_extra_fields(client):
    ok = await client.post("/api/v1/meta/maturity-model/simulate", json={})
    assert ok.status_code == 200, ok.text
    bad = await client.post("/api/v1/meta/maturity-model/simulate", json={"unexpected": 1})
    assert bad.status_code == 422
