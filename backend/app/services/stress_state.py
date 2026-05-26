"""Live stress-test step tracker (PostgreSQL-backed for multi-worker prod)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import delete, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database.models import StressSession
from app.models.reading import PredictiveInsightItem, PredictiveInsights

STRESS_DEFAULT_DURATION_SEC = 180

# L1 cache — same worker reads after write; DB is source of truth across workers.
_stress_steps: dict[UUID, int] = {}


def _ensure_tz(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def session_is_active(session: StressSession | None, *, now: datetime | None = None) -> bool:
    if session is None or session.cancelled_at is not None or session.started_at is None:
        return False
    started = _ensure_tz(session.started_at)
    duration = session.duration_seconds or STRESS_DEFAULT_DURATION_SEC
    current = now or datetime.now(timezone.utc)
    return current < started + timedelta(seconds=duration)


async def begin_stress_session(
    db: AsyncSession,
    object_id: UUID,
    equipment_id: UUID,
    duration_seconds: int,
) -> datetime:
    now = datetime.now(timezone.utc)
    _stress_steps[object_id] = 0
    stmt = insert(StressSession).values(
        object_id=object_id,
        step=0,
        equipment_id=equipment_id,
        started_at=now,
        duration_seconds=duration_seconds,
        cancelled_at=None,
        updated_at=now,
    )
    await db.execute(stmt)
    return now


async def set_stress_step(
    db: AsyncSession,
    object_id: UUID,
    step: int,
    equipment_id: UUID | None = None,
) -> None:
    _stress_steps[object_id] = step
    values: dict = {
        "object_id": object_id,
        "step": step,
        "updated_at": datetime.now(timezone.utc),
    }
    if equipment_id is not None:
        values["equipment_id"] = equipment_id
    stmt = insert(StressSession).values(**values).on_conflict_do_update(
        index_elements=["object_id"],
        set_={
            "step": step,
            "updated_at": datetime.now(timezone.utc),
            **({"equipment_id": equipment_id} if equipment_id is not None else {}),
        },
    )
    await db.execute(stmt)


async def request_stress_cancel(db: AsyncSession, object_id: UUID) -> None:
    now = datetime.now(timezone.utc)
    await db.execute(
        update(StressSession)
        .where(StressSession.object_id == object_id)
        .values(cancelled_at=now, updated_at=now)
    )


async def clear_stress(db: AsyncSession, object_id: UUID) -> None:
    _stress_steps.pop(object_id, None)
    await db.execute(delete(StressSession).where(StressSession.object_id == object_id))


async def get_stress_step(db: AsyncSession, object_id: UUID) -> int | None:
    cached = _stress_steps.get(object_id)
    if cached is not None:
        return cached

    row = await db.scalar(
        select(StressSession.step).where(StressSession.object_id == object_id)
    )
    if row is not None:
        _stress_steps[object_id] = row
    return row


async def get_stress_session(db: AsyncSession, object_id: UUID) -> StressSession | None:
    return await db.scalar(
        select(StressSession).where(StressSession.object_id == object_id)
    )


def _item(
    kind: str,
    title: str,
    summary: str,
    horizon_days: int,
    confidence: str,
    *,
    risk_level: str | None = None,
    impact_pct: float | None = None,
    window_label: str | None = None,
) -> PredictiveInsightItem:
    return PredictiveInsightItem(
        kind=kind,
        title=title,
        summary=summary,
        horizon_days=horizon_days,
        confidence=confidence,
        risk_level=risk_level,
        impact_pct=impact_pct,
        window_label=window_label,
    )


def build_stress_predictive_insights(object_id: UUID, step: int, now: datetime) -> PredictiveInsights:
    """Dynamic 2 / 7 / 30-day forecasts synced with live stress-test step."""
    spike = _item(
        "spike_risk",
        "Риск резкого изменения",
        "Профиль стабилен — ML мониторит σ по 7-дневной базе.",
        7,
        "high",
        risk_level="low",
    )
    growth = _item(
        "consumption_growth",
        "Тренд потребления",
        "Суточный профиль в пределах сезонной нормы.",
        7,
        "high",
        impact_pct=0.0,
    )
    savings = _item(
        "savings_window",
        "Окно оптимизации",
        "Исторически минимальная нагрузка 02:00–05:00 — окно для снижения подачи.",
        30,
        "medium",
        window_label="02:00–05:00",
        impact_pct=4.2,
    )

    if step >= 1:
        spike = _item(
            "spike_risk",
            "Spike · серверы",
            "ML: σ +22% к 7-дневной базе — повышенный риск кратковременного скачка.",
            7,
            "medium",
            risk_level="medium",
        )
    if step >= 5:
        spike = _item(
            "spike_risk",
            "Spike · серверы",
            "Сигнал подтверждён: confidence 78% — ожидается отклонение в ближайшие 2 дня.",
            2,
            "high",
            risk_level="high",
        )
    if step >= 9:
        spike = _item(
            "spike_risk",
            "Spike · подтверждено",
            "Аномалия зафиксирована на линии серверов — модель обновляет baseline.",
            2,
            "high",
            risk_level="high",
        )

    if step >= 10:
        growth = _item(
            "consumption_growth",
            "Drift · серверы",
            "Восходящий тренд +0.8%/сут — прогноз роста на 7 дней.",
            7,
            "medium",
            impact_pct=5.6,
        )
    if step >= 13:
        growth = _item(
            "consumption_growth",
            "Plateau ↑ · охлаждение",
            "Устойчивый перегруз контура охлаждения — риск +15% к недельной норме.",
            7,
            "medium",
            impact_pct=15.0,
            risk_level="medium",
        )
    if step >= 16:
        growth = _item(
            "consumption_growth",
            "Plateau ↑ · охлаждение",
            "Сигнал 2 дня: confidence 81% — plateau на линии охлаждения.",
            2,
            "high",
            impact_pct=15.0,
        )
    if step >= 18:
        growth = _item(
            "consumption_growth",
            "Plateau ↑ · подтверждено",
            "Стабильно повышенная нагрузка охлаждения — тренд закреплён.",
            7,
            "high",
            impact_pct=15.0,
        )

    if step >= 21:
        savings = _item(
            "savings_window",
            "Underconsumption ↓ · освещение",
            "Аномальное снижение −28% — проверить линию освещения (горизонт 30 дней).",
            30,
            "medium",
            impact_pct=-28.0,
        )
    if step >= 26:
        savings = _item(
            "savings_window",
            "Underconsumption ↓ · освещение",
            "Сигнал 7 дней: устойчиво пониженное потребление освещения.",
            7,
            "high",
            impact_pct=-28.0,
        )
    if step >= 29:
        savings = _item(
            "savings_window",
            "Underconsumption ↓ · подтверждено",
            "Девиация подтверждена — экономия не целевая, требуется диагностика.",
            7,
            "high",
            impact_pct=-28.0,
        )

    if step >= 31:
        spike = _item(
            "spike_risk",
            "Oscillation · ИБП",
            "Нестабильность ±12% — риск колебаний на горизонте 7 дней.",
            7,
            "medium",
            risk_level="medium",
        )
    if step >= 34:
        spike = _item(
            "spike_risk",
            "Oscillation · ИБП",
            "Сигнал 2 дня: confidence 85% — колебания нагрузки ИБП.",
            2,
            "high",
            risk_level="high",
        )
    if step >= 36:
        spike = _item(
            "spike_risk",
            "Oscillation · подтверждено",
            "Колебания ИБП зафиксированы — мониторинг стабилизации.",
            2,
            "high",
            risk_level="high",
        )

    if step >= 45:
        growth = _item(
            "consumption_growth",
            "Critical plateau · серверы",
            "Длительный перегруз +42% — критический тренд на 30 дней.",
            30,
            "medium",
            impact_pct=42.0,
            risk_level="high",
        )
    if step >= 49:
        growth = _item(
            "consumption_growth",
            "Critical plateau · серверы",
            "Сигнал 2 дня: confidence 92% — критический plateau серверов.",
            2,
            "high",
            impact_pct=42.0,
            risk_level="high",
        )
    if step >= 53:
        growth = _item(
            "consumption_growth",
            "Critical plateau · подтверждено",
            "Критическая девиация подтверждена — требуется вмешательство.",
            2,
            "high",
            impact_pct=42.0,
            risk_level="high",
        )

    return PredictiveInsights(
        object_id=object_id,
        generated_at=now,
        spike_risk=spike,
        consumption_growth=growth,
        savings_window=savings,
    )
