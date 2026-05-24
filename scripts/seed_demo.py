"""
Seed demo data: create Equipment for existing objects + load synthetic readings.
Run from project root: python scripts/seed_demo.py
"""
import os, sys, json, urllib.request, urllib.error
from datetime import datetime, timedelta, timezone
import random

API = os.getenv("API_URL", "http://localhost:8000/api/v1")


def post(path, body):
    data = json.dumps(body).encode()
    req = urllib.request.Request(f"{API}{path}", data=data,
                                  headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read())


def get(path):
    with urllib.request.urlopen(f"{API}{path}", timeout=10) as r:
        return json.loads(r.read())


def main():
    # 1. Get objects
    objects = get("/objects")
    if not objects:
        print("No objects found. Check backend is running.")
        sys.exit(1)

    obj = next((o for o in objects if o["type"] == "datacenter"), objects[0])
    print(f"Using object: {obj['name']} ({obj['id']})")

    # 2. Check/create equipment
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
            "meta_data": {"rack": "A1", "model": "Dell PowerEdge R740"}
        })
        print(f"Created equipment: {eq['name']} ({eq['id']})")

    eq_id = eq["id"]

    # 3. Generate 3 days of normal readings (1 per minute)
    print("Generating 3 days of normal readings (4320 points)...")
    now = datetime.now(timezone.utc)
    readings = []
    rng = random.Random(42)

    for i in range(4320):  # 3 days * 24h * 60min
        ts = now - timedelta(minutes=4320 - i)
        hour = ts.hour
        # Daily pattern: higher during business hours
        base = 9.0 + 2.5 * max(0, min(1, (hour - 7) / 3)) - 1.5 * max(0, min(1, (hour - 19) / 3))
        current = base + rng.gauss(0, 0.3)
        readings.append({
            "time": ts.isoformat(),
            "current_a": round(max(5.0, current), 3),
            "voltage_v": round(rng.gauss(220, 1.5), 2),
            "power_kw": round(max(5.0, current) * 220 / 1000, 3),
        })

        # Batch insert every 500 rows
        if len(readings) == 500:
            post(f"/equipment/{eq_id}/readings", {"readings": readings})
            print(f"  Inserted {i+1}/4320 readings...")
            readings = []

    if readings:
        post(f"/equipment/{eq_id}/readings", {"readings": readings})

    print(f"Done! Equipment ID: {eq_id}")
    print(f"Open http://localhost:3000 and select object: {obj['name']}")
    print("Then click 'Stress-test' button to see live degradation.")


if __name__ == "__main__":
    main()
