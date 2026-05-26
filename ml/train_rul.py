"""
Train RUL (Remaining Useful Life) regression model on synthetic degradation data.
Saves model to ml/saved_models/rul_v1.joblib.

Usage:
    python ml/train_rul.py
"""
import os
import sys

import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, r2_score

sys.path.insert(0, os.path.dirname(__file__))
from rul_model import RULModel

DATA_DIR = os.environ.get(
    "SYNTHETIC_DATA_DIR",
    os.path.join(os.path.dirname(__file__), "..", "data"),
)
RUL_CSV  = os.path.join(DATA_DIR, "synthetic_rul.csv")

HISTORY_LEN = 7   # number of past windows for trend_slope


def add_trend_slope(df: pd.DataFrame) -> pd.DataFrame:
    """Add trend_slope feature: linear slope over previous HISTORY_LEN rms values."""
    slopes = []
    rms_vals = df["current_rms"].values

    for i in range(len(df)):
        start = max(0, i - HISTORY_LEN)
        history = rms_vals[start:i + 1]
        if len(history) >= 2:
            xs    = np.arange(len(history))
            slope = float(np.polyfit(xs, history, 1)[0])
        else:
            slope = 0.0
        slopes.append(slope)

    df = df.copy()
    df["trend_slope"] = slopes
    return df


def main():
    if not os.path.exists(RUL_CSV):
        print(f"[train_rul] ERROR: {RUL_CSV} not found. Run generate_synthetic.py first.")
        sys.exit(1)

    print(f"[train_rul] Loading {RUL_CSV} ...")
    df = pd.read_csv(RUL_CSV)
    print(f"  {len(df):,} rows, days 0-{df['day'].max()}")

    df = add_trend_slope(df)

    feature_cols = ["current_rms", "current_std", "current_max", "spike_freq", "trend_slope"]
    X = df[feature_cols].values
    y = df["rul"].values

    # Temporal split: first 80% of days for train, last 20% for test
    split_day = int(df["day"].max() * 0.8)
    train_mask = df["day"] <= split_day
    test_mask  = df["day"] >  split_day

    X_train, y_train = X[train_mask], y[train_mask]
    X_test,  y_test  = X[test_mask],  y[test_mask]

    print(f"[train_rul] Train: {len(X_train):,} | Test: {len(X_test):,}")

    model = RULModel()
    print("[train_rul] Training GradientBoostingRegressor ...")
    model.fit(X_train, y_train)

    # Evaluate
    y_pred = model.model.predict(X_test)
    mae    = mean_absolute_error(y_test, y_pred)
    r2     = r2_score(y_test, y_pred)

    print(f"\n[eval] MAE  : {mae:.1f} days")
    print(f"[eval] R2   : {r2:.3f}")

    if mae <= 20:
        print("[eval] OK MAE <= 20 days -- model is acceptable")
    else:
        print("[eval] WARN MAE > 20 days -- consider more data or feature engineering")

    # Sample predictions
    print("\n[eval] Sample predictions vs actual (test set, every 10th row):")
    for i in range(0, min(50, len(y_test)), 5):
        print(f"  actual={int(y_test[i]):>4} days  predicted={int(y_pred[i]):>4} days")

    print("\n[train_rul] Done.")


if __name__ == "__main__":
    main()
