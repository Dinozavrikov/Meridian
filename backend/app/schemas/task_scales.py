"""Входные схемы шкал задач (раньше body: dict — запись любых полей, 500 на мусоре, привязка к чужим гипотезам)."""
from typing import Dict, List, Optional
from pydantic import Field
from app.schemas._strict import StrictIn, Short255, Short128, Short32, LongText, Int32

HypIds = List[Int32]


class ScaleCreate(StrictIn):
    name: Short128 = "Шкала"
    description: LongText = ""
    min_val: float = 0
    max_val: float = 10
    current_val: float = 0
    value_labels: Dict[str, Short255] = Field(default_factory=dict, max_length=200)
    auto_formula: str = Field(default="", max_length=512)
    unit: Short32 = ""
    hypothesis_ids: HypIds = Field(default_factory=list, max_length=200)


class ScaleUpdate(StrictIn):
    name: Optional[Short128] = None
    description: Optional[LongText] = None
    min_val: Optional[float] = None
    max_val: Optional[float] = None
    current_val: Optional[float] = None
    value_labels: Optional[Dict[str, Short255]] = Field(default=None, max_length=200)
    auto_formula: Optional[str] = Field(default=None, max_length=512)
    unit: Optional[Short32] = None
    hypothesis_ids: Optional[HypIds] = Field(default=None, max_length=200)


class ScaleValue(StrictIn):
    value: float
