from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import get_db

router = APIRouter()


@router.get("/healthcheck")
async def check_health(db: AsyncSession = Depends(get_db)):
    """
    Check the health of the database connection.
    """
    try:
        # Выполняем простейший запрос для проверки активности
        await db.execute(text("SELECT 1"))
        return {
            "status": "ok",
            "database": "connected",
            "environment": settings.NODE_ENV,
        }
    except Exception as e:
        # Логируем ошибку здесь, если есть логгер
        raise HTTPException(
            status_code=500,
            detail=f"Database connection failed: {str(e)}"
        )
