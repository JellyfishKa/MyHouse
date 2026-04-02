from datetime import datetime
from typing import List
from uuid import UUID

from pydantic import BaseModel, Field


class SensorReading(BaseModel):
    sensor_id: UUID
    time: datetime
    value: float = Field(..., gt=0)


class ReadingBatch(BaseModel):
    readings: List[SensorReading]
