import math
from datetime import datetime, timedelta, timezone
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, join, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.models.database.models import Anomaly, Equipment, EquipmentType, Reading, Sensor, SeverityLevel
from app.models.reading import (
    HealthScore,
    PredictiveInsightItem,
    PredictiveInsights,
    RulPrediction,
    SensorSummary,
)
from app.services.ml_client import predict_equipment_rul
from app.services.stress_state import build_stress_predictive_insights, get_stress_step

router = APIRouter(prefix="/api/v1/analytics", tags=["Analytics"])


@router.get("/summary/{object_id}", response_model=List[SensorSummary])
async def get_object_summary(
    object_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    latest_point = await db.scalar(
        select(func.max(Reading.time))
        .join(Sensor, Sensor.id == Reading.sensor_id)
        .where(Sensor.object_id == object_id)
    )

    if latest_point is None:
        return []

    seven_days_ago = latest_point - timedelta(days=7)

    query = (
        select(
            Sensor.id.label("sensor_id"),
            Sensor.label.label("sensor_label"),
            Sensor.category.label("category"),
            Sensor.unit.label("unit"),
            func.avg(Reading.value).label("average"),
            func.min(Reading.value).label("minimum"),
            func.max(Reading.value).label("maximum"),
            func.count().label("readings_count"),
        )
        .select_from(join(Sensor, Reading, Sensor.id == Reading.sensor_id))
        .where(
            Sensor.object_id == object_id,
            Reading.time >= seven_days_ago
        )
        .group_by(Sensor.id, Sensor.label, Sensor.category, Sensor.unit)
        .order_by(Sensor.label.asc(), Sensor.category.asc())
    )

    result = await db.execute(query)
    rows = result.all()

    return [
        SensorSummary(
            sensor_id=row.sensor_id,
            sensor_label=row.sensor_label,
            category=row.category.value if hasattr(row.category, "value") else str(row.category),
            unit=row.unit,
            average=round(row.average, 3),
            minimum=round(row.minimum, 3),
            maximum=round(row.maximum, 3),
            readings_count=row.readings_count,
        )
        for row in rows
    ]


@router.get("/health/{object_id}", response_model=HealthScore)
async def get_object_health(
    object_id: UUID,
    since: datetime | None = Query(None, description="Only count anomalies detected after this time (ISO 8601)"),
    db: AsyncSession = Depends(get_db),
):
    cutoff = since if since is not None else datetime.now(timezone.utc) - timedelta(days=7)
    if cutoff.tzinfo is None:
        cutoff = cutoff.replace(tzinfo=timezone.utc)

    query = (
        select(Anomaly.severity, Anomaly.detected_at)
        .join(Sensor, Sensor.id == Anomaly.sensor_id)
        .where(
            Sensor.object_id == object_id,
            Anomaly.detected_at >= cutoff,
        )
    )
    rows = (await db.execute(query)).all()

    now = datetime.now(timezone.utc)
    severity_weights = {
        SeverityLevel.CRITICAL.value: 25,
        SeverityLevel.HIGH.value: 15,
        SeverityLevel.MEDIUM.value: 5,
        SeverityLevel.LOW.value: 2,
    }
    counts: dict[str, int] = {}
    weighted_penalty = 0.0

    for row in rows:
        sev = row.severity.value if hasattr(row.severity, "value") else str(row.severity)
        counts[sev] = counts.get(sev, 0) + 1
        detected = row.detected_at
        if detected.tzinfo is None:
            detected = detected.replace(tzinfo=timezone.utc)
        age_hours = (now - detected).total_seconds() / 3600
        # Exponential decay: half-weight after 72 h so old anomalies fade naturally
        decay = math.exp(-0.693 * age_hours / 72)
        weighted_penalty += severity_weights.get(sev, 2) * decay

    critical = counts.get(SeverityLevel.CRITICAL.value, 0)
    high = counts.get(SeverityLevel.HIGH.value, 0)
    medium = counts.get(SeverityLevel.MEDIUM.value, 0)
    low = counts.get(SeverityLevel.LOW.value, 0)

    score = max(0.0, min(100.0, 100.0 - weighted_penalty))
    grade = "A" if score >= 85 else "B" if score >= 65 else "C" if score >= 40 else "D"

    return HealthScore(
        object_id=object_id,
        score=round(score, 1),
        grade=grade,
        critical=critical,
        high=high,
        medium=medium,
        low=low,
    )


@router.get("/rul/{object_id}", response_model=RulPrediction)
async def get_object_rul(
    object_id: UUID,
    since: datetime | None = Query(None, description="Only count anomalies detected after this time (ISO 8601)"),
    db: AsyncSession = Depends(get_db),
):
    latest_point = await db.scalar(
        select(func.max(Reading.time))
        .join(Sensor, Sensor.id == Reading.sensor_id)
        .where(Sensor.object_id == object_id)
    )

    if since is not None:
        cutoff = since
    elif latest_point is not None:
        anchor = latest_point if latest_point.tzinfo else latest_point.replace(tzinfo=timezone.utc)
        cutoff = anchor - timedelta(days=30)
    else:
        cutoff = datetime.now(timezone.utc) - timedelta(days=30)

    if cutoff.tzinfo is None:
        cutoff = cutoff.replace(tzinfo=timezone.utc)

    query = (
        select(Anomaly.severity, func.count().label("cnt"))
        .join(Sensor, Sensor.id == Anomaly.sensor_id)
        .where(
            Sensor.object_id == object_id,
            Anomaly.detected_at >= cutoff,
        )
        .group_by(Anomaly.severity)
    )
    rows = (await db.execute(query)).all()

    counts: dict[str, int] = {
        r.severity.value if hasattr(r.severity, "value") else str(r.severity): r.cnt for r in rows
    }
    critical = counts.get(SeverityLevel.CRITICAL.value, 0)
    high = counts.get(SeverityLevel.HIGH.value, 0)
    medium = counts.get(SeverityLevel.MEDIUM.value, 0)
    low = counts.get(SeverityLevel.LOW.value, 0)
    total = critical + high + medium + low

    # Severity-weighted remaining useful life (days); weights match health score for consistent signals.
    burden = critical * 25 + high * 15 + medium * 5 + low * 2
    rul_days = max(0, min(365, int(365 - burden)))

    if rul_days >= 180:
        status = "ok"
    elif rul_days >= 60:
        status = "warning"
    else:
        status = "critical"

    if since is not None:
        confidence = "medium" if total > 0 else "high"
    elif latest_point is None:
        confidence = "low"
    elif total == 0:
        confidence = "high"
    elif total < 15:
        confidence = "medium"
    else:
        confidence = "low"

    heuristic = RulPrediction(
        object_id=object_id,
        rul_days=rul_days,
        status=status,
        confidence=confidence,
    )

    eq_result = await db.execute(
        select(Equipment.id)
        .where(Equipment.object_id == object_id, Equipment.type == EquipmentType.SERVER)
        .limit(1)
    )
    equipment_id = eq_result.scalar_one_or_none()
    if equipment_id is None:
        return heuristic

    ml_pred = await predict_equipment_rul(str(equipment_id))
    if not ml_pred:
        return heuristic

    ml_rul = int(ml_pred.get("rul_days", heuristic.rul_days))
    ml_status = ml_pred.get("status", heuristic.status)
    ml_confidence = ml_pred.get("confidence", heuristic.confidence)

    # Blend: ML signal on equipment current + anomaly burden from sensors.
    blended_rul = max(0, min(365, int((ml_rul + heuristic.rul_days) / 2)))
    if blended_rul >= 180:
        blended_status = "ok"
    elif blended_rul >= 60:
        blended_status = "warning"
    else:
        blended_status = "critical"

    return RulPrediction(
        object_id=object_id,
        rul_days=blended_rul,
        status=blended_status if total > 0 else ml_status,
        confidence=ml_confidence if ml_confidence != "low" else heuristic.confidence,
    )


@router.get("/predictions/{object_id}", response_model=PredictiveInsights)
async def get_predictive_insights(
    object_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now(timezone.utc)

    stress_step = await get_stress_step(db, object_id)
    if stress_step is not None:
        return build_stress_predictive_insights(object_id, stress_step, now)

    week_ago = now - timedelta(days=7)
    day_ago = now - timedelta(days=1)

    hourly = (
        select(
            func.date_trunc("hour", Reading.time).label("bucket"),
            func.avg(Reading.value).label("avg_w"),
        )
        .join(Sensor, Sensor.id == Reading.sensor_id)
        .where(Sensor.object_id == object_id, Reading.time >= week_ago)
        .group_by("bucket")
        .order_by("bucket")
    )
    rows = (await db.execute(hourly)).all()

    if len(rows) < 12:
        empty = PredictiveInsightItem(
            kind="unknown",
            title="Недостаточно данных",
            summary="Запустите seed_demo.py для накопления телеметрии (рекомендуется 30–45 дней).",
            horizon_days=3,
            confidence="low",
        )
        return PredictiveInsights(
            object_id=object_id,
            generated_at=now,
            spike_risk=empty.model_copy(update={"kind": "spike_risk", "title": "Риск резкого скачка"}),
            consumption_growth=empty.model_copy(update={"kind": "consumption_growth", "title": "Рост потребления"}),
            savings_window=empty.model_copy(update={"kind": "savings_window", "title": "Окно экономии"}),
        )

    all_vals = [float(r.avg_w) for r in rows]
    recent_vals = []
    for r in rows:
        bucket = r.bucket
        if bucket.tzinfo is None:
            bucket = bucket.replace(tzinfo=timezone.utc)
        if bucket >= day_ago:
            recent_vals.append(float(r.avg_w))
    if not recent_vals:
        recent_vals = all_vals[-24:]

    baseline = sum(all_vals) / len(all_vals)
    recent = sum(recent_vals) / len(recent_vals)
    growth_pct = ((recent - baseline) / baseline * 100) if baseline > 0 else 0.0
    projected_3d = round(growth_pct * 1.15, 1)

    def _std(vals: list[float]) -> float:
        if len(vals) < 2:
            return 0.0
        m = sum(vals) / len(vals)
        return (sum((v - m) ** 2 for v in vals) / len(vals)) ** 0.5

    vol_ratio = (_std(recent_vals) / _std(all_vals)) if _std(all_vals) > 0 else 1.0
    if vol_ratio >= 1.35 or growth_pct >= 12:
        risk_level, risk_conf = "high", "medium"
        spike_summary = (
            f"Волатильность за 24 ч выше базовой в {vol_ratio:.1f}×. "
            f"Вероятность резкого отклонения в ближайшие 3 дня повышена."
        )
    elif vol_ratio >= 1.15 or growth_pct >= 6:
        risk_level, risk_conf = "medium", "medium"
        spike_summary = (
            f"Наблюдается умеренный рост нестабильности (+{(vol_ratio - 1) * 100:.0f}% к базовой σ). "
            f"Рекомендуется мониторинг линии серверов и охлажения."
        )
    else:
        risk_level, risk_conf = "low", "high"
        spike_summary = "Профиль нагрузки стабилен — резких скачков в ближайшие 3 дня не ожидается."

    by_hour: dict[int, list[float]] = {h: [] for h in range(24)}
    for r in rows:
        by_hour[r.bucket.hour].append(float(r.avg_w))
    hour_avg = {h: (sum(v) / len(v) if v else baseline) for h, v in by_hour.items()}
    best_start = min(range(24), key=lambda h: hour_avg[h])
    best_end = (best_start + 3) % 24
    low_load = hour_avg[best_start]
    savings_pct = round((baseline - low_load) / baseline * 100 * 0.15, 1) if baseline > 0 else 0.0
    window_label = f"{best_start:02d}:00–{(best_start + 3) % 24:02d}:00"

    growth_dir = "рост" if projected_3d >= 0 else "снижение"
    growth_summary = (
        f"Прогноз {growth_dir} суммарного потребления на {abs(projected_3d):.1f}% "
        f"за 3 дня (тренд по последним 24 ч vs 7-дневная база)."
    )

    return PredictiveInsights(
        object_id=object_id,
        generated_at=now,
        spike_risk=PredictiveInsightItem(
            kind="spike_risk",
            title="Риск резкого изменения",
            summary=spike_summary,
            horizon_days=3,
            confidence=risk_conf,
            risk_level=risk_level,
        ),
        consumption_growth=PredictiveInsightItem(
            kind="consumption_growth",
            title="Прогноз потребления",
            summary=growth_summary,
            horizon_days=3,
            confidence="medium" if len(rows) >= 48 else "low",
            impact_pct=projected_3d,
        ),
        savings_window=PredictiveInsightItem(
            kind="savings_window",
            title="Окно экономии тока",
            summary=(
                f"Минимальная нагрузка исторически в {window_label}. "
                f"Снижение подачи на 15% в этом окне даст ~{savings_pct:.1f}% экономии суточного бюджета."
            ),
            horizon_days=3,
            confidence="medium",
            window_label=window_label,
            impact_pct=savings_pct,
        ),
    )
