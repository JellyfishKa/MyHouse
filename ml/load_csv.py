#!/usr/bin/env python3
"""
Загрузка CSV → POST /api/v1/telemetry/batch

Поддерживаемые форматы:

1. Стандартный (time, sensor_id, value):
   time,sensor_id,value
   2026-01-01T00:00:00+00:00,<uuid>,103.79

2. REDD (индекс в секундах + колонки приборов):
   ,dish washer,fridge,...,main
   0,0.0,6.0,...,103.79

Usage:
  python load_csv.py --file data.csv --url http://localhost:8000
  python load_csv.py --file data/redd/redd_house1_0.csv --redd --sensor-id <uuid>
  python load_csv.py --file data/redd/redd_house1_0.csv --redd --sensor-id <uuid> --column main
"""
import argparse
import csv
import json
import urllib.request
from datetime import datetime, timezone

BATCH_SIZE = 1000
API_URL = "http://localhost:8001"
BASE_DATE = datetime(2026, 1, 1, tzinfo=timezone.utc)


def post_batch(url: str, readings: list) -> int:
    payload = json.dumps({"readings": readings}).encode()
    req = urllib.request.Request(
        f"{url}/api/v1/telemetry/batch",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read()).get("inserted", 0)


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
            ts = BASE_DATE.replace(
                second=seconds % 60,
                minute=(seconds // 60) % 60,
                hour=(seconds // 3600) % 24,
            )
            value = float(row[column])
            if value <= 0:
                continue  # API требует value > 0
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
    parser.add_argument("--sensor-id", help="UUID сенсора (обязателен для --redd)")
    parser.add_argument("--column", default="main", help="Колонка из REDD CSV (default: main)")
    args = parser.parse_args()

    if args.redd:
        if not args.sensor_id:
            parser.error("--sensor-id обязателен при --redd")
        rows = iter_redd(args.file, args.sensor_id, args.column)
    else:
        rows = iter_standard(args.file)

    load(rows, args.url, args.batch_size)
