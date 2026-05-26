"""
ML FastAPI microservice.

POST /api/v1/detect  — run anomaly detection for an object's sensors
GET  /health         — liveness probe
"""
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from db import (exclude_anomaly_windows, fetch_anomaly_times,
                fetch_equipment_ids_by_object, fetch_equipment_readings,
                fetch_readings, fetch_readings_by_object, insert_anomalies)
from models import MLModel
from rul_model import RULModel

app = FastAPI(title="ML Anomaly Detection Service")


class DetectRequest(BaseModel):
    object_id: Optional[UUID] = None
    sensor_id: Optional[UUID] = None
    days: int = 7


class DetectResponse(BaseModel):
    anomalies_found: int
    anomalies_inserted: int


class RetrainRequest(BaseModel):
    object_id: UUID
    days: int = 1
    exclude_since: Optional[datetime] = None


class RetrainResponse(BaseModel):
    windows_trained: int
    model_saved: bool


def classify_severity(value: float, expected: float) -> str:
    """Classify anomaly severity based on deviation from expected value."""
    if expected == 0:
        return "high"
    deviation = abs(value - expected) / abs(expected)
    if deviation > 0.5:
        return "critical"
    if deviation > 0.3:
        return "high"
    if deviation > 0.15:
        return "medium"
    return "low"


@app.get("/health")
async def health():
    return {"status": "ok", "service": "ml"}


