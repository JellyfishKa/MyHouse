"""HTTP client for the ML microservice."""
from __future__ import annotations

import asyncio
import json
import urllib.error
import urllib.request

from app.core.config import settings


def _request_json(
    method: str, path: str, payload: dict | None = None, timeout: int = 10,
) -> dict | list:
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


async def ml_request(
    method: str, path: str, payload: dict | None = None, timeout: int = 10,
) -> dict | list:
    return await asyncio.to_thread(_request_json, method, path, payload, timeout)


async def predict_equipment_rul(equipment_id: str, timeout: int = 15) -> dict | None:
    """Return ML RUL payload or None if service/model unavailable."""
    try:
        result = await ml_request(
            "POST", "/ml/predict", {"equipment_id": equipment_id}, timeout=timeout,
        )
        return result if isinstance(result, dict) else None
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError):
        return None
