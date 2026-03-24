from datetime import datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import asc, func, insert, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.models.database.models import Reading
from app.models.reading import AggregatedReading, ReadingBatch

router = APIRouter(prefix="/api/v1/telemetry", tags=["Telemetry"])


@router.post("/batch", status_code=status.HTTP_201_CREATED)
async def upload_telemetry_batch(
    batch: ReadingBatch,
    db: AsyncSession = Depends(get_db)
):
    if not batch.readings:
        raise HTTPException(status_code=400, detail="Empty batch")

    insert_data = [reading.model_dump() for reading in batch.readings]

    try:
        stmt = insert(Reading).values(insert_data)
        await db.execute(stmt)
        await db.commit()

    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=422,
            detail="One or more sensor_ids do not exist in the database."
        )
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

    return {"inserted": len(insert_data)}


@router.get("/{sensor_id}", response_model=list[AggregatedReading])
async def get_sensor_analytics(
    sensor_id: UUID,
    start_from: datetime = Query(..., alias="from"),
    to: datetime = Query(..., alias="to"),
    agg: Literal["raw", "hour", "day"] = "raw",
    db: AsyncSession = Depends(get_db)
):
    # 1. Если нужны сырые данные (без агрегации)
    if agg == "raw":
        query = (
            select(Reading.time.label("time"), Reading.value)
            .where(
                Reading.sensor_id == sensor_id,
                Reading.time >= start_from,
                Reading.time <= to
            )
            .order_by(asc(Reading.time))
        )

    # 2. Если нужна агрегация через TimescaleDB (time_bucket)
    else:
        interval_str = "1 hour" if agg == "hour" else "1 day"

        interval_val = text(f"'{interval_str}'::interval")

        bucket_column = func.time_bucket(interval_val,
                                         Reading.time).label("time")
        avg_value = func.avg(Reading.value).label("value")
        query = (
            select(bucket_column, avg_value)
            .where(
                Reading.sensor_id == sensor_id,
                Reading.time >= start_from,
                Reading.time <= to
            )
            .group_by(bucket_column)
            .order_by(asc(bucket_column))
        )

    result = await db.execute(query)
    return result.all()