@app.post("/api/v1/detect", response_model=DetectResponse)
async def detect_anomalies(request: DetectRequest):
    if not request.object_id and not request.sensor_id:
        raise HTTPException(
            status_code=400,
            detail="Provide either object_id or sensor_id"
        )

    if request.object_id:
        df = fetch_readings_by_object(str(request.object_id), request.days)
    else:
        df = fetch_readings(str(request.sensor_id), request.days)

    if df.empty:
        return DetectResponse(anomalies_found=0, anomalies_inserted=0)

    # Group by sensor and run detection per sensor
    all_anomalies = []

    if "sensor_id" in df.columns:
        sensor_groups = df.groupby("sensor_id")
    else:
        sensor_groups = [("single", df)]

    for sensor_id_val, sensor_df in sensor_groups:
        if len(sensor_df) < 10:
            continue

        # Prepare data for MLModel: needs 'time' column + value columns
        ml_input = sensor_df[["time", "value"]].copy()
        ml_input = ml_input.reset_index(drop=True)

        model = MLModel(window_size=min(1000, max(10, len(ml_input) // 3)))
        try:
            features, predictions = model.fit_predict(ml_input)
        except Exception:
            continue

        anomaly_mask = predictions == -1
        if not np.any(anomaly_mask):
            continue

        anomaly_features = features[anomaly_mask]
        normal_mean = sensor_df["value"].mean()

        for _, row in anomaly_features.iterrows():
            detected_time = row.get("start_time", datetime.now(timezone.utc))
            anomaly_value = row.get("value_rms", 0.0) if "value_rms" in row else 0.0

            sid = str(sensor_id_val) if sensor_id_val != "single" else str(request.sensor_id)

            all_anomalies.append({
                "sensor_id": sid,
                "detected_at": detected_time,
                "severity": classify_severity(anomaly_value, normal_mean),
                "value": float(anomaly_value),
                "expected_value": float(normal_mean),
            })

    inserted = insert_anomalies(all_anomalies)

    return DetectResponse(
        anomalies_found=len(all_anomalies),
        anomalies_inserted=inserted,
    )


@app.post("/api/v1/retrain", response_model=RetrainResponse)
async def retrain_model(request: RetrainRequest):
    df = fetch_readings_by_object(str(request.object_id), request.days)

    if df.empty:
        return RetrainResponse(windows_trained=0, model_saved=False)

    if request.exclude_since:
        anomaly_times = fetch_anomaly_times(
            str(request.object_id),
            since=request.exclude_since.isoformat(),
        )
        df = exclude_anomaly_windows(df, anomaly_times)

    if len(df) < 20:
        return RetrainResponse(windows_trained=0, model_saved=False)

    pivot = df.pivot_table(
        index="time", columns="sensor_category", values="value", aggfunc="mean"
    ).reset_index()

    if len(pivot) < 10:
        return RetrainResponse(windows_trained=0, model_saved=False)

    window_size = min(100, max(10, len(pivot) // 5))
    model = MLModel(window_size=window_size)
    try:
        X = model.fit(pivot, save=True)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Retrain failed: {exc}")

    return RetrainResponse(windows_trained=len(X), model_saved=True)


# ─── Health Score ──────────────────────────────────────────────────────────────

class EquipmentHealthResponse(BaseModel):
    equipment_id: str
    score: float
    grade: str
    anomaly_rate: float
    windows_checked: int


@app.get("/api/v1/equipment/{equipment_id}/health", response_model=EquipmentHealthResponse)
async def equipment_health(equipment_id: str):
    df = fetch_equipment_readings(equipment_id, limit=2000)

    if df.empty or "current_a" not in df.columns:
        return EquipmentHealthResponse(
            equipment_id=equipment_id, score=100.0, grade="A",
            anomaly_rate=0.0, windows_checked=0
        )

    ml_input = df[["current_a"]].copy()
    ml_input.insert(0, "time", pd.date_range("2024-01-01", periods=len(ml_input), freq="s", tz="UTC"))

    window_size = min(100, max(10, len(ml_input) // 5))
    model = MLModel(window_size=window_size)

    try:
        features, preds = model.fit_predict(ml_input)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Model error: {exc}")

    total   = len(preds)
    anomaly_count = int(np.sum(preds == -1))
    anomaly_rate  = anomaly_count / total if total > 0 else 0.0
    score   = round(max(0.0, 100.0 * (1 - anomaly_rate * 20)), 1)
    grade   = "A" if score >= 90 else "B" if score >= 75 else "C" if score >= 50 else "D"

    return EquipmentHealthResponse(
        equipment_id=equipment_id,
        score=score,
        grade=grade,
        anomaly_rate=round(anomaly_rate, 4),
        windows_checked=total,
    )


# ─── Predictions list ─────────────────────────────────────────────────────────

class PredictionItem(BaseModel):
    equipment_id: str
    rul_days: int
    failure_probability: float
    status: str
    confidence: str


@app.get("/api/v1/predictions", response_model=list[PredictionItem])
async def get_predictions(object_id: Optional[str] = None, limit: int = 20):
    rul_model = RULModel()
    if not rul_model.trained:
        raise HTTPException(status_code=503, detail="RUL model not trained yet. Run train_rul.py.")

    equipment_ids = fetch_equipment_ids_by_object(object_id) if object_id else []

    results = []
    for eq_id in equipment_ids[:limit]:
        df = fetch_equipment_readings(eq_id, limit=1000)
        if df.empty or "current_a" not in df.columns:
            continue

        signal = df["current_a"].dropna().values
        if len(signal) < 50:
            continue

        # Compute features for RUL prediction
        rms_history = []
        window_size = 50
        for start in range(0, len(signal) - window_size + 1, 25):
            w   = signal[start:start + window_size]
            rms_history.append(float(np.sqrt(np.mean(w ** 2))))

        if not rms_history:
            continue

        last_window = signal[-window_size:]
        from rul_model import RULModel as _RUL
        features = _RUL.compute_features(last_window, rms_history[-7:] if len(rms_history) >= 7 else rms_history)
        pred = rul_model.predict(features)
        results.append(PredictionItem(equipment_id=eq_id, **pred))

    return results


# ─── RUL Predict endpoint ─────────────────────────────────────────────────────

class PredictRequest(BaseModel):
    equipment_id: str


class PredictResponse(BaseModel):
    equipment_id: str
    rul_days: int
    status: str
    confidence: str
    failure_probability: float
    features_snapshot: dict


@app.post("/ml/predict", response_model=PredictResponse)
async def predict_rul(request: PredictRequest):
    rul_model = RULModel()
    if not rul_model.trained:
        raise HTTPException(status_code=503, detail="RUL model not trained yet. Run train_rul.py.")

    df = fetch_equipment_readings(request.equipment_id, limit=1000)
    if df.empty or "current_a" not in df.columns:
        raise HTTPException(status_code=404, detail="No readings found for equipment")

    signal = df["current_a"].dropna().values
    if len(signal) < 50:
        raise HTTPException(status_code=422, detail="Insufficient readings (need ≥50)")

    rms_history = []
    for start in range(0, len(signal) - 50 + 1, 25):
        w = signal[start:start + 50]
        rms_history.append(float(np.sqrt(np.mean(w ** 2))))

    from rul_model import RULModel as _RUL
    features = _RUL.compute_features(signal[-50:], rms_history[-7:] if len(rms_history) >= 7 else rms_history)
    feature_names = ["current_rms", "current_std", "current_max", "spike_freq", "trend_slope"]

    pred = rul_model.predict(features)
    return PredictResponse(
        equipment_id=request.equipment_id,
        features_snapshot=dict(zip(feature_names, features)),
        **pred,
    )
