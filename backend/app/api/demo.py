import asyncio
import math
import random
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
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
from app.models.reading import (
    StressCancelRequest,
    StressCancelResponse,
    StressStatusResponse,
    StressTestRequest,
    StressTestResponse,
)
from app.services.stress_state import (
    begin_stress_session,
    clear_stress,
    get_stress_session,
    request_stress_cancel,
    session_is_active,
    set_stress_step,
)

router = APIRouter(prefix="/api/v1/demo", tags=["demo"])

STRESS_DEFAULT_DURATION_SEC = 180  # 3 minutes
STRESS_TICK_SEC = 2

# Step thresholds (1 step = 2 s). predict → precursor → anomaly (early warning for demo).
S = {
    "spike_predict": 1,
    "spike_precursor": 5,
    "spike": 9,
    "drift_predict": 10,
    "cooling_predict": 13,
    "cooling_precursor": 16,
    "cooling_plateau": 18,
    "lighting_predict": 21,
    "lighting_precursor": 26,
    "lighting_low": 29,
    "ups_predict": 31,
    "ups_precursor": 34,
    "ups_osc": 36,
    "critical_predict": 45,
    "critical_precursor": 49,
    "critical_plateau": 53,
    "finale": 54,
    "servers_drift_end": 17,
    "cooling_end": 29,
    "lighting_end": 39,
    "ups_end": 51,
}

# kind: predict | precursor | anomaly | alert
STRESS_SCHEDULE: list[tuple[int, str, SensorCategory | None, SeverityLevel, str, str]] = [
    (
        S["spike_predict"],
        "predict",
        SensorCategory.SERVERS,
        SeverityLevel.LOW,
        "Прогноз · 7 дн.: риск spike на серверах — тренд σ +22%",
        "",
    ),
    (
        S["spike_precursor"],
        "precursor",
        SensorCategory.SERVERS,
        SeverityLevel.LOW,
        "Сигнал · 2 дн.: spike на серверах — ML confidence 78%",
        "",
    ),
    (
        S["spike"],
        "anomaly",
        SensorCategory.SERVERS,
        SeverityLevel.LOW,
        "Подтверждено: spike · серверы",
        "spike",
    ),
    (
        S["drift_predict"],
        "predict",
        SensorCategory.SERVERS,
        SeverityLevel.LOW,
        "Прогноз · 7 дн.: восходящий drift серверов — +0.8%/сут",
        "",
    ),
    (
        S["cooling_predict"],
        "predict",
        SensorCategory.COOLING,
        SeverityLevel.MEDIUM,
        "Прогноз · 7 дн.: plateau ↑ охлаждение — устойчивый перегруз",
        "",
    ),
    (
        S["cooling_precursor"],
        "precursor",
        SensorCategory.COOLING,
        SeverityLevel.MEDIUM,
        "Сигнал · 2 дн.: рост нагрузки охлаждения — confidence 81%",
        "",
    ),
    (
        S["cooling_plateau"],
        "anomaly",
        SensorCategory.COOLING,
        SeverityLevel.MEDIUM,
        "Подтверждено: plateau ↑ · охлаждение",
        "plateau_high",
    ),
    (
        S["lighting_predict"],
        "predict",
        SensorCategory.LIGHTING,
        SeverityLevel.MEDIUM,
        "Прогноз · 30 дн.: underconsumption ↓ освещение — аномальное снижение",
        "",
    ),
    (
        S["lighting_precursor"],
        "precursor",
        SensorCategory.LIGHTING,
        SeverityLevel.MEDIUM,
        "Сигнал · 7 дн.: пониженное потребление освещения",
        "",
    ),
    (
        S["lighting_low"],
        "anomaly",
        SensorCategory.LIGHTING,
        SeverityLevel.MEDIUM,
        "Подтверждено: underconsumption ↓ · освещение",
        "plateau_low",
    ),
    (
        S["ups_predict"],
        "predict",
        SensorCategory.UPS,
        SeverityLevel.HIGH,
        "Прогноз · 7 дн.: oscillation ИБП — нестабильность ±12%",
        "",
    ),
    (
        S["ups_precursor"],
        "precursor",
        SensorCategory.UPS,
        SeverityLevel.HIGH,
        "Сигнал · 2 дн.: колебания нагрузки ИБП — confidence 85%",
        "",
    ),
    (
        S["ups_osc"],
        "anomaly",
        SensorCategory.UPS,
        SeverityLevel.HIGH,
        "Подтверждено: oscillation · ИБП",
        "oscillation",
    ),
    (
        S["critical_predict"],
        "predict",
        SensorCategory.SERVERS,
        SeverityLevel.CRITICAL,
        "Прогноз · 30 дн.: critical plateau серверов — риск +42%",
        "",
    ),
    (
        S["critical_precursor"],
        "precursor",
        SensorCategory.SERVERS,
        SeverityLevel.CRITICAL,
        "Сигнал · 2 дн.: критический plateau серверов — confidence 92%",
        "",
    ),
    (
        S["critical_plateau"],
        "anomaly",
        SensorCategory.SERVERS,
        SeverityLevel.CRITICAL,
        "Подтверждено: critical plateau · серверы",
        "critical_plateau",
    ),
    (
        S["finale"],
        "alert",
        None,
        SeverityLevel.CRITICAL,
        "Демо завершено: spike → drift → plateau → underconsumption → oscillation",
        "",
    ),
]

