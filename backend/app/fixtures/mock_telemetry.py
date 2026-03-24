import json
import random
from datetime import datetime, timedelta, timezone

SENSORS = [
    "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    "d1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22",
    "e2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33",
    "f3eebc99-9c0b-4ef8-bb6d-6bb9bd380a44"
]


def generate_telemetry_batch(count=500):
    readings = []
    current_time = datetime.now(timezone.utc)
    for i in range(count):
        sensor_id = SENSORS[i % len(SENSORS)]
        reading_time = current_time - timedelta(minutes=15 * i)
        if sensor_id == SENSORS[0]:
            val = random.uniform(50.0, 150.0)
        elif sensor_id == SENSORS[1]:
            val = random.uniform(30.0, 80.0)
        else:
            val = random.uniform(5.0, 25.0)
        readings.append({
            "sensor_id": sensor_id,
            "time": reading_time.isoformat(timespec='seconds'),
            "value": round(val, 2)
        })
    readings.sort(key=lambda x: x["time"])
    return {"readings": readings}


mock_data = generate_telemetry_batch(500)

with open('mock_telemetry.json', 'w') as f:
    json.dump(mock_data, f, indent=2)

print(f"Генерация завершена. Создано {len(mock_data['readings'])} записей.")
print("Первая запись:", mock_data['readings'][0])
print("Последняя запись:", mock_data['readings'][-1])
