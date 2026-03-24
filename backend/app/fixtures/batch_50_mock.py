import json
import random
from datetime import datetime, timedelta, timezone


def create_batch_file(filename="batch_50.json", count=50):
    now = datetime.now(timezone.utc)
    readings = []

    for i in range(count):
        reading = {
            # создайте датчик с таким же uuid
            "sensor_id": 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
            "time": (now - timedelta(minutes=i*10)).isoformat(),
            "value": round(random.uniform(18.0, 26.0), 2)
        }
        readings.append(reading)

    with open(filename, "w") as f:
        json.dump({"readings": readings}, f, indent=2)

    print(f"Файл {filename} готов. В нем {count} записей.")


create_batch_file()