CATEGORY_BASE_W: dict[SensorCategory, tuple[float, float]] = {
    SensorCategory.SERVERS: (220.0, 1.00),
    SensorCategory.COOLING: (185.0, 0.60),
    SensorCategory.UPS: (160.0, 0.35),
    SensorCategory.LIGHTING: (80.0, 0.15),
}

_PATTERN_FACTOR: dict[str, float] = {
    "spike": 1.10,
    "drift": 1.12,
    "plateau_high": 1.15,
    "plateau_low": 0.72,
    "oscillation": 1.14,
    "critical_plateau": 1.42,
}

_active_stress_workers: set[uuid.UUID] = set()
_active_stress_objects: set[uuid.UUID] = set()
_stress_cancel_objects: set[uuid.UUID] = set()


def _daily_factor(hour: int) -> float:
    return (
        1.0
        + 0.28 * max(0.0, min(1.0, (hour - 7) / 3))
        - 0.18 * max(0.0, min(1.0, (hour - 19) / 3))
    )


def _category_baseline_w(category: SensorCategory, hour: int) -> float:
    base, mult = CATEGORY_BASE_W.get(category, (200.0, 1.0))
    return base * mult * _daily_factor(hour)


def _pattern_multiplier(category: SensorCategory, step: int) -> float:
    """Continuous telemetry patterns for live chart (not just point anomalies)."""
    if category == SensorCategory.SERVERS:
        if step < S["spike"]:
            return 1.0
        if step < S["servers_drift_end"]:
            base = 1.10 if step == S["spike"] else 1.08
            return base + (step - S["spike"]) * 0.011
        if step < S["critical_plateau"]:
            return 1.12 + (step - S["servers_drift_end"]) * 0.003
        return 1.42

    if category == SensorCategory.COOLING:
        if step < S["cooling_plateau"]:
            return 1.0
        if step < S["cooling_end"]:
            return 1.15 + 0.015 * math.sin(step * 0.7)
        return 1.12

    if category == SensorCategory.LIGHTING:
        if step < S["lighting_low"]:
            return 1.0
        if step < S["lighting_end"]:
            return 0.72
        return 0.88

    if category == SensorCategory.UPS:
        if step < S["ups_osc"]:
            return 1.0
        if step < S["ups_end"]:
            return 1.0 + 0.12 * math.sin(step * 0.85)
        return 1.18

    return 1.0


def _anomaly_values(
    category: SensorCategory,
    hour: int,
    pattern: str,
) -> tuple[float, float]:
    expected = _category_baseline_w(category, hour)
    factor = _PATTERN_FACTOR.get(pattern, 1.10)
    actual = expected * factor
    return round(actual, 3), round(expected, 3)


def _sensor_reading_value(category: SensorCategory, step: int, hour: int, rng: random.Random) -> float:
    baseline = _category_baseline_w(category, hour)
    mult = _pattern_multiplier(category, step)
    noise = rng.gauss(0, baseline * 0.015)
    return round(max(1.0, baseline * mult + noise), 3)


