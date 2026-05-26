#!/usr/bin/env python3
"""
Seed: создаёт объект 'Датацентр МГУ' и 4 сенсора.
Идемпотентен — безопасен при повторном запуске.

Usage:
  python infra/seed.py                              # локально через docker exec psql
  python infra/seed.py --api http://localhost:8000/api/v1
  python infra/seed.py --api https://pulsetok.duckdns.org/api/v1
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import urllib.error
import urllib.request

CONTAINER = "myhouse-postgres"
DB_USER = "postgres"
DB_NAME = "myhouse"

OBJECT_ID = "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"
SENSORS = [
    ("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11", "servers", "Серверы"),
    ("d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11", "cooling", "Охлаждение"),
    ("e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11", "ups", "ИБП"),
    ("f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11", "lighting", "Освещение"),
]

REGISTRATION_PAYLOAD = {
    "id": OBJECT_ID,
    "name": "Датацентр МГУ",
    "type": "datacenter",
    "meta_data": {"source": "seed"},
    "sensors": [
        {
            "id": sid,
            "type": "electricity",
            "category": cat,
            "label": label,
            "unit": "Вт",
        }
        for sid, cat, label in SENSORS
    ],
}

SQL = f"""
INSERT INTO objects (id, name, type, metadata)
VALUES ('{OBJECT_ID}', 'Датацентр МГУ', 'datacenter', '{{"source":"seed"}}')
ON CONFLICT (id) DO NOTHING;
""" + "".join(
    f"""INSERT INTO sensors (id, object_id, type, category, label, unit)
VALUES ('{sid}', '{OBJECT_ID}', 'electricity', '{cat}', '{label}', 'Вт')
ON CONFLICT (id) DO NOTHING;
"""
    for sid, cat, label in SENSORS
)


def _print_summary() -> None:
    print(f"Объект 'Датацентр МГУ'  id={OBJECT_ID}")
    for sensor_id, category, label in SENSORS:
        print(f"  Сенсор {label:<12} ({category}) id={sensor_id}")
    print("Seed выполнен.")


def seed_docker() -> None:
    result = subprocess.run(
        ["docker", "exec", CONTAINER, "psql", "-U", DB_USER, "-d", DB_NAME, "-c", SQL],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print("Ошибка:", result.stderr, file=sys.stderr)
        sys.exit(1)
    _print_summary()


def seed_api(api_base: str) -> None:
    url = f"{api_base.rstrip('/')}/objects/register"
    data = json.dumps(REGISTRATION_PAYLOAD).encode()
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            body = json.loads(response.read())
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        print(f"HTTP {exc.code}: {detail}", file=sys.stderr)
        sys.exit(1)
    except urllib.error.URLError as exc:
        print(f"Ошибка подключения: {exc.reason}", file=sys.stderr)
        sys.exit(1)

    print(f"API: object_id={body.get('object_id')}, sensors={body.get('sensors_registered')}")
    _print_summary()


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed объекта и сенсоров для MyHouse")
    parser.add_argument(
        "--api",
        metavar="URL",
        help="Базовый URL API, например https://pulsetok.duckdns.org/api/v1",
    )
    args = parser.parse_args()

    if args.api:
        seed_api(args.api)
    else:
        seed_docker()


if __name__ == "__main__":
    main()
