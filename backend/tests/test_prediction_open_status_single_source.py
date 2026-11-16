"""«Открытый» статус прогноза живёт в одной константе (core/prediction_status.py). Раньше литерал
«не проверен» был разбросан по stats/users/reminders/calibration/онбордингу — добавленный позже статус
или правка слова молча расходились бы между местами."""
import ast
import pathlib
from typing import get_args

import pytest

from app.core.prediction_status import CLOSED_PREDICTION_STATUSES, OPEN_PREDICTION_STATUS, PREDICTION_STATUSES
from app.models.entities import Prediction
from app.schemas.entities import PredCreate, PredictionStatus

APP = pathlib.Path(__file__).resolve().parents[1] / "app"
# здесь литерал допустим: сама константа, Literal схемы и дефолт колонки (проверяются тестами ниже)
ALLOWED = {"core/prediction_status.py", "schemas/entities.py", "models/entities.py"}


async def _login(client, username="testuser", password="testpass123"):
    r = await client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200


def _literal_uses(path: pathlib.Path) -> list[int]:
    """Строки с настоящей строковой константой == литералу (комментарии и docstring не считаются)."""
    tree = ast.parse(path.read_text(encoding="utf-8"))
    docstrings = set()
    for node in ast.walk(tree):
        if isinstance(node, (ast.Module, ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            first = node.body[0] if node.body else None
            if isinstance(first, ast.Expr) and isinstance(first.value, ast.Constant) and isinstance(first.value.value, str):
                docstrings.add(id(first.value))
    return [n.lineno for n in ast.walk(tree)
            if isinstance(n, ast.Constant) and n.value == OPEN_PREDICTION_STATUS and id(n) not in docstrings]


def test_constants_are_consistent():
    assert OPEN_PREDICTION_STATUS not in CLOSED_PREDICTION_STATUSES
    assert tuple(get_args(PredictionStatus)) == PREDICTION_STATUSES


def test_model_and_schema_defaults_equal_the_constant():
    assert Prediction.__table__.c.status.default.arg == OPEN_PREDICTION_STATUS
    assert PredCreate.model_fields["status"].default == OPEN_PREDICTION_STATUS


def test_no_new_copies_of_the_literal_in_app_code():
    """Структурный охранник по AST (дополняет поведенческий тест ниже, не заменяет его)."""
    offenders = {f.relative_to(APP).as_posix(): lines
                 for f in APP.rglob("*.py")
                 if f.relative_to(APP).as_posix() not in ALLOWED and (lines := _literal_uses(f))}
    assert offenders == {}, f"используйте OPEN_PREDICTION_STATUS вместо литерала (файл: строки): {offenders}"


@pytest.mark.asyncio
async def test_prediction_created_without_status_is_open_and_listed_as_open(client, test_user):
    await _login(client)
    r = await client.post("/api/v1/predictions/", json={
        "text": "x", "date_created": "2026-10-10", "expected_check_date": "2027-01-01T00:00:00Z", "confidence": 60,
    })
    assert r.status_code == 201
    got = (await client.get(f"/api/v1/predictions/{r.json()['id']}")).json()
    assert got["status"] == OPEN_PREDICTION_STATUS
    listed = (await client.get("/api/v1/predictions/", params={"status": OPEN_PREDICTION_STATUS})).json()
    assert got["id"] in [p["id"] for p in listed]
