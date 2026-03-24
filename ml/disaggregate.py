#!/usr/bin/env python3
"""
NILM-дезагрегация: разбивает суммарное потребление на отдельные приборы.

Читает данные из /data/ml_results/input.csv или из БД,
записывает результаты в /data/ml_results/disaggregated.csv.

Usage:
  python disaggregate.py --input /data/ml_results/input.csv
"""
import argparse
import os

import pandas as pd

RESULTS_DIR = "/data/ml_results"


def disaggregate(input_path: str, output_path: str) -> None:
    print(f"Читаем данные из {input_path}")
    df = pd.read_csv(input_path, parse_dates=["time"])

    # Placeholder: в реальной реализации здесь NILMTK pipeline
    # from nilmtk import DataSet
    # ...

    print(f"Обработано {len(df)} записей")
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    df.to_csv(output_path, index=False)
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
