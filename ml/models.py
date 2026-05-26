import os

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest

MODEL_DIR = os.path.join(os.path.dirname(__file__), "saved_models")
IF_PATH   = os.path.join(MODEL_DIR, "isolation_forest_v1.joblib")


class MLModel:
    def __init__(self, contamination=0.005, window_size=1000, threshold=0.25):
        os.makedirs(MODEL_DIR, exist_ok=True)
        self.window_size = window_size
        self.threshold   = threshold
        self.feature_cols = None

        if os.path.exists(IF_PATH):
            saved = joblib.load(IF_PATH)
            self.model        = saved.get("clf", IsolationForest(contamination=contamination, random_state=42))
            self.feature_cols = saved.get("feature_cols")
        else:
            self.model = IsolationForest(contamination=contamination, random_state=42)

    def save(self):
        os.makedirs(MODEL_DIR, exist_ok=True)
        joblib.dump({"clf": self.model, "feature_cols": self.feature_cols}, IF_PATH)
        print(f"[MLModel] Saved -> {IF_PATH}")

    def _data_preparation(self, data: pd.DataFrame) -> pd.DataFrame:
        features = []

        signal_columns = [col for col in data.columns if col != "time"]

        for i in range(0, len(data), self.window_size):
            window = data.iloc[i:i+self.window_size]

            if len(window) == 0:
                continue

            stats = {"start_time": data["time"].iloc[i]}

            for col in signal_columns:
                col_vals = window[col].dropna()
                if col_vals.empty:
                    stats[f"{col}_rms"] = 0.0
                    stats[f"{col}_std"] = 0.0
                    stats[f"{col}_max"] = 0.0
                else:
                    stats[f"{col}_rms"] = float(np.sqrt(np.mean(col_vals ** 2)))
                    stats[f"{col}_std"] = float(col_vals.std())
                    stats[f"{col}_max"] = float(col_vals.abs().max())

            features.append(stats)

        X = pd.DataFrame(features)
        self.feature_cols = [col for col in X.columns if col != "start_time"]

        return X

    def fit(self, data: pd.DataFrame, save: bool = True):
        X = self._data_preparation(data)
        self.model.fit(X[self.feature_cols])
        if save:
            self.save()
        return X

    def predict(self, data: pd.DataFrame):
        X = self._data_preparation(data)
        return X, self.model.predict(X[self.feature_cols])

    def fit_predict(self, data: pd.DataFrame):
        X = self._data_preparation(data)
        return X, self.model.fit_predict(X[self.feature_cols])

    def predict_frame_status(self, data: pd.DataFrame):
        X = self._data_preparation(data)
        pred = self.model.predict(X[self.feature_cols])

        anomaly_ratio = np.mean(pred == -1)

        return "anomaly" if anomaly_ratio > self.threshold else "stable"