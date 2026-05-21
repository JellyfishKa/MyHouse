"""
RUL (Remaining Useful Life) prediction model.
Uses GradientBoostingRegressor trained on synthetic degradation data.

Features per window:
    current_rms, current_std, current_max, spike_freq, trend_slope

Target: rul_days (integer, days until failure)
"""
import os

import joblib
import numpy as np
from sklearn.ensemble import GradientBoostingRegressor

MODEL_DIR = os.path.join(os.path.dirname(__file__), "saved_models")
RUL_PATH  = os.path.join(MODEL_DIR, "rul_v1.joblib")

FEATURE_COLS = ["current_rms", "current_std", "current_max", "spike_freq", "trend_slope"]


class RULModel:
    def __init__(self):
        os.makedirs(MODEL_DIR, exist_ok=True)
        if os.path.exists(RUL_PATH):
            saved       = joblib.load(RUL_PATH)
            self.model  = saved["model"]
            self.trained = True
        else:
            self.model  = GradientBoostingRegressor(
                n_estimators=200, max_depth=4, learning_rate=0.05, random_state=42
            )
            self.trained = False

    def fit(self, X: np.ndarray, y: np.ndarray):
        self.model.fit(X, y)
        self.trained = True
        self.save()

    def save(self):
        os.makedirs(MODEL_DIR, exist_ok=True)
        joblib.dump({"model": self.model}, RUL_PATH)
        print(f"[RULModel] Saved -> {RUL_PATH}")

    def predict(self, features: np.ndarray | list) -> dict:
        if not self.trained:
            raise RuntimeError("RUL model not trained yet. Run train_rul.py first.")
        arr = np.array(features).reshape(1, -1)
        rul = float(self.model.predict(arr)[0])
        rul = max(0, round(rul))

        status = "ok" if rul >= 90 else "warning" if rul >= 30 else "critical"
        confidence = "medium" if self.trained else "low"

        return {
            "rul_days":           rul,
            "status":             status,
            "confidence":         confidence,
            "failure_probability": round(max(0.0, min(1.0, 1 - rul / 180)), 3),
        }

    @staticmethod
    def compute_features(signal: np.ndarray, prev_rms_history: list | None = None) -> list:
        """
        Compute the 5 features for a window of current readings.
        prev_rms_history: list of past RMS values (for trend_slope).
        """
        rms        = float(np.sqrt(np.mean(signal ** 2)))
        std        = float(np.std(signal))
        max_       = float(np.max(np.abs(signal)))
        baseline   = 10.0
        spike_freq = float(np.mean(signal > baseline * 1.5))

        if prev_rms_history and len(prev_rms_history) >= 2:
            xs    = np.arange(len(prev_rms_history))
            slope = float(np.polyfit(xs, prev_rms_history, 1)[0])
        else:
            slope = 0.0

        return [rms, std, max_, spike_freq, slope]
