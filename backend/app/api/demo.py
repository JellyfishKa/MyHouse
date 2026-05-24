import asyncio
import random
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from sqlalchemy import select as sa_select
from app.models.database.models import (
    Alert,
    Equipment,
    EquipmentReading,
    EquipmentStatus,
    EquipmentType,
    Reading,
    Sensor,
    SeverityLevel,
)
from app.models.reading import StressTestRequest, StressTestResponse

router = APIRouter(prefix="/api/v1/demo", tags=["demo"])


def _generate_spikes(n: int = 10) -> list[float]:
    spikes = [0.0] * n
    spike_indices = random.sample(range(n), 2)
    for i in spike_indices:
        spikes[i] = random.uniform(6.0, 14.0)
    return spikes


async def _stress_test_worker(equipment_id: uuid.UUID, duration_sec: int) -> None:
    from app.core.db import async_session_local

    step = 0
    deadline = datetime.now(timezone.utc) + timedelta(seconds=duration_sec)
    alert_created = False

    async with async_session_local() as db:
        # Resolve object_id + sensors once
        equipment = await db.get(Equipment, equipment_id)
        object_id = equipment.object_id if equipment else None

        sensor_ids: list[uuid.UUID] = []
        if object_id:
            result = await db.execute(
                sa_select(Sensor.id).where(Sensor.object_id == object_id)
            )
            sensor_ids = [row[0] for row in result.all()]

        while datetime.now(timezone.utc) < deadline:
            # Escalating current — much more dramatic for demo
            base_current = 10.0 + step * 1.2          # +1.2A every 2s → visible spike
            spike_amp = min(step * 2.0, 25.0)          # growing spike amplitude
            now = datetime.now(timezone.utc)

            # Write to equipment_readings
            eq_readings = [
                EquipmentReading(
                    time=now - timedelta(seconds=i),
                    equipment_id=equipment_id,
                    current_a=round(base_current + random.gauss(0, 0.8) + (spike_amp if i < 2 else 0), 3),
                    voltage_v=round(random.gauss(220, 3), 2),
                    power_kw=round(base_current * 220 / 1000, 3),
                )
                for i in range(10)
            ]
            db.add_all(eq_readings)

            # Also write to readings (sensors table) so ConsumptionChart shows data
            # Each sensor gets a distinct multiplier so lines are visually separate
            sensor_profiles = [
                (1.00, 0.5, True),   # servers  — full load, spikes
                (0.60, 0.3, False),  # cooling  — 60 % load, no spike
                (0.35, 0.2, True),   # ups      — 35 % load, small spikes
            ]
            for i, sensor_id in enumerate(sensor_ids[:3]):
                mult, noise, can_spike = sensor_profiles[i]
                spike = (spike_amp * mult) if (can_spike and step % 3 == 0) else 0
                db.add(Reading(
                    time=now,
                    sensor_id=sensor_id,
                    value=round(base_current * mult + random.gauss(0, noise) + spike, 3),
                ))

            if not alert_created and step >= 3:
                alert = Alert(
                    equipment_id=equipment_id,
                    severity=SeverityLevel.CRITICAL,
                    message=(
                        f"Стресс-тест: критический ток {base_current:.1f}A "
                        f"(+{step * 1.2:.1f}A выше нормы)"
                    ),
                )
                db.add(alert)
                alert_created = True

            await db.commit()
            step += 1
            await asyncio.sleep(2)


@router.post("/stress-test", response_model=StressTestResponse)
async def run_stress_test(
    payload: StressTestRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    # Resolve equipment_id
    equipment_id = payload.equipment_id

    if equipment_id is None:
        result = await db.execute(
            select(Equipment)
            .where(
                Equipment.object_id == payload.object_id,
                Equipment.type == EquipmentType.SERVER,
            )
            .limit(1)
        )
        equipment = result.scalar_one_or_none()

        if equipment is None:
            equipment = Equipment(
                object_id=payload.object_id,
                name="Demo Server",
                type=EquipmentType.SERVER,
                status=EquipmentStatus.ONLINE,
            )
            db.add(equipment)
            await db.commit()
            await db.refresh(equipment)

        equipment_id = equipment.id
    else:
        item = await db.get(Equipment, equipment_id)
        if not item:
            raise HTTPException(status_code=404, detail="Equipment not found")

    background_tasks.add_task(
        _stress_test_worker, equipment_id, payload.duration_seconds
    )

    return StressTestResponse(
        status="started",
        equipment_id=equipment_id,
        duration_seconds=payload.duration_seconds,
    )
