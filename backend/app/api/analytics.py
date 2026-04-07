from datetime import datetime, timedelta, timezone
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import func, join, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.models.database.models import Reading, Sensor
from app.models.reading import SensorSummary

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
