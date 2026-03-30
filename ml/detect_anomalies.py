#!/usr/bin/env python3
"""
Обнаружение аномалий в данных потребления электроэнергии.

Читает disaggregated.csv из shared volume,
применяет IsolationForest (scikit-learn),
записывает аномалии в /data/ml_results/anomalies.csv.

Usage:
  python detect_anomalies.py
  python detect_anomalies.py --input /data/ml_results/disaggregated.csv
"""
import argparse
import os
import pandas as pd

from models import MLModel

RESULTS_DIR = "/data/ml_results"


def detect_anomalies(input_path: str, output_path: str) -> None:
    print(f"Читаем данные из {input_path}")

    df = pd.read_csv(input_path, parse_dates=["time"])

    model = MLModel()
    features, predictions = model.fit_predict(df)

    features["anomaly"] = predictions
    anomalies = features[features["anomaly"] == -1]

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    anomalies.to_csv(output_path, index=False)

    print(f"Найдено {len(anomalies)} аномалий")
    print(f"Результаты сохранены в {output_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--input",
        default=os.path.join(RESULTS_DIR, "disaggregated.csv"),
        help="Путь к входному CSV",
    )
    parser.add_argument(
        "--output",
        default=os.path.join(RESULTS_DIR, "anomalies.csv"),
        help="Путь к выходному CSV",
    )

    args = parser.parse_args()

    detect_anomalies(args.input, args.output)
    