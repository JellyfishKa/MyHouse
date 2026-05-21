from datetime import datetime
from typing import Any, List, Optional
from uuid import UUID

from pydantic import BaseModel, Field
from app.models.database.models import (
    ObjectType,
    SensorCategory,
    SensorType,
    SeverityLevel,
)


class SensorReading(BaseModel):
    sensor_id: UUID
    time: datetime
    value: float


class ReadingBatch(BaseModel):
    readings: List[SensorReading]


class AggregatedReading(BaseModel):
    time: datetime
    value: Optional[float]


class SensorSummary(BaseModel):
    sensor_id: UUID
    sensor_label: str
    category: str
    unit: str
    average: float
    minimum: float
    maximum: float
    readings_count: int


class AnomalyResponse(BaseModel):
    id: UUID
    time: datetime
    category: str
    sensor_label: Optional[str] = None
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


class SensorRegistration(BaseModel):
    id: UUID
    label: str
    category: SensorCategory
    type: SensorType = SensorType.ELECTRICITY
    unit: str = "Вт"


class ObjectRegistration(BaseModel):
    id: UUID
    name: str
    type: ObjectType
    meta_data: dict[str, Any] = Field(default_factory=dict)
    sensors: List[SensorRegistration] = Field(default_factory=list)


class ObjectListItem(BaseModel):
    id: UUID
    name: str
    type: ObjectType
    meta_data: Optional[dict[str, Any]] = None
    sensor_count: int
    reading_count: int
    anomaly_count: int
    last_reading_at: Optional[datetime] = None


class SensorListItem(BaseModel):
    id: UUID
    label: str
    category: str
    unit: str
    reading_count: int
    last_reading_at: Optional[datetime] = None


class DetectRequest(BaseModel):
    object_id: Optional[UUID] = None
    sensor_id: Optional[UUID] = None
    days: int = Field(default=7, ge=1, le=365)


class DetectResponse(BaseModel):
    anomalies_found: int
    anomalies_inserted: int


class ServiceHealth(BaseModel):
    status: str
    service: str
    detail: Optional[str] = None


# === EQUIPMENT SCHEMAS ===

class EquipmentCreate(BaseModel):
    object_id: UUID
    name: str
    type: str
    status: str = "online"
    installed_at: Optional[datetime] = None
    meta_data: dict[str, Any] = Field(default_factory=dict)


class EquipmentOut(BaseModel):
    id: UUID
    object_id: UUID
    name: str
    type: str
    status: str
    installed_at: Optional[datetime] = None
    meta_data: Optional[dict[str, Any]] = None

    class Config:
        from_attributes = True


class EquipmentReadingCreate(BaseModel):
    time: datetime
    current_a: Optional[float] = None
    voltage_v: Optional[float] = None
    power_kw: Optional[float] = None


class EquipmentReadingBatch(BaseModel):
    readings: List[EquipmentReadingCreate]


class EquipmentReadingOut(BaseModel):
    time: datetime
    equipment_id: UUID
    current_a: Optional[float] = None
    voltage_v: Optional[float] = None
    power_kw: Optional[float] = None

    class Config:
        from_attributes = True


class AlertOut(BaseModel):
    id: UUID
    equipment_id: UUID
    severity: SeverityLevel
    message: str
    triggered_at: datetime
    acknowledged: bool

    class Config:
        from_attributes = True


# === ANALYTICS SCHEMAS ===

class HealthScore(BaseModel):
    object_id: UUID
    score: float
    grade: str
    critical: int
    high: int
    medium: int
    low: int


class RulPrediction(BaseModel):
    object_id: UUID
    rul_days: int
    status: str
    confidence: str
