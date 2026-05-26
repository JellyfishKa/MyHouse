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
    Anomaly,
    Equipment,
    EquipmentReading,
    EquipmentStatus,
    EquipmentType,
    Reading,
    Sensor,
    SensorCategory,
    SeverityLevel,
)
from app.models.reading import StressTestRequest, StressTestResponse

router = APIRouter(prefix="/api/v1/demo", tags=["demo"])

# step -> (kind, category, severity, message for alert)
STRESS_SCHEDULE: list[tuple[int, str, SensorCategory | None, SeverityLevel, str]] = [
    (
        5,
        "alert",
        None,
        SeverityLevel.LOW,
        "Предупреждение: через ~20 с ожидается отклонение тока",
    ),
    (
        15,
        "anomaly",
        SensorCategory.SERVERS,
        SeverityLevel.LOW,
        "Стресс-тест: отклонение на линии серверов (low)",
    ),
    (
        30,
        "anomaly",
        SensorCategory.COOLING,
        SeverityLevel.MEDIUM,
        "Стресс-тест: рост нагрузки охлаждения (medium)",
    ),
    (
        60,
        "anomaly",
        SensorCategory.UPS,
        SeverityLevel.HIGH,
        "Стресс-тест: нестабильность ИБП (high)",
    ),
    (
        90,
        "anomaly",
        SensorCategory.SERVERS,
        SeverityLevel.CRITICAL,
        "Стресс-тест: критическое превышение на серверах",
    ),
    (
        90,
        "alert",
        None,
        SeverityLevel.CRITICAL,
        "Стресс-тест: критический ток — требуется вмешательство",
    ),
]

SENSOR_PROFILES = [
    (1.00, 0.5, True),
    (0.60, 0.3, False),
    (0.35, 0.2, True),
    (0.15, 0.1, False),
]

CATEGORY_BASE_W: dict[SensorCategory, tuple[float, float]] = {
    SensorCategory.SERVERS: (220.0, 1.00),
    SensorCategory.COOLING: (185.0, 0.60),
    SensorCategory.UPS: (160.0, 0.35),
    SensorCategory.LIGHTING: (80.0, 0.15),
}

_SEVERITY_FACTOR: dict[SeverityLevel, float] = {
    SeverityLevel.LOW: 1.08,
    SeverityLevel.MEDIUM: 1.15,
    SeverityLevel.HIGH: 1.28,
    SeverityLevel.CRITICAL: 1.42,
}


def _daily_factor(hour: int) -> float:
    return (
        1.0
        + 0.28 * max(0.0, min(1.0, (hour - 7) / 3))
        - 0.18 * max(0.0, min(1.0, (hour - 19) / 3))
    )


def _category_baseline_w(category: SensorCategory, hour: int) -> float:
    base, mult = CATEGORY_BASE_W.get(category, (200.0, 1.0))
    return base * mult * _daily_factor(hour)


def _anomaly_values(category: SensorCategory, severity: SeverityLevel, hour: int) -> tuple[float, float]:
    expected = _category_baseline_w(category, hour)
    actual = expected * _SEVERITY_FACTOR.get(severity, 1.10)
    return round(actual, 3), round(expected, 3)


async def _stress_test_worker(equipment_id: uuid.UUID, duration_sec: int) -> None:
    from app.core.db import async_session_local

    step = 0
    deadline = datetime.now(timezone.utc) + timedelta(seconds=duration_sec)
    fired: set[tuple[int, str, str]] = set()

    async with async_session_local() as db:
        equipment = await db.get(Equipment, equipment_id)
        object_id = equipment.object_id if equipment else None

        sensor_by_cat: dict[SensorCategory, uuid.UUID] = {}
        sensor_ids: list[uuid.UUID] = []
        if object_id:
            result = await db.execute(
                sa_select(Sensor.id, Sensor.category).where(Sensor.object_id == object_id)
            )
            for sid, cat in result.all():
                sensor_ids.append(sid)
                sensor_by_cat[cat] = sid

        while datetime.now(timezone.utc) < deadline:
            now = datetime.now(timezone.utc)
            hour = now.hour
            stress_boost = 1.0 + min(step * 0.012, 0.35)
            spike_amp = min(step * 0.08, 0.25)

            base_current = 9.0 + 2.5 * _daily_factor(hour) + step * 0.04

            eq_readings = [
                EquipmentReading(
                    time=now - timedelta(seconds=i),
                    equipment_id=equipment_id,
                    current_a=round(
                        base_current + random.gauss(0, 0.25) + (spike_amp if i < 2 else 0),
                        3,
                    ),
                    voltage_v=round(random.gauss(220, 1.5), 2),
                    power_kw=round(base_current * 220 / 1000, 3),
                )
                for i in range(10)
            ]
            db.add_all(eq_readings)

            cat_order = [
                SensorCategory.SERVERS,
                SensorCategory.COOLING,
                SensorCategory.UPS,
                SensorCategory.LIGHTING,
            ]
            for i, cat in enumerate(cat_order):
                sensor_id = sensor_by_cat.get(cat)
                if not sensor_id:
                    continue
                mult, noise, can_spike = SENSOR_PROFILES[i]
                baseline = _category_baseline_w(cat, hour)
                spike = (baseline * spike_amp * mult) if (can_spike and step % 3 == 0) else 0
                db.add(
                    Reading(
                        time=now,
                        sensor_id=sensor_id,
                        value=round(baseline * stress_boost + random.gauss(0, noise * baseline * 0.02) + spike, 3),
                    )
                )

            for sched_step, kind, category, severity, message in STRESS_SCHEDULE:
                key = (sched_step, kind, severity.value)
                if step >= sched_step and key not in fired:
                    fired.add(key)
                    if kind == "alert":
                        db.add(
                            Alert(
                                equipment_id=equipment_id,
                                severity=severity,
                                message=message,
                            )
                        )
                    elif kind == "anomaly" and category and category in sensor_by_cat:
                        actual, expected = _anomaly_values(category, severity, hour)
                        db.add(
                            Anomaly(
                                sensor_id=sensor_by_cat[category],
                                detected_at=now,
                                severity=severity,
                                value=actual,
                                expected_value=expected,
                            )
                        )

            await db.commit()
            step += 1
            await asyncio.sleep(2)


@router.post("/stress-test", response_model=StressTestResponse)
async def run_stress_test(
    payload: StressTestRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
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
