from datetime import datetime, timedelta, timezone
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, join, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.models.database.models import Anomaly, Reading, Sensor, SeverityLevel
from app.models.reading import (
    HealthScore,
    PredictiveInsightItem,
    PredictiveInsights,
    RulPrediction,
    SensorSummary,
)

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
        select(Anomaly.severity, func.count().label("cnt"))
        .join(Sensor, Sensor.id == Anomaly.sensor_id)
        .where(
            Sensor.object_id == object_id,
            Anomaly.detected_at >= cutoff,
        )
        .group_by(Anomaly.severity)
    )
    rows = (await db.execute(query)).all()

    counts: dict[str, int] = {r.severity.value if hasattr(r.severity, "value") else str(r.severity): r.cnt for r in rows}
    critical = counts.get(SeverityLevel.CRITICAL.value, 0)
    high = counts.get(SeverityLevel.HIGH.value, 0)
    medium = counts.get(SeverityLevel.MEDIUM.value, 0)
    low = counts.get(SeverityLevel.LOW.value, 0)

    score = max(0.0, 100.0 - (critical * 25 + high * 15 + medium * 5 + low * 2))
    grade = "A" if score >= 90 else "B" if score >= 75 else "C" if score >= 50 else "D"

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
    db: AsyncSession = Depends(get_db),
):
    thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)

    anomaly_count = await db.scalar(
        select(func.count())
        .select_from(Anomaly)
        .join(Sensor, Sensor.id == Anomaly.sensor_id)
        .where(
            Sensor.object_id == object_id,
            Anomaly.detected_at >= thirty_days_ago,
        )
    )

    rate = (anomaly_count or 0) / 30.0
    rul_days = max(7, int(365 - rate * 20))
    status = "ok" if rul_days >= 180 else "warning" if rul_days >= 60 else "critical"

    return RulPrediction(
        object_id=object_id,
        rul_days=rul_days,
        status=status,
        confidence="low",
    )


@router.get("/predictions/{object_id}", response_model=PredictiveInsights)
async def get_predictive_insights(
    object_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now(timezone.utc)
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
            summary="Запустите seed_demo.py для накопления телеметрии (рекомендуется 7 дней).",
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
        f"Прогноз {growth_dir}a суммарного потребления на {abs(projected_3d):.1f}% "
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
