from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.analytics import router as analytics_router
from app.api.anomalies import router as anomaly_router
from app.api.batch import router as batch_router
from app.api.db_healthcheck import router as health_router
from app.api.demo import router as demo_router
from app.api.equipment import router as equipment_router
from app.api.ml import router as ml_router
from app.api.objects import router as objects_router
from app.core.config import settings

app = FastAPI(title="IoT Monitoring Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analytics_router)
app.include_router(anomaly_router)
app.include_router(batch_router)
app.include_router(demo_router)
app.include_router(equipment_router)
app.include_router(objects_router)
app.include_router(ml_router)
app.include_router(health_router, prefix="/api/v1", tags=["system"])


@app.get("/health")
async def health_check():
    """
    Basic liveness probe.
    """
    return {"status": "ok"}
