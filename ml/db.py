"""
Sync DB access for ML service.
Reads sensor readings and writes anomalies to PostgreSQL.
"""
import os

import pandas as pd
import psycopg2
from psycopg2.extras import execute_values


def get_connection():
    return psycopg2.connect(
        host=os.getenv("DB_HOST", "postgres"),
        port=int(os.getenv("DB_PORT", 5432)),
        user=os.getenv("DB_USER", "postgres"),
        password=os.getenv("DB_PASSWORD", "postgres"),
        dbname=os.getenv("DB_NAME", "myhouse"),
    )


def fetch_readings(sensor_id: str, days: int = 7) -> pd.DataFrame:
    """Fetch recent readings for a sensor from the database."""
    conn = get_connection()
    try:
        query = """
            SELECT time, value
            FROM readings
            WHERE sensor_id = %s
              AND time >= (
                  SELECT COALESCE(MAX(time), NOW()) - (%s * INTERVAL '1 day')
                  FROM readings
                  WHERE sensor_id = %s
              )
            ORDER BY time ASC
        """
        df = pd.read_sql(query, conn, params=(sensor_id, days, sensor_id))
        return df
    finally:
        conn.close()


def fetch_readings_by_object(object_id: str, days: int = 7) -> pd.DataFrame:
    """Fetch recent readings for all sensors of an object."""
    conn = get_connection()
    try:
        query = """
            SELECT r.time, r.value, r.sensor_id,
                   s.category AS sensor_category
            FROM readings r
            JOIN sensors s ON s.id = r.sensor_id
            WHERE s.object_id = %s
              AND r.time >= (
                  SELECT COALESCE(MAX(r2.time), NOW()) - (%s * INTERVAL '1 day')
                  FROM readings r2
                  JOIN sensors s2 ON s2.id = r2.sensor_id
                  WHERE s2.object_id = %s
              )
            ORDER BY r.time ASC
        """
        df = pd.read_sql(query, conn, params=(object_id, days, object_id))
        return df
    finally:
        conn.close()


def insert_anomalies(anomalies: list[dict]) -> int:
    """Insert anomaly records into the anomalies table."""
    if not anomalies:
        return 0

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            execute_values(
                cur,
                """
                INSERT INTO anomalies (sensor_id, detected_at, severity, value, expected_value)
                VALUES %s
                """,
                [
                    (
                        a["sensor_id"],
                        a["detected_at"],
                        a["severity"],
                        a["value"],
                        a.get("expected_value"),
                    )
                    for a in anomalies
                ],
            )
        conn.commit()
        return len(anomalies)
    finally:
        conn.close()
