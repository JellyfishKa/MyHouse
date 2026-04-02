from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field
from app.models.database.models import SeverityLevel


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
    severity: SeverityLevel
    value: float
    expected: Optional[float] = None

    class Config:
        from_attributes = True


class AnomalyBatchItem(BaseModel):
    sensor_id: UUID
    detected_at: datetime
    severity: SeverityLevel
    value: float
    expected_value: Optional[float] = None
