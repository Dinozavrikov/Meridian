"""Предложение зрелости отдаёт составные части сигнала числами (текст собирает фронт через useT)."""
import pytest

from tests.test_lab_signal import _close, _login
from tests.test_lab_maturity import _contribution
from tests.test_lab_maturity_votes import _setup


@pytest.mark.asyncio
async def test_suggestion_exposes_signal_parts(client):
    owner, (b,), lab, h = await _setup(client, "mp", 1)
    await _login(client, b.username)
    p = await _close(client, h, lab, "подтвердился", 10)
    c = await _contribution(p)
    await _login(client, owner.username)
    r = await client.get(f"/api/v1/hypotheses/{h}/maturity-suggestion")
    assert r.status_code == 200, r.text
    s = r.json()
    assert s["pred_signal"] == 0.0 and s["obs_signal"] == 0.0     # свой сигнал владельца пуст
    assert s["lab_signal"] == pytest.approx(c)                    # весь вклад пришёл от участника
    assert s["raw_signal"] == pytest.approx(s["pred_signal"] + s["obs_signal"] + s["lab_signal"])
