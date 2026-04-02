from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import desc, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.db import get_db
from app.models.database.models import Anomaly, Sensor
from app.models.reading import AnomalyBatchItem, AnomalyResponse

router = APIRouter(prefix="/api/v1", tags=["Anomalies"])


@router.get("/anomalies", response_model=List[AnomalyResponse])
async def get_anomalies(
    object_id: UUID,
    severity: Optional[str] = None,
    limit: int = 100,
    db: AsyncSession = Depends(get_db)
):
    stmt = (
        select(Anomaly)
        .join(Sensor, Anomaly.sensor_id == Sensor.id)
        .options(joinedload(Anomaly.sensor))
        .where(Sensor.object_id == object_id)
    )

    if severity:
        stmt = stmt.where(Anomaly.severity == severity)

    stmt = stmt.order_by(desc(Anomaly.detected_at)).limit(limit)

    result = await db.execute(stmt)
    anomalies = result.scalars().unique().all()

    return [
        AnomalyResponse(
            id=a.id,
            time=a.detected_at,
            category=a.sensor.category.value if a.sensor else "unknown",
            severity=a.severity.value,
            value=a.value,
            expected=a.expected_value,
        )
        for a in anomalies
    ]


@router.post("/anomalies/batch", status_code=status.HTTP_201_CREATED)
async def create_anomalies_batch(
    items: List[AnomalyBatchItem],
    db: AsyncSession = Depends(get_db)
):
    if not items:
        raise HTTPException(status_code=400, detail="Empty batch")

    anomalies = [
        Anomaly(
            sensor_id=item.sensor_id,
            detected_at=item.detected_at,
            severity=item.severity,
            value=item.value,
            expected_value=item.expected_value,
        )
        for item in items
    ]

    try:
        db.add_all(anomalies)
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=422,
            detail="One or more sensor_ids do not exist."
        )

    return {"inserted": len(anomalies)}
