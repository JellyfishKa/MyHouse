from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.models.database.models import Anomaly, Object, Reading, Sensor
from app.models.reading import (
    ObjectListItem,
    ObjectRegistration,
    SensorListItem,
)

router = APIRouter(prefix="/api/v1/objects", tags=["Objects"])


@router.get("", response_model=list[ObjectListItem])
async def list_objects(db: AsyncSession = Depends(get_db)):
    sensor_stats = (
        select(
            Sensor.object_id.label("object_id"),
            func.count(Sensor.id).label("sensor_count"),
        )
        .group_by(Sensor.object_id)
        .subquery()
    )

    reading_stats = (
        select(
            Sensor.object_id.label("object_id"),
            func.count().label("reading_count"),
            func.max(Reading.time).label("last_reading_at"),
        )
        .select_from(Reading)
        .join(Sensor, Sensor.id == Reading.sensor_id)
        .group_by(Sensor.object_id)
        .subquery()
    )

    anomaly_stats = (
        select(
            Sensor.object_id.label("object_id"),
            func.count().label("anomaly_count"),
        )
        .join(Anomaly, Anomaly.sensor_id == Sensor.id)
        .group_by(Sensor.object_id)
        .subquery()
    )

    stmt = (
        select(
            Object.id,
            Object.name,
            Object.type,
            Object.meta_data,
            func.coalesce(sensor_stats.c.sensor_count, 0).label("sensor_count"),
            func.coalesce(reading_stats.c.reading_count, 0).label("reading_count"),
            func.coalesce(anomaly_stats.c.anomaly_count, 0).label("anomaly_count"),
            reading_stats.c.last_reading_at,
        )
        .outerjoin(sensor_stats, sensor_stats.c.object_id == Object.id)
        .outerjoin(reading_stats, reading_stats.c.object_id == Object.id)
        .outerjoin(anomaly_stats, anomaly_stats.c.object_id == Object.id)
        .order_by(reading_stats.c.last_reading_at.desc().nullslast(), Object.name.asc())
    )

    result = await db.execute(stmt)
    rows = result.all()

    return [
        ObjectListItem(
            id=row.id,
            name=row.name,
            type=row.type,
            meta_data=row.meta_data,
            sensor_count=row.sensor_count,
            reading_count=row.reading_count,
            anomaly_count=row.anomaly_count,
            last_reading_at=row.last_reading_at,
        )
        for row in rows
    ]


@router.get("/{object_id}/sensors", response_model=list[SensorListItem])
async def list_object_sensors(
    object_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    object_exists = await db.scalar(
        select(func.count()).select_from(Object).where(Object.id == object_id)
    )
    if not object_exists:
        raise HTTPException(status_code=404, detail="Object not found")

    reading_stats = (
        select(
            Reading.sensor_id.label("sensor_id"),
            func.count().label("reading_count"),
            func.max(Reading.time).label("last_reading_at"),
        )
        .group_by(Reading.sensor_id)
        .subquery()
    )

    stmt = (
        select(
            Sensor.id,
            Sensor.label,
            Sensor.category,
            Sensor.unit,
            func.coalesce(reading_stats.c.reading_count, 0).label("reading_count"),
            reading_stats.c.last_reading_at,
        )
        .outerjoin(reading_stats, reading_stats.c.sensor_id == Sensor.id)
        .where(Sensor.object_id == object_id)
        .order_by(Sensor.label.asc(), Sensor.id.asc())
    )

    result = await db.execute(stmt)
    rows = result.all()

    return [
        SensorListItem(
            id=row.id,
            label=row.label,
            category=row.category.value if hasattr(row.category, "value") else str(row.category),
            unit=row.unit,
            reading_count=row.reading_count,
            last_reading_at=row.last_reading_at,
        )
        for row in rows
    ]


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register_object(
    payload: ObjectRegistration,
    db: AsyncSession = Depends(get_db),
):
    object_stmt = (
        pg_insert(Object.__table__)
        .values(
            id=payload.id,
            name=payload.name,
            type=payload.type,
            metadata=payload.meta_data,
        )
        .on_conflict_do_update(
            index_elements=[Object.__table__.c.id],
            set_={
                "name": payload.name,
                "type": payload.type,
                "metadata": payload.meta_data,
            },
        )
    )
    await db.execute(object_stmt)

    if payload.sensors:
        sensor_insert = pg_insert(Sensor.__table__)
        sensor_stmt = (
            sensor_insert
            .values(
                [
                    {
                        "id": sensor.id,
                        "object_id": payload.id,
                        "type": sensor.type,
                        "category": sensor.category,
                        "label": sensor.label,
                        "unit": sensor.unit,
                    }
                    for sensor in payload.sensors
                ]
            )
            .on_conflict_do_update(
                index_elements=[Sensor.__table__.c.id],
                set_={
                    "object_id": payload.id,
                    "type": sensor_insert.excluded.type,
                    "category": sensor_insert.excluded.category,
                    "label": sensor_insert.excluded.label,
                    "unit": sensor_insert.excluded.unit,
                },
            )
        )
        await db.execute(sensor_stmt)

    await db.commit()
    return {
        "object_id": str(payload.id),
        "sensors_registered": len(payload.sensors),
    }
