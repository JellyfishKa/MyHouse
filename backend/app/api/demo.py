import asyncio
import random
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
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

# (step, kind, category, severity, message)
STRESS_SCHEDULE: list[tuple[int, str, SensorCategory | None, SeverityLevel, str]] = [
    (
        12,
        "alert",
        SensorCategory.SERVERS,
        SeverityLevel.LOW,
        "Предупреждение: через ~6 с ожидается отклонение на линии серверов",
    ),
    (
        15,
        "anomaly",
        SensorCategory.SERVERS,
        SeverityLevel.LOW,
        "Стресс-тест: отклонение на линии серверов (low)",
    ),
    (
        27,
        "alert",
        SensorCategory.COOLING,
        SeverityLevel.MEDIUM,
        "Предупреждение: через ~6 с ожидается рост нагрузки охлаждения",
    ),
    (
        30,
        "anomaly",
        SensorCategory.COOLING,
        SeverityLevel.MEDIUM,
        "Стресс-тест: рост нагрузки охлаждения (medium)",
    ),
    (
        57,
        "alert",
        SensorCategory.UPS,
        SeverityLevel.HIGH,
        "Предупреждение: через ~6 с ожидается нестабильность ИБП",
    ),
    (
        60,
        "anomaly",
        SensorCategory.UPS,
        SeverityLevel.HIGH,
        "Стресс-тест: нестабильность ИБП (high)",
    ),
    (
        87,
        "alert",
        SensorCategory.SERVERS,
        SeverityLevel.CRITICAL,
        "Предупреждение: через ~6 с ожидается критическое превышение на серверах",
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

# (from_step, category, multiplier) — последнее подходящее правило задаёт множитель
PHASE_MULTIPLIERS: list[tuple[int, SensorCategory, float]] = [
    (12, SensorCategory.SERVERS, 1.05),
    (15, SensorCategory.SERVERS, 1.08),
    (27, SensorCategory.COOLING, 1.05),
    (30, SensorCategory.COOLING, 1.15),
    (57, SensorCategory.UPS, 1.05),
    (60, SensorCategory.UPS, 1.28),
    (87, SensorCategory.SERVERS, 1.10),
    (90, SensorCategory.SERVERS, 1.42),
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

_active_stress_workers: set[uuid.UUID] = set()


def _daily_factor(hour: int) -> float:
    return (
        1.0
        + 0.28 * max(0.0, min(1.0, (hour - 7) / 3))
        - 0.18 * max(0.0, min(1.0, (hour - 19) / 3))
    )


def _category_baseline_w(category: SensorCategory, hour: int) -> float:
    base, mult = CATEGORY_BASE_W.get(category, (200.0, 1.0))
    return base * mult * _daily_factor(hour)


def _category_multiplier(category: SensorCategory, step: int) -> float:
    mult = 1.0
    for from_step, cat, m in PHASE_MULTIPLIERS:
        if cat == category and step >= from_step:
            mult = m
    return mult


def _anomaly_values(category: SensorCategory, severity: SeverityLevel, hour: int) -> tuple[float, float]:
    expected = _category_baseline_w(category, hour)
    actual = expected * _SEVERITY_FACTOR.get(severity, 1.10)
    return round(actual, 3), round(expected, 3)


def _sensor_reading_value(category: SensorCategory, step: int, hour: int, rng: random.Random) -> float:
    baseline = _category_baseline_w(category, hour)
    mult = _category_multiplier(category, step)
    noise = rng.gauss(0, baseline * 0.02)
    return round(max(1.0, baseline * mult + noise), 3)


async def _stress_test_worker(equipment_id: uuid.UUID, duration_sec: int) -> None:
    from app.core.db import async_session_local

    _active_stress_workers.add(equipment_id)
    step = 0
    deadline = datetime.now(timezone.utc) + timedelta(seconds=duration_sec)
    fired: set[tuple[int, str, str, str]] = set()
    rng = random.Random(42)

    try:
        async with async_session_local() as db:
            equipment = await db.get(Equipment, equipment_id)
            object_id = equipment.object_id if equipment else None

            sensor_by_cat: dict[SensorCategory, uuid.UUID] = {}
            if object_id:
                result = await db.execute(
                    select(Sensor.id, Sensor.category).where(Sensor.object_id == object_id)
                )
                for sid, cat in result.all():
                    sensor_by_cat[cat] = sid

            while datetime.now(timezone.utc) < deadline:
                now = datetime.now(timezone.utc)
                hour = now.hour
                base_current = 9.0 + 2.5 * _daily_factor(hour)

                servers_mult = _category_multiplier(SensorCategory.SERVERS, step)
                current_a = base_current * (0.9 + (servers_mult - 1.0) * 0.3)

                db.add(
                    EquipmentReading(
                        time=now,
                        equipment_id=equipment_id,
                        current_a=round(current_a + rng.gauss(0, 0.15), 3),
                        voltage_v=round(rng.gauss(220, 1.5), 2),
                        power_kw=round(current_a * 220 / 1000, 3),
                    )
                )

                for cat in [
                    SensorCategory.SERVERS,
                    SensorCategory.COOLING,
                    SensorCategory.UPS,
                    SensorCategory.LIGHTING,
                ]:
                    sensor_id = sensor_by_cat.get(cat)
                    if not sensor_id:
                        continue
                    db.add(
                        Reading(
                            time=now,
                            sensor_id=sensor_id,
                            value=_sensor_reading_value(cat, step, hour, rng),
                        )
                    )

                for sched_step, kind, category, severity, message in STRESS_SCHEDULE:
                    cat_key = category.value if category else "none"
                    key = (sched_step, kind, cat_key, severity.value)
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
    finally:
        _active_stress_workers.discard(equipment_id)


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

    if equipment_id in _active_stress_workers:
        raise HTTPException(
            status_code=409,
            detail="Stress test already running for this equipment",
        )

    background_tasks.add_task(
        _stress_test_worker, equipment_id, payload.duration_seconds
    )

    return StressTestResponse(
        status="started",
        equipment_id=equipment_id,
        duration_seconds=payload.duration_seconds,
    )
