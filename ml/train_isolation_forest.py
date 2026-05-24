"""
Train IsolationForest on SKAB + synthetic normal data.
Saves model to ml/saved_models/isolation_forest_v1.joblib.

Usage:
    python ml/train_isolation_forest.py
"""
import os
import sys

import numpy as np
import pandas as pd
from sklearn.metrics import classification_report, f1_score

# Ensure ml/ is on path
sys.path.insert(0, os.path.dirname(__file__))
from models import MLModel

DATA_DIR  = os.path.join(os.path.dirname(__file__), "..", "data")
SKAB_DIR  = os.path.join(DATA_DIR, "skab")
SKAB_CSV  = os.path.join(DATA_DIR, "skab_adapted.csv")
SYNTH_CSV = os.path.join(DATA_DIR, "synthetic_current_anomalies.csv")

WINDOW_SIZE = 100
STEP        = 50


def load_current_data(path: str, current_col: str = "current_a",
                      anomaly_col: str = "anomaly", time_col: str = "datetime") -> pd.DataFrame:
    df = pd.read_csv(path, parse_dates=[time_col], low_memory=False)
    # Normalise column names
    df = df.rename(columns={time_col: "time"})
    if current_col not in df.columns:
        raise ValueError(f"Column '{current_col}' not found in {path}. Columns: {list(df.columns)}")
    df["current_a"] = pd.to_numeric(df[current_col], errors="coerce")
    df["anomaly"]   = df[anomaly_col].fillna(0).astype(int) if anomaly_col in df.columns else 0
    df = df.dropna(subset=["current_a"])
    return df[["time", "current_a", "anomaly"]]


def extract_windows(df: pd.DataFrame, window_size: int, step: int) -> tuple[pd.DataFrame, np.ndarray]:
    """Extract statistical features from sliding windows."""
    rows, labels = [], []
    signal = df["current_a"].values
    anom   = df["anomaly"].values

    for start in range(0, len(signal) - window_size + 1, step):
        w      = signal[start:start + window_size]
        label  = int(anom[start:start + window_size].max())   # 1 if any anomaly in window
        rows.append({
            "current_rms": float(np.sqrt(np.mean(w ** 2))),
            "current_std": float(np.std(w)),
            "current_max": float(np.max(np.abs(w))),
        })
        labels.append(label)

    return pd.DataFrame(rows), np.array(labels)


def main():
    parts_normal, parts_eval_X, parts_eval_y = [], [], []

    # --- SKAB adapted CSV
    if os.path.exists(SKAB_CSV):
        print(f"[train] Loading SKAB adapted: {SKAB_CSV}")
        df_skab = load_current_data(SKAB_CSV, time_col="time")
        X_skab, y_skab = extract_windows(df_skab, WINDOW_SIZE, STEP)
        parts_normal.append(X_skab[y_skab == 0])
        parts_eval_X.append(X_skab)
        parts_eval_y.append(y_skab)
        print(f"  SKAB: {len(X_skab)} windows, {y_skab.sum()} anomaly windows")
    else:
        print(f"[train] SKAB CSV not found at {SKAB_CSV}. Run adapt_skab.py first.")

    # --- Synthetic CSV
    if os.path.exists(SYNTH_CSV):
        print(f"[train] Loading synthetic: {SYNTH_CSV}")
        df_syn = load_current_data(SYNTH_CSV, time_col="datetime")
        X_syn, y_syn = extract_windows(df_syn, WINDOW_SIZE, STEP)
        parts_normal.append(X_syn[y_syn == 0])
        parts_eval_X.append(X_syn)
        parts_eval_y.append(y_syn)
        print(f"  Synthetic: {len(X_syn)} windows, {y_syn.sum()} anomaly windows")
    else:
        print(f"[train] Synthetic CSV not found. Run generate_synthetic.py first.")

    if not parts_normal:
        print("[train] ERROR: No training data available.")
        sys.exit(1)

    X_normal = pd.concat(parts_normal, ignore_index=True)
    print(f"\n[train] Training on {len(X_normal)} normal windows ...")

    # Prepare ML-compatible DataFrame (MLModel expects time + signal columns)
    train_df = pd.DataFrame({
        "time":       pd.date_range("2024-01-01", periods=len(X_normal), freq="min", tz="UTC"),
        "current_a":  X_normal["current_rms"],   # use RMS as single signal column
    })

    model = MLModel(contamination=0.01, window_size=len(train_df), threshold=0.25)
    # Direct sklearn fit on pre-computed features
    model.model.fit(X_normal.values)
    model.feature_cols = list(X_normal.columns)
    model.save()

    # --- Evaluation
    if parts_eval_X:
        X_eval = pd.concat(parts_eval_X, ignore_index=True)
        y_eval = np.concatenate(parts_eval_y)

        preds  = model.model.predict(X_eval.values)
        preds_binary = (preds == -1).astype(int)

        print("\n[eval] Classification Report (anomaly=1):")
        print(classification_report(y_eval, preds_binary, target_names=["normal", "anomaly"]))
        f1 = f1_score(y_eval, preds_binary, pos_label=1, zero_division=0)
        print(f"[eval] F1 (anomaly class): {f1:.3f}")
        if f1 >= 0.7:
            print("[eval] OK F1 >= 0.7 -- model is acceptable")
        else:
            print("[eval] WARN F1 < 0.7 -- consider tuning contamination or window_size")

    print("\n[train] Done.")


if __name__ == "__main__":
    main()
