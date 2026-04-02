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

from db import fetch_readings, fetch_readings_by_object, insert_anomalies
from models import MLModel

app = FastAPI(title="ML Anomaly Detection Service")


class DetectRequest(BaseModel):
    object_id: Optional[UUID] = None
    sensor_id: Optional[UUID] = None
    days: int = 7


class DetectResponse(BaseModel):
    anomalies_found: int
    anomalies_inserted: int


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
