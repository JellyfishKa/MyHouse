from datetime import datetime, timezone
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.models.database.models import Alert, Equipment, EquipmentReading
from app.models.reading import (
    AlertOut,
    EquipmentCreate,
    EquipmentOut,
    EquipmentReadingBatch,
    EquipmentReadingOut,
)

router = APIRouter(prefix="/api/v1/equipment", tags=["equipment"])


@router.get("", response_model=List[EquipmentOut])
async def list_equipment(
    object_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Equipment).where(Equipment.object_id == object_id).order_by(Equipment.name)
    )
    return result.scalars().all()


@router.post("", response_model=EquipmentOut, status_code=status.HTTP_201_CREATED)
async def create_equipment(
    payload: EquipmentCreate,
    db: AsyncSession = Depends(get_db),
):
    item = Equipment(
        object_id=payload.object_id,
        name=payload.name,
        type=payload.type,
        status=payload.status,
        installed_at=payload.installed_at,
        meta_data=payload.meta_data,
    )
    db.add(item)
    try:
        await db.commit()
        await db.refresh(item)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=400, detail="Equipment creation failed")
    return item


@router.get("/{equipment_id}", response_model=EquipmentOut)
async def get_equipment(
    equipment_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    item = await db.get(Equipment, equipment_id)
    if not item:
        raise HTTPException(status_code=404, detail="Equipment not found")
    return item


@router.get("/{equipment_id}/readings", response_model=List[EquipmentReadingOut])
async def get_readings(
    equipment_id: UUID,
    from_: datetime | None = None,
    to: datetime | None = None,
    limit: int = 500,
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(EquipmentReading)
        .where(EquipmentReading.equipment_id == equipment_id)
        .order_by(EquipmentReading.time.desc())
        .limit(limit)
    )
    if from_:
        stmt = stmt.where(EquipmentReading.time >= from_)
    if to:
        stmt = stmt.where(EquipmentReading.time <= to)

    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/{equipment_id}/readings", status_code=status.HTTP_201_CREATED)
async def ingest_readings(
    equipment_id: UUID,
    payload: EquipmentReadingBatch,
    db: AsyncSession = Depends(get_db),
):
    if not payload.readings:
        raise HTTPException(status_code=400, detail="Empty batch")

    rows = [
        EquipmentReading(
            time=r.time,
            equipment_id=equipment_id,
            current_a=r.current_a,
            voltage_v=r.voltage_v,
            power_kw=r.power_kw,
        )
        for r in payload.readings
    ]
    db.add_all(rows)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=400, detail="Reading ingestion failed")
    return {"inserted": len(rows)}


@router.get("/{equipment_id}/alerts", response_model=List[AlertOut])
async def get_alerts(
    equipment_id: UUID,
    acknowledged: bool | None = None,
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Alert)
        .where(Alert.equipment_id == equipment_id)
        .order_by(Alert.triggered_at.desc())
    )
    if acknowledged is not None:
        stmt = stmt.where(Alert.acknowledged == acknowledged)

    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/{equipment_id}/alerts/ack/{alert_id}", response_model=AlertOut)
async def acknowledge_alert(
    equipment_id: UUID,
    alert_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    alert = await db.get(Alert, alert_id)
    if not alert or alert.equipment_id != equipment_id:
        raise HTTPException(status_code=404, detail="Alert not found")

    alert.acknowledged = True
    await db.commit()
    await db.refresh(alert)
    return alert
