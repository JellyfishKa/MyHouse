import csv
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.models.database.models import Reading, Sensor, SensorCategory, SensorType


class Period(BaseModel):
    from_: datetime = Field(..., alias="from")
    to: datetime


class DisaggregateRequest(BaseModel):
    object_id: UUID
    period: Period


router = APIRouter(prefix="/api/v1/ml", tags=["ML"])


def _get_ml_script_path() -> Path:
    return Path(__file__).resolve().parents[3] / "ml" / "disaggregate.py"


def _write_input_csv(records: list[dict[str, Any]], path: Path) -> None:
    with path.open("w", newline="", encoding="utf-8") as csvfile:
        writer = csv.writer(csvfile)
        writer.writerow(["time", "value"])
        for record in records:
            writer.writerow([record["time"].isoformat(), record["value"]])


def _read_output_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as csvfile:
        return list(csv.DictReader(csvfile))


@router.post("/disaggregate", status_code=status.HTTP_200_OK)
async def trigger_disaggregate(
    request: DisaggregateRequest,
    db: AsyncSession = Depends(get_db)
):
    category_columns = [category.value for category in SensorCategory]

    sensor_stmt = select(Sensor).where(
        Sensor.object_id == request.object_id,
        Sensor.type == SensorType.ELECTRICITY
    )
    result = await db.execute(sensor_stmt)
    sensors = result.scalars().all()

    if not sensors:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No electricity sensors found for the requested object."
        )

    category_to_sensor = {
        sensor.category.value if hasattr(sensor.category, 'value') else sensor.category: sensor
        for sensor in sensors
    }
    missing_categories = [c for c in category_columns if c not in category_to_sensor]
    if missing_categories:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                "Object is missing required category sensors: "
                + ", ".join(missing_categories)
            )
        )

    readings_stmt = (
        select(
            Reading.time,
            func.sum(Reading.value).label("value")
        )
        .where(
            Reading.sensor_id.in_([sensor.id for sensor in sensors]),
            Reading.time >= request.period.from_,
            Reading.time <= request.period.to
        )
        .group_by(Reading.time)
        .order_by(Reading.time)
    )
    result = await db.execute(readings_stmt)
    aggregated_rows = result.all()

    if not aggregated_rows:
        return {
            "status": "ok",
            "categories": len(category_columns),
            "readings_created": 0,
        }

    tmp_dir = Path(__file__).resolve().parents[2] / "tmp" / "ml_disaggregate"
    tmp_dir.mkdir(parents=True, exist_ok=True)

    input_path = tmp_dir / "input.csv"
    output_path = tmp_dir / "disaggregated.csv"

    _write_input_csv(
        [
            {"time": row.time, "value": float(row.value)}
            for row in aggregated_rows
        ],
        input_path
    )

    script_path = _get_ml_script_path()
    python_executable = os.getenv("ML_PYTHON_EXECUTABLE", sys.executable or "python")

    process = subprocess.run(
        [python_executable, str(script_path), "--input", str(input_path), "--output", str(output_path)],
        capture_output=True,
        text=True
    )

    if process.returncode != 0:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                "ML disaggregation failed: "
                + (process.stderr.strip() or process.stdout.strip() or "unknown error")
            )
        )

    if not output_path.exists():
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="ML disaggregation did not create an output file."
        )

    output_rows = _read_output_csv(output_path)
    if not output_rows:
        return {
            "status": "ok",
            "categories": len(category_columns),
            "readings_created": 0,
        }

    missing_columns = [col for col in ["time", *category_columns] if col not in output_rows[0]]
    if missing_columns:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                "ML output is missing required columns: "
                + ", ".join(missing_columns)
            )
        )

    readings_to_insert = []
    for row in output_rows:
        time_value = row["time"].replace("Z", "+00:00")
        try:
            timestamp = datetime.fromisoformat(time_value)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Invalid time format in ML output: {row['time']}"
            ) from exc

        for category in category_columns:
            readings_to_insert.append({
                "sensor_id": category_to_sensor[category].id,
                "time": timestamp,
                "value": float(row[category])
            })

    insert_stmt = (
        pg_insert(Reading)
        .values(readings_to_insert)
        .on_conflict_do_nothing()
        .returning(Reading.time)
    )
    result = await db.execute(insert_stmt)
    await db.commit()

    inserted = len(result.fetchall())
    return {
        "status": "ok",
        "categories": len(category_columns),
        "readings_created": inserted,
    }
