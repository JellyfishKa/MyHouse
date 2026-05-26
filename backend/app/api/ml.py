import asyncio
import json
import urllib.error
import urllib.request

from fastapi import APIRouter, Body, HTTPException

from app.core.config import settings
from app.models.reading import (DetectRequest, DetectResponse,
                                EquipmentHealthML, PredictionItem, RetrainRequest,
                                RetrainResponse, RulML, ServiceHealth)

router = APIRouter(prefix="/api/v1/ml", tags=["ML"])


def _request_json(
    method: str, path: str, payload: dict | None = None, timeout: int = 10,
) -> dict:
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(
        f"{settings.ML_SERVICE_URL}{path}",
        data=data,
        headers={"Content-Type": "application/json"},
        method=method,
    )

    with urllib.request.urlopen(req, timeout=timeout) as response:
        body = response.read().decode("utf-8")
        return json.loads(body) if body else {}


async def _safe_request(
    method: str, path: str, payload: dict | None = None, timeout: int = 10,
) -> dict:
    try:
        return await asyncio.to_thread(_request_json, method, path, payload, timeout)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise HTTPException(status_code=exc.code, detail=detail) from exc
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get("/health", response_model=ServiceHealth)
async def ml_health():
    try:
        result = await _safe_request("GET", "/health")
        return ServiceHealth(
            status=result.get("status", "unknown"),
            service=result.get("service", "ml"),
        )
    except HTTPException as exc:
        return ServiceHealth(status="unavailable", service="ml", detail=str(exc.detail))


@router.post("/detect", response_model=DetectResponse)
async def run_detection(payload: DetectRequest):
    if not payload.object_id and not payload.sensor_id:
        raise HTTPException(
            status_code=400,
            detail="Provide either object_id or sensor_id",
        )

    result = await _safe_request(
        "POST",
        "/api/v1/detect",
        payload.model_dump(mode="json", exclude_none=True),
        timeout=120,
    )
    return DetectResponse(**result)


@router.post("/retrain", response_model=RetrainResponse)
async def retrain_model(payload: RetrainRequest):
    result = await _safe_request(
        "POST",
        "/api/v1/retrain",
        payload.model_dump(mode="json", exclude_none=True),
        timeout=120,
    )
    return RetrainResponse(**result)


@router.get("/equipment/{equipment_id}/health", response_model=EquipmentHealthML)
async def equipment_health(equipment_id: str):
    result = await _safe_request("GET", f"/api/v1/equipment/{equipment_id}/health")
    return EquipmentHealthML(**result)


@router.get("/predictions", response_model=list[PredictionItem])
async def get_predictions(object_id: str | None = None, limit: int = 20):
    params = f"?limit={limit}"
    if object_id:
        params += f"&object_id={object_id}"
    result = await _safe_request("GET", f"/api/v1/predictions{params}")
    if isinstance(result, list):
        return [PredictionItem(**item) for item in result]
    return []


@router.post("/predict", response_model=RulML)
async def predict_rul(equipment_id: str = Body(..., embed=True)):
    result = await _safe_request("POST", "/ml/predict", {"equipment_id": equipment_id})
    return RulML(**result)
