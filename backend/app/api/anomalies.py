from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.models.database.models import Anomaly
from app.models.reading import AnomalyResponse

router = APIRouter()


@router.get("/anomalies", response_model=List[AnomalyResponse])
async def get_anomalies(
    object_id: UUID,
    severity: Optional[str] = None,
    limit: int = 10,
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Anomaly).where(Anomaly.sensor_id == object_id)

    if severity:
        stmt = stmt.where(Anomaly.severity == severity)

    stmt = stmt.order_by(desc(Anomaly.detected_at)).limit(limit)

    result = await db.execute(stmt)
    anomalies = result.scalars().all()

    return [
        {
            "id": a.id,
            "time": a.detected_at,
            "category": f"Sensor {a.sensor_id}",
            "severity": a.severity,
            "value": a.value,
            "expected": a.expected_value
        }
        for a in anomalies
    ]
