"""
Seed demo data: create Equipment for existing objects + load synthetic readings.
Run from project root: python scripts/seed_demo.py
"""
import os
import sys
import json
import random
import urllib.request
import urllib.error
from datetime import datetime, timedelta, timezone

API = os.getenv("API_URL", "http://localhost:8000/api/v1")

# category -> (load multiplier, noise, base watts factor)
SENSOR_PROFILES = {
    "servers": (1.00, 0.4, 220.0),
    "cooling": (0.60, 0.25, 185.0),
    "ups": (0.35, 0.15, 160.0),
    "lighting": (0.15, 0.08, 80.0),
}


def post(path, body):
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        f"{API}{path}",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def get(path):
    with urllib.request.urlopen(f"{API}{path}", timeout=30) as r:
        return json.loads(r.read())


def daily_factor(hour: int) -> float:
    return (
        1.0
        + 0.28 * max(0, min(1, (hour - 7) / 3))
        - 0.18 * max(0, min(1, (hour - 19) / 3))
    )


def seed_sensor_telemetry(object_id: str, now: datetime, rng: random.Random) -> None:
    sensors = get(f"/objects/{object_id}/sensors")
    if not sensors:
        print("No sensors found for telemetry seed.")
        return

    print(f"Seeding sensor telemetry for {len(sensors)} sensors (3 days, 1/min)...")
    total_points = 4320

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
                post("/telemetry/batch", {"readings": batch})
                batch = []

        if batch:
            post("/telemetry/batch", {"readings": batch})

        print(f"  {sensor['label']}: {total_points} points")


def main():
    objects = get("/objects")
    if not objects:
        print("No objects found. Check backend is running.")
        sys.exit(1)

    obj = next((o for o in objects if o["type"] == "datacenter"), objects[0])
    print(f"Using object: {obj['name']} ({obj['id']})")

    try:
        equipment_list = get(f"/equipment?object_id={obj['id']}")
    except Exception:
        equipment_list = []

    if equipment_list:
        eq = equipment_list[0]
        print(f"Equipment exists: {eq['name']} ({eq['id']})")
    else:
        eq = post("/equipment", {
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

    print("Generating 3 days of equipment readings (4320 points)...")
    readings = []
    for i in range(4320):
        ts = now - timedelta(minutes=4320 - i)
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
            post(f"/equipment/{eq_id}/readings", {"readings": readings})
            print(f"  Inserted {i + 1}/4320 equipment readings...")
            readings = []

    if readings:
        post(f"/equipment/{eq_id}/readings", {"readings": readings})

    seed_sensor_telemetry(obj["id"], now, rng)

    print(f"Done! Equipment ID: {eq_id}")
    print(f"Open dashboard and select: {obj['name']}")
    print("Then click 'Стресс-тест' to see live degradation.")


if __name__ == "__main__":
    main()
