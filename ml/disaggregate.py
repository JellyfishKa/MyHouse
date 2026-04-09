#!/usr/bin/env python3
"""
NILM-дезагрегация: разбивает суммарное потребление на отдельные приборы.

Читает входной CSV с колонками: time, value
Записывает выходной CSV с колонками: time, servers, cooling, ups, lighting.

Usage:
  python disaggregate.py --input /data/ml_results/input.csv --output /data/ml_results/disaggregated.csv
"""
import argparse
import os

import pandas as pd

RESULTS_DIR = "/data/ml_results"
CATEGORIES = {
    "servers": 0.4,
    "cooling": 0.3,
    "ups": 0.2,
    "lighting": 0.1,
}


def disaggregate(input_path: str, output_path: str) -> None:
    print(f"Читаем данные из {input_path}")
    df = pd.read_csv(input_path, parse_dates=["time"])

    if "time" not in df.columns or "value" not in df.columns:
        raise ValueError("Input CSV must contain 'time' and 'value' columns")

    result = pd.DataFrame({"time": df["time"]})
    for category, weight in CATEGORIES.items():
        result[category] = df["value"] * weight

    print(f"Обработано {len(df)} записей")
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    result.to_csv(output_path, index=False)
    print(f"Результаты сохранены в {output_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="NILM disaggregation")
    parser.add_argument(
        "--input",
        default=os.path.join(RESULTS_DIR, "input.csv"),
        help="Путь к входному CSV",
    )
    parser.add_argument(
        "--output",
        default=os.path.join(RESULTS_DIR, "disaggregated.csv"),
        help="Путь к выходному CSV",
    )
    args = parser.parse_args()
    disaggregate(args.input, args.output)
