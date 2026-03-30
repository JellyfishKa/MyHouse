from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.models.database.models import Reading
from app.models.reading import ReadingBatch

router = APIRouter(prefix="/api/v1/telemetry", tags=["Telemetry"])


@router.post("/batch", status_code=status.HTTP_201_CREATED)
async def upload_telemetry_batch(
    batch: ReadingBatch,
    db: AsyncSession = Depends(get_db)
):
    if not batch.readings:
        raise HTTPException(status_code=400, detail="Empty batch")

    insert_data = [reading.model_dump() for reading in batch.readings]

    try:
        stmt = (
            pg_insert(Reading)
            .values(insert_data)
            .on_conflict_do_nothing()
            .returning(Reading.time)
        )
        result = await db.execute(stmt)
        await db.commit()
        inserted = len(result.fetchall())

    except IntegrityError as e:
        await db.rollback()
        raise HTTPException(status_code=422, detail=str(e.orig))
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

    return {"inserted": inserted}
