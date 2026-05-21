"""
Adapt SKAB CSV files to equipment_readings format.

SKAB columns: datetime, Accelerometer1RMS, Accelerometer2RMS, Current,
              Pressure, Temperature, Thermocouple, Voltage,
              VolumeFlowRateRMS, anomaly, changepoint

Output columns: time, current_a, voltage_v, power_kw, anomaly

Usage:
    python ml/adapt_skab.py [--skab-dir PATH] [--output PATH]
"""
import argparse
import os
import sys

import pandas as pd

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
SKAB_DIR = os.path.join(DATA_DIR, "skab")
OUTPUT   = os.path.join(DATA_DIR, "skab_adapted.csv")


def load_skab_file(path: str) -> pd.DataFrame | None:
    try:
        df = pd.read_csv(path, sep=";", parse_dates=["datetime"])
    except Exception:
        try:
            df = pd.read_csv(path, parse_dates=["datetime"])
        except Exception as exc:
            print(f"  [skip] {os.path.basename(path)}: {exc}")
            return None

    required = {"datetime", "Current", "Voltage"}
    if not required.issubset(df.columns):
        print(f"  [skip] {os.path.basename(path)}: missing columns {required - set(df.columns)}")
        return None

    adapted = pd.DataFrame({
        "time":       pd.to_datetime(df["datetime"], utc=True),
        "current_a":  pd.to_numeric(df["Current"],  errors="coerce"),
        "voltage_v":  pd.to_numeric(df["Voltage"],  errors="coerce"),
        "power_kw":   pd.to_numeric(df["Current"],  errors="coerce")
                      * pd.to_numeric(df["Voltage"], errors="coerce") / 1000,
        "anomaly":    df["anomaly"].fillna(0).astype(int) if "anomaly" in df.columns else 0,
    })
    adapted = adapted.dropna(subset=["current_a", "voltage_v"])
    return adapted


def main(skab_dir: str = SKAB_DIR, output: str = OUTPUT):
    if not os.path.isdir(skab_dir):
        print(f"[adapt_skab] SKAB directory not found: {skab_dir}")
        print("  Run: python ml/download_skab.py")
        sys.exit(1)

    csv_files = sorted(f for f in os.listdir(skab_dir) if f.endswith(".csv"))
    if not csv_files:
        print(f"[adapt_skab] No CSV files in {skab_dir}")
        sys.exit(1)

    parts = []
    for fname in csv_files:
        df = load_skab_file(os.path.join(skab_dir, fname))
        if df is not None and len(df) > 0:
            parts.append(df)
            print(f"  ✓ {fname}: {len(df):,} rows, {df['anomaly'].sum()} anomalies")

    if not parts:
        print("[adapt_skab] No usable files found.")
        sys.exit(1)

    combined = pd.concat(parts, ignore_index=True).sort_values("time")
    combined.to_csv(output, index=False)

    total_anom = combined["anomaly"].sum()
    print(f"\n[adapt_skab] Output: {output}")
    print(f"  {len(combined):,} rows total | {total_anom:,} anomaly points "
          f"({100*total_anom/len(combined):.1f}%)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--skab-dir", default=SKAB_DIR)
    parser.add_argument("--output",   default=OUTPUT)
    args = parser.parse_args()
    main(args.skab_dir, args.output)
