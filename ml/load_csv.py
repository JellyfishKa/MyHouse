#!/usr/bin/env python3
"""
Загрузка CSV → backend API.

Поддерживаемые форматы:

1. Стандартный (time, sensor_id, value):
   time,sensor_id,value
   2026-01-01T00:00:00+00:00,<uuid>,103.79

2. REDD (индекс в секундах + колонки приборов):
   ,dish washer,fridge,...,main
   0,0.0,6.0,...,103.79

3. Motor monitoring dataset:
   time,0,1,2,3,...
   5e-05,10.38,2.55,-6.04,...

Usage:
  python load_csv.py --file data.csv
  python load_csv.py --file data/redd/redd_house1_0.csv --redd --sensor-id <uuid>
  python load_csv.py --file "data/Motor Monitoring Dataset/Electric_Motor-2_50_time-stator short 2-ch1.csv" --motor
"""
import argparse
import csv
import json
import math
from pathlib import Path
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from uuid import NAMESPACE_URL, uuid5

BATCH_SIZE = 1000
API_URL = "http://localhost:8001"
BASE_DATE = datetime(2026, 1, 1, tzinfo=timezone.utc)
MOTOR_CATEGORY_CYCLE = ("servers", "cooling", "ups", "lighting")


def post_batch(url: str, readings: list) -> int:
    payload = json.dumps({"readings": readings}).encode()
    req = urllib.request.Request(
        f"{url}/api/v1/telemetry/batch",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read()).get("inserted", 0)
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {e.code}: {body}") from None


def post_json(url: str, path: str, payload: dict) -> dict:
    req = urllib.request.Request(
        f"{url}{path}",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as resp:
            body = resp.read().decode("utf-8")
            return json.loads(body) if body else {}
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {e.code}: {body}") from None


def iter_standard(file_path: str):
    """CSV с колонками: time, sensor_id, value."""
    with open(file_path, newline="") as f:
        for row in csv.DictReader(f):
            yield {
                "sensor_id": row["sensor_id"],
                "time": row["time"],
                "value": float(row["value"]),
            }


def iter_redd(file_path: str, sensor_id: str, column: str):
    """REDD CSV: первая колонка — индекс (секунды), остальные — приборы."""
    with open(file_path, newline="") as f:
        reader = csv.DictReader(f)
        # Первая колонка называется '' (пустая строка)
        index_col = reader.fieldnames[0]
        if column not in reader.fieldnames:
            available = [c for c in reader.fieldnames if c != index_col]
            raise ValueError(
                f"Колонка '{column}' не найдена. Доступные: {available}"
            )
        for row in reader:
            seconds = int(row[index_col])
            ts = BASE_DATE + timedelta(seconds=seconds)
            value = float(row[column])
            yield {
                "sensor_id": sensor_id,
                "time": ts.isoformat(),
                "value": value,
            }


def build_motor_registration(file_path: str, object_name: str | None = None) -> tuple[dict, dict[str, str]]:
    path = Path(file_path)
    stem = path.stem

    with open(file_path, newline="") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames or "time" not in reader.fieldnames:
            raise ValueError("Motor CSV должен содержать колонку 'time'")
        signal_columns = [column for column in reader.fieldnames if column != "time"]

    if not signal_columns:
        raise ValueError("Motor CSV не содержит измерительных колонок")

    object_id = str(uuid5(NAMESPACE_URL, f"myhouse:motor-object:{stem}"))
    display_name = object_name or stem.replace("_", " ")

    sensor_map: dict[str, str] = {}
    sensors = []
    for index, column in enumerate(signal_columns):
        sensor_id = str(uuid5(NAMESPACE_URL, f"{object_id}:{column}"))
        sensor_map[column] = sensor_id
        sensors.append(
            {
                "id": sensor_id,
                "label": f"Замер {column}",
                "category": MOTOR_CATEGORY_CYCLE[index % len(MOTOR_CATEGORY_CYCLE)],
                "unit": "A",
            }
        )

    registration = {
        "id": object_id,
        "name": display_name,
        "type": "workshop",
        "meta_data": {
            "source": "motor-monitoring-dataset",
            "file_name": path.name,
            "import_format": "motor",
        },
        "sensors": sensors,
    }
    return registration, sensor_map


def iter_motor(file_path: str, sensor_map: dict[str, str]):
    with open(file_path, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            seconds = float(row["time"])
            ts = BASE_DATE + timedelta(seconds=seconds)
            for column, sensor_id in sensor_map.items():
                value = float(row[column])
                if not math.isfinite(value):
                    continue
                yield {
                    "sensor_id": sensor_id,
                    "time": ts.isoformat(),
                    "value": value,
                }


def load(rows, url: str, batch_size: int) -> None:
    batch, total = [], 0
    for reading in rows:
        batch.append(reading)
        if len(batch) >= batch_size:
            total += post_batch(url, batch)
            print(f"Загружено {total} записей")
            batch = []
    if batch:
        total += post_batch(url, batch)
    print(f"Итого загружено: {total} записей")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="CSV → API loader")
    parser.add_argument("--file", required=True, help="Путь к CSV-файлу")
    parser.add_argument("--url", default=API_URL, help="Базовый URL API")
    parser.add_argument("--batch-size", type=int, default=BATCH_SIZE)
    parser.add_argument("--redd", action="store_true", help="Использовать REDD-формат")
    parser.add_argument("--motor", action="store_true", help="Использовать motor monitoring dataset")
    parser.add_argument("--sensor-id", help="UUID сенсора (обязателен для --redd)")
    parser.add_argument("--column", default="main", help="Колонка из REDD CSV (default: main)")
    parser.add_argument("--object-name", help="Имя объекта при импорте motor dataset")
    args = parser.parse_args()

    if args.redd and args.motor:
        parser.error("Выберите только один режим: --redd или --motor")

    if args.redd:
        if not args.sensor_id:
            parser.error("--sensor-id обязателен при --redd")
        rows = iter_redd(args.file, args.sensor_id, args.column)
    elif args.motor:
        registration, sensor_map = build_motor_registration(args.file, args.object_name)
        result = post_json(args.url, "/api/v1/objects/register", registration)
        print(
            "Зарегистрирован объект "
            f"{registration['name']} ({result.get('sensors_registered', 0)} сенсоров)"
        )
        rows = iter_motor(args.file, sensor_map)
    else:
        rows = iter_standard(args.file)

    load(rows, args.url, args.batch_size)
