"""Открытые ручки модели зрелости для страницы документации (/docs доступна гостю).

Описание и пробный расчет целиком берутся из services/maturity_model.py, а тот читает константы и функции
боевой формулы. Данных пользователей здесь нет, входные списки ограничены по размеру."""
from fastapi import APIRouter, HTTPException, Response
from pydantic import ConfigDict, Field

from app.schemas._strict import StrictIn
from app.services import maturity_model as mm

router = APIRouter(prefix="/meta", tags=["meta"])


class _In(StrictIn):
    model_config = ConfigDict(extra="forbid")


class PredictionIn(_In):
    confidence: int | None = None
    outcome: str
    confirms_if_true: bool = True


class ObservationIn(_In):
    sign: int
    importance: int | None = None


class SimulateIn(_In):
    risk: int = 0
    predictions: list[PredictionIn] = Field(default_factory=list, max_length=mm.MAX_ITEMS)
    observations: list[ObservationIn] = Field(default_factory=list, max_length=mm.MAX_ITEMS)
    lab_signal: float = 0.0
    history_hits: int = 0
    history_misses: int = 0
    history_confidence: int = mm.DEFAULT_CONFIDENCE


@router.get("/maturity-model")
async def get_maturity_model(response: Response):
    response.headers["Cache-Control"] = "public, max-age=300"
    return mm.describe_model()


@router.post("/maturity-model/simulate")
async def simulate_maturity(body: SimulateIn):
    try:
        return mm.simulate(
            risk=body.risk,
            predictions=[p.model_dump() for p in body.predictions],
            observations=[o.model_dump() for o in body.observations],
            lab_signal=body.lab_signal,
            history_hits=body.history_hits,
            history_misses=body.history_misses,
            history_confidence=body.history_confidence,
        )
    except ValueError as e:
        raise HTTPException(422, {"code": "invalid_simulation", "field": str(e)})
