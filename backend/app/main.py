from fastapi import FastAPI

from app.api.analytics import router as analytics_router
from app.api.batch import router as batch_router
from app.api.db_healthcheck import router as health_router

app = FastAPI(title="IoT Monitoring Service")

app.include_router(analytics_router)
app.include_router(batch_router)
app.include_router(health_router, prefix="/api/v1", tags=["system"])


@app.get("/health")
async def health_check():
    """
    Basic liveness probe.
    """
    return {"status": "ok"}
