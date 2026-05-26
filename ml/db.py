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


def fetch_readings_by_object(
    object_id: str,
    days: int = 7,
    exclude_after: str | None = None,
) -> pd.DataFrame:
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
        """
        params: list = [object_id, days, object_id]
        if exclude_after:
            query += " AND r.time < %s"
            params.append(exclude_after)
        query += " ORDER BY r.time ASC"
        df = pd.read_sql(query, conn, params=params)
        return df
    finally:
        conn.close()


def fetch_anomaly_times(object_id: str, since: str | None = None) -> list:
    """Return detected_at timestamps for anomalies on an object's sensors."""
    conn = get_connection()
    try:
        query = """
            SELECT a.detected_at
            FROM anomalies a
            JOIN sensors s ON s.id = a.sensor_id
            WHERE s.object_id = %s
        """
        params: list = [object_id]
        if since:
            query += " AND a.detected_at >= %s"
            params.append(since)
        query += " ORDER BY a.detected_at ASC"
        df = pd.read_sql(query, conn, params=params)
        return df["detected_at"].tolist() if not df.empty else []
    finally:
        conn.close()


def exclude_anomaly_windows(df: pd.DataFrame, anomaly_times: list, window_minutes: int = 3) -> pd.DataFrame:
    """Drop readings within ±window_minutes of each anomaly timestamp."""
    if df.empty or not anomaly_times:
        return df
    mask = pd.Series(True, index=df.index)
    for ts in anomaly_times:
        t = pd.Timestamp(ts)
        delta = pd.Timedelta(minutes=window_minutes)
        mask &= ~((df["time"] >= t - delta) & (df["time"] <= t + delta))
    return df.loc[mask]


def fetch_equipment_readings(equipment_id: str, limit: int = 2000) -> pd.DataFrame:
    """Fetch recent readings from equipment_readings table."""
    conn = get_connection()
    try:
        query = """
            SELECT time, equipment_id, current_a, voltage_v, power_kw
            FROM equipment_readings
            WHERE equipment_id = %s
            ORDER BY time DESC
            LIMIT %s
        """
        df = pd.read_sql(query, conn, params=(equipment_id, limit))
        return df.sort_values("time").reset_index(drop=True)
    finally:
        conn.close()


def fetch_equipment_ids_by_object(object_id: str) -> list[str]:
    """Return equipment IDs for a given object."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM equipment WHERE object_id = %s", (object_id,))
            return [str(row[0]) for row in cur.fetchall()]
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
