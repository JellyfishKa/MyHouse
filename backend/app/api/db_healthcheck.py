from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.db import get_db

router = APIRouter()


@router.get("/healthcheck")
def check_health(db: Session = Depends(get_db)):
    """
    Check the health of the database connection.
    """
    try:
        # Выполняем простейший запрос для проверки активности
        db.execute(text("SELECT 1"))
        return {
            "status": "ok",
            "database": "connected",
            "environment": "development"
        }
    except Exception as e:
        # Логируем ошибку здесь, если есть логгер
        raise HTTPException(
            status_code=500,
            detail=f"Database connection failed: {str(e)}"
        )
