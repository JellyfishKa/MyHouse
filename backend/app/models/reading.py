from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class SensorReading(BaseModel):
    sensor_id: UUID
    time: datetime
    value: float = Field(..., gt=0)


class ReadingBatch(BaseModel):
    readings: List[SensorReading]


class AggregatedReading(BaseModel):
    time: datetime
    value: Optional[float]


class CategorySummary(BaseModel):
    category: str
    kwh: float
    cost_rub: float


class AnomalyResponse(BaseModel):
    id: UUID
    time: datetime
    category: str
    severity: str
    value: float
    expected: float

    class Config:
        from_attributes = True
