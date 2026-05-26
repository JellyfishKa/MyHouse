"""
Seed demo data: create Equipment for existing objects + load synthetic readings.

Usage:
  python scripts/seed_demo.py
  python scripts/seed_demo.py --api http://localhost:8000/api/v1
  API_URL=https://pulsetok.duckdns.org/api/v1 python scripts/seed_demo.py

Production (FirstVDS):
  DOMAIN=pulsetok.duckdns.org ./scripts/seed_production.sh
"""
import argparse
import os
import sys
import json
import random
import urllib.request
import urllib.error
from datetime import datetime, timedelta, timezone

DEFAULT_API = "http://localhost:8000/api/v1"

# category -> (load multiplier, noise, base watts factor)
SENSOR_PROFILES = {
    "servers": (1.00, 0.4, 220.0),
    "cooling": (0.60, 0.25, 185.0),
    "ups": (0.35, 0.15, 160.0),
    "lighting": (0.15, 0.08, 80.0),
}


def get(api: str, path: str):
    try:
        with urllib.request.urlopen(f"{api}{path}", timeout=30) as r:
            return json.loads(r.read())
    except urllib.error.URLError as exc:
        if "Connection refused" in str(exc.reason) or "111" in str(exc):
            print(
                f"\nОшибка: backend недоступен по {api}\n"
                "Локально: docker compose up -d && API_URL=http://localhost:8000/api/v1 python3 scripts/seed_demo.py\n"
                "Production: DOMAIN=pulsetok.duckdns.org ./scripts/seed_production.sh\n"
                "         или: API_URL=https://pulsetok.duckdns.org/api/v1 python3 scripts/seed_demo.py\n",
                file=sys.stderr,
            )
        raise


def post(api: str, path: str, body):
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        f"{api}{path}",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())


def daily_factor(hour: int) -> float:
    return (
        1.0
        + 0.28 * max(0, min(1, (hour - 7) / 3))
        - 0.18 * max(0, min(1, (hour - 19) / 3))
    )


def seed_sensor_telemetry(api: str, object_id: str, now: datetime, rng: random.Random) -> None:
    sensors = get(api, f"/objects/{object_id}/sensors")
    if not sensors:
        print("No sensors found for telemetry seed.")
        return

    print(f"Seeding sensor telemetry for {len(sensors)} sensors (7 days, 1/min)...")
    total_points = 10080

    for sensor in sensors:
        category = sensor.get("category", "servers")
        mult, noise, base = SENSOR_PROFILES.get(category, (1.0, 0.3, 200.0))
        batch: list[dict] = []
        sensor_id = sensor["id"]

        for i in range(total_points):
            ts = now - timedelta(minutes=total_points - i)
            hour = ts.hour
            value = base * mult * daily_factor(hour) + rng.gauss(0, noise * base)
            batch.append({
                "sensor_id": sensor_id,
                "time": ts.isoformat(),
                "value": round(max(1.0, value), 3),
            })

            if len(batch) == 500:
                post(api, "/telemetry/batch", {"readings": batch})
                batch = []

        if batch:
            post(api, "/telemetry/batch", {"readings": batch})

        print(f"  {sensor['label']}: {total_points} points")


def main():
    parser = argparse.ArgumentParser(description="Seed equipment + 7 days telemetry")
    parser.add_argument(
        "--api",
        default=os.getenv("API_URL", DEFAULT_API),
        help=f"Backend API base URL (default: {DEFAULT_API} or API_URL env)",
    )
    args = parser.parse_args()
    api = args.api.rstrip("/")

    print(f"API: {api}")
    print("Загрузка 7 дней данных (~40k точек) — может занять 10–20 минут…")

    objects = get(api, "/objects")
    if not objects:
        print("No objects found. Check backend is running.")
        sys.exit(1)

    obj = next((o for o in objects if o["type"] == "datacenter"), objects[0])
    print(f"Using object: {obj['name']} ({obj['id']})")

    try:
        equipment_list = get(api, f"/equipment?object_id={obj['id']}")
    except Exception:
        equipment_list = []

    if equipment_list:
        eq = equipment_list[0]
        print(f"Equipment exists: {eq['name']} ({eq['id']})")
    else:
        eq = post(api, "/equipment", {
            "object_id": obj["id"],
            "name": "Demo Server #1",
            "type": "server",
            "status": "online",
            "meta_data": {"rack": "A1", "model": "Dell PowerEdge R740"},
        })
        print(f"Created equipment: {eq['name']} ({eq['id']})")

    eq_id = eq["id"]
    now = datetime.now(timezone.utc)
    rng = random.Random(42)

    print("Generating 7 days of equipment readings (10080 points)...")
    readings = []
    total_eq_points = 10080
    for i in range(total_eq_points):
        ts = now - timedelta(minutes=total_eq_points - i)
        hour = ts.hour
        base = 9.0 + 2.5 * max(0, min(1, (hour - 7) / 3)) - 1.5 * max(0, min(1, (hour - 19) / 3))
        current = base + rng.gauss(0, 0.3)
        readings.append({
            "time": ts.isoformat(),
            "current_a": round(max(5.0, current), 3),
            "voltage_v": round(rng.gauss(220, 1.5), 2),
            "power_kw": round(max(5.0, current) * 220 / 1000, 3),
        })
        if len(readings) == 500:
            post(api, f"/equipment/{eq_id}/readings", {"readings": readings})
            print(f"  Inserted {i + 1}/{total_eq_points} equipment readings...")
            readings = []

    if readings:
        post(api, f"/equipment/{eq_id}/readings", {"readings": readings})

    seed_sensor_telemetry(api, obj["id"], now, rng)

    print(f"Done! Equipment ID: {eq_id}")
    print(f"Open dashboard and select: {obj['name']}")
    print("Then click 'Стресс-тест' to see live degradation.")


if __name__ == "__main__":
    main()
