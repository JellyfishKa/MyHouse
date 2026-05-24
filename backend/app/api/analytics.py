from datetime import datetime, timedelta, timezone  # noqa: F401 (timezone used in health/rul)
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import func, join, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.models.database.models import Anomaly, Reading, Sensor, SeverityLevel
from app.models.reading import HealthScore, RulPrediction, SensorSummary

router = APIRouter(prefix="/api/v1/analytics", tags=["Analytics"])


@router.get("/summary/{object_id}", response_model=List[SensorSummary])
async def get_object_summary(
    object_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    latest_point = await db.scalar(
        select(func.max(Reading.time))
        .join(Sensor, Sensor.id == Reading.sensor_id)
        .where(Sensor.object_id == object_id)
    )

    if latest_point is None:
        return []

    seven_days_ago = latest_point - timedelta(days=7)

    query = (
        select(
            Sensor.id.label("sensor_id"),
            Sensor.label.label("sensor_label"),
            Sensor.category.label("category"),
            Sensor.unit.label("unit"),
            func.avg(Reading.value).label("average"),
            func.min(Reading.value).label("minimum"),
            func.max(Reading.value).label("maximum"),
            func.count().label("readings_count"),
        )
        .select_from(join(Sensor, Reading, Sensor.id == Reading.sensor_id))
        .where(
            Sensor.object_id == object_id,
            Reading.time >= seven_days_ago
        )
        .group_by(Sensor.id, Sensor.label, Sensor.category, Sensor.unit)
        .order_by(Sensor.label.asc(), Sensor.category.asc())
    )

    result = await db.execute(query)
    rows = result.all()

    return [
        SensorSummary(
            sensor_id=row.sensor_id,
            sensor_label=row.sensor_label,
            category=row.category.value if hasattr(row.category, "value") else str(row.category),
            unit=row.unit,
            average=round(row.average, 3),
            minimum=round(row.minimum, 3),
            maximum=round(row.maximum, 3),
            readings_count=row.readings_count,
        )
        for row in rows
    ]


@router.get("/health/{object_id}", response_model=HealthScore)
async def get_object_health(
    object_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    seven_days_ago = datetime.now(timezone.utc) - timedelta(days=7)

    query = (
        select(Anomaly.severity, func.count().label("cnt"))
        .join(Sensor, Sensor.id == Anomaly.sensor_id)
        .where(
            Sensor.object_id == object_id,
            Anomaly.detected_at >= seven_days_ago,
        )
        .group_by(Anomaly.severity)
    )
    rows = (await db.execute(query)).all()

    counts: dict[str, int] = {r.severity.value if hasattr(r.severity, "value") else str(r.severity): r.cnt for r in rows}
    critical = counts.get(SeverityLevel.CRITICAL.value, 0)
    high = counts.get(SeverityLevel.HIGH.value, 0)
    medium = counts.get(SeverityLevel.MEDIUM.value, 0)
    low = counts.get(SeverityLevel.LOW.value, 0)

    score = max(0.0, 100.0 - (critical * 25 + high * 15 + medium * 5 + low * 2))
    grade = "A" if score >= 90 else "B" if score >= 75 else "C" if score >= 50 else "D"

    return HealthScore(
        object_id=object_id,
        score=round(score, 1),
        grade=grade,
        critical=critical,
        high=high,
        medium=medium,
        low=low,
    )


@router.get("/rul/{object_id}", response_model=RulPrediction)
async def get_object_rul(
    object_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)

    anomaly_count = await db.scalar(
        select(func.count())
        .select_from(Anomaly)
        .join(Sensor, Sensor.id == Anomaly.sensor_id)
        .where(
            Sensor.object_id == object_id,
            Anomaly.detected_at >= thirty_days_ago,
        )
    )

    rate = (anomaly_count or 0) / 30.0
    rul_days = max(7, int(365 - rate * 20))
    status = "ok" if rul_days >= 180 else "warning" if rul_days >= 60 else "critical"

    return RulPrediction(
        object_id=object_id,
        rul_days=rul_days,
        status=status,
        confidence="low",
    )
