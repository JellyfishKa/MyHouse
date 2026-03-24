from datetime import datetime, timedelta, timezone
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import func, join, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import get_db
from app.models.database.models import Reading, Sensor
from app.models.reading import CategorySummary

router = APIRouter(prefix="/api/v1/analytics", tags=["Analytics"])


@router.get("/summary/{object_id}", response_model=List[CategorySummary])
async def get_object_summary(
    object_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    # Определяем временное окно: 7 дней назад от текущего момента
    seven_days_ago = datetime.now(timezone.utc) - timedelta(days=7)

    # Строим запрос:
    # 1. Джойним сенсоры и их показания
    # 2. Фильтруем по объекту и времени
    # 3. Группируем по категории сенсора
    query = (
        select(
            Sensor.category.label("category"),
            func.sum(Reading.value).label("kwh")
        )
        .select_from(join(Sensor, Reading, Sensor.id == Reading.sensor_id))
        .where(
            Sensor.object_id == object_id,
            Reading.time >= seven_days_ago
        )
        .group_by(Sensor.category)
    )

    result = await db.execute(query)
    rows = result.all()

    if not rows:
        return []

    summary = [
        CategorySummary(
            category=row.category,
            kwh=round(row.kwh, 2),
            cost_rub=round(row.kwh * settings.ELECTRICITY_TARIFF, 2)
        )
        for row in rows
    ]

    return summary
