#!/usr/bin/env python3
"""
Seed: создаёт объект 'Датацентр МГУ' и 4 сенсора через docker exec psql.
Идемпотентен — безопасен при повторном запуске.

Usage:
  python infra/seed.py
"""
import subprocess
import sys

CONTAINER = "myhouse-postgres"
DB_USER   = "postgres"
DB_NAME   = "myhouse"

OBJECT_ID = "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"
SENSORS = [
    ("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11", "SERVERS"),
    ("d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11", "COOLING"),
    ("e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11", "UPS"),
    ("f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11", "LIGHTING"),
]

SQL = f"""
INSERT INTO objects (id, name, type, metadata)
VALUES ('{OBJECT_ID}', 'Датацентр МГУ', 'DATACENTER', '{{}}')
ON CONFLICT (id) DO NOTHING;
""" + "".join(
    f"""INSERT INTO sensors (id, object_id, type, category, unit)
VALUES ('{sid}', '{OBJECT_ID}', 'ELECTRICITY', '{cat}', 'Вт')
ON CONFLICT (id) DO NOTHING;
"""
    for sid, cat in SENSORS
)


def seed() -> None:
    result = subprocess.run(
        ["docker", "exec", CONTAINER, "psql", "-U", DB_USER, "-d", DB_NAME, "-c", SQL],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print("Ошибка:", result.stderr, file=sys.stderr)
        sys.exit(1)

    print(f"Объект 'Датацентр МГУ'  id={OBJECT_ID}")
    for sensor_id, category in SENSORS:
        print(f"  Сенсор {category:<10}  id={sensor_id}")
    print("Seed выполнен.")


if __name__ == "__main__":
    seed()