async def _stress_test_worker(equipment_id: uuid.UUID, duration_sec: int) -> None:
    from app.core.db import async_session_local

    _active_stress_workers.add(equipment_id)
    step = 0
    object_id: uuid.UUID | None = None
    deadline = datetime.now(timezone.utc) + timedelta(seconds=duration_sec)
    fired: set[tuple[int, str, str, str, str]] = set()
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

            if object_id:
                _active_stress_objects.add(object_id)

            while True:
                now = datetime.now(timezone.utc)
                if now >= deadline or object_id in _stress_cancel_objects:
                    break
                if object_id:
                    live_session = await get_stress_session(db, object_id)
                    if live_session and live_session.cancelled_at is not None:
                        break
                hour = now.hour
                base_current = 9.0 + 2.5 * _daily_factor(hour)

                servers_mult = _pattern_multiplier(SensorCategory.SERVERS, step)
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

                for sched_step, kind, category, severity, message, pattern in STRESS_SCHEDULE:
                    cat_key = category.value if category else "none"
                    key = (sched_step, kind, cat_key, severity.value, pattern)
                    if step >= sched_step and key not in fired:
                        fired.add(key)
                        if kind in ("predict", "precursor", "alert"):
                            db.add(
                                Alert(
                                    equipment_id=equipment_id,
                                    severity=severity,
                                    message=message,
                                )
                            )
                        elif kind == "anomaly" and category and category in sensor_by_cat and pattern:
                            actual, expected = _anomaly_values(category, hour, pattern)
                            db.add(
                                Anomaly(
                                    sensor_id=sensor_by_cat[category],
                                    detected_at=now,
                                    severity=severity,
                                    value=actual,
                                    expected_value=expected,
                                )
                            )

                if object_id:
                    await set_stress_step(db, object_id, step, equipment_id)

                await db.commit()
                step += 1
                await asyncio.sleep(STRESS_TICK_SEC)
    finally:
        _active_stress_workers.discard(equipment_id)
        if object_id:
            _active_stress_objects.discard(object_id)
            _stress_cancel_objects.discard(object_id)
            async with async_session_local() as db:
                await clear_stress(db, object_id)
                await db.commit()


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
        lock_object_id = payload.object_id
    else:
        item = await db.get(Equipment, equipment_id)
        if not item:
            raise HTTPException(status_code=404, detail="Equipment not found")
        lock_object_id = item.object_id

    existing = await get_stress_session(db, lock_object_id)
    if existing and session_is_active(existing):
        started = existing.started_at
        if started and started.tzinfo is None:
            started = started.replace(tzinfo=timezone.utc)
        return StressTestResponse(
            status="joined",
            equipment_id=existing.equipment_id or equipment_id,
            duration_seconds=existing.duration_seconds or payload.duration_seconds,
            started_at=started,
            step=existing.step,
        )

    if lock_object_id in _active_stress_objects:
        _active_stress_objects.discard(lock_object_id)

    if equipment_id in _active_stress_workers:
        raise HTTPException(
            status_code=409,
            detail="Stress test already running for this equipment",
        )

    try:
        await begin_stress_session(db, lock_object_id, equipment_id, payload.duration_seconds)
        await db.commit()
    except IntegrityError:
        await db.rollback()
        existing = await get_stress_session(db, lock_object_id)
        if existing and session_is_active(existing):
            started = existing.started_at
            if started and started.tzinfo is None:
                started = started.replace(tzinfo=timezone.utc)
            return StressTestResponse(
                status="joined",
                equipment_id=existing.equipment_id or equipment_id,
                duration_seconds=existing.duration_seconds or payload.duration_seconds,
                started_at=started,
                step=existing.step,
            )
        raise HTTPException(status_code=409, detail="Stress test already running") from None

    background_tasks.add_task(
        _stress_test_worker, equipment_id, payload.duration_seconds
    )

    session = await get_stress_session(db, lock_object_id)
    started = session.started_at if session else datetime.now(timezone.utc)

    return StressTestResponse(
        status="started",
        equipment_id=equipment_id,
        duration_seconds=payload.duration_seconds,
        started_at=started,
        step=0,
    )


@router.post("/stress-test/cancel", response_model=StressCancelResponse)
async def cancel_stress_test(
    payload: StressCancelRequest,
    db: AsyncSession = Depends(get_db),
):
    object_id = payload.object_id
    session = await get_stress_session(db, object_id)
    if not session_is_active(session) and object_id not in _active_stress_objects:
        await clear_stress(db, object_id)
        await db.commit()
        return StressCancelResponse(status="not_running", object_id=object_id)

    await request_stress_cancel(db, object_id)
    await db.commit()
    _stress_cancel_objects.add(object_id)
    return StressCancelResponse(status="cancelling", object_id=object_id)


@router.get("/stress-status/{object_id}", response_model=StressStatusResponse)
async def get_stress_status(
    object_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    session = await get_stress_session(db, object_id)
    active = session_is_active(session) or object_id in _active_stress_objects
    ends_at = None
    if session and session.started_at:
        started = session.started_at
        if started.tzinfo is None:
            started = started.replace(tzinfo=timezone.utc)
        duration = session.duration_seconds or STRESS_DEFAULT_DURATION_SEC
        ends_at = started + timedelta(seconds=duration)
    return StressStatusResponse(
        active=active,
        object_id=object_id,
        equipment_id=session.equipment_id if session else None,
        step=session.step if session else None,
        started_at=session.started_at if session else None,
        duration_seconds=session.duration_seconds if session else None,
        ends_at=ends_at,
    )
