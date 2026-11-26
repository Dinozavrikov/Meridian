"""Границы оценок гипотезы на входе API.

Максимумы зрелости и риска выводятся из констант формулы. У стабильности и нагрузки
исследования расчетной константы нет, поэтому их границы объявлены здесь.
"""
from typing import Annotated

from pydantic import Field

from app.services.hypothesis_evidence import BASE_THRESHOLDS, RISK_SCALE

MATURITY_MAX = len(BASE_THRESHOLDS) - 1
RISK_MAX = int(RISK_SCALE)
STABILITY_MAX = 10
RESEARCH_LOAD_MAX = 10

MaturityLevel = Annotated[int, Field(ge=0, le=MATURITY_MAX)]
RiskScore = Annotated[int, Field(ge=0, le=RISK_MAX)]
StabilityScore = Annotated[int, Field(ge=0, le=STABILITY_MAX)]
ResearchLoadScore = Annotated[int, Field(ge=0, le=RESEARCH_LOAD_MAX)]
