import pandas as pd
import numpy as np
from sklearn.ensemble import IsolationForest


class MLModel:
    def __init__(self, contamination=0.005, window_size=1000, threshold=0.25):
        self.model = IsolationForest(
            contamination=contamination,
            random_state=42
        )
        self.window_size = window_size
        self.threshold = threshold
        self.feature_cols = None

    def _data_preparation(self, data: pd.DataFrame) -> pd.DataFrame:
        features = []

        signal_columns = [col for col in data.columns if col != "time"]

        for i in range(0, len(data), self.window_size):
            window = data.iloc[i:i+self.window_size]

            if len(window) == 0:
                continue

            stats = {"start_time": data["time"].iloc[i]}

            for col in signal_columns:
                stats[f"{col}_rms"] = np.mean(window[col] ** 2)
                stats[f"{col}_std"] = window[col].std()
                stats[f"{col}_max"] = window[col].abs().max()

            features.append(stats)

        X = pd.DataFrame(features)
        self.feature_cols = [col for col in X.columns if col != "start_time"]

        return X

    def fit_predict(self, data: pd.DataFrame):
        X = self._data_preparation(data)
        return X, self.model.fit_predict(X[self.feature_cols])

    def predict_frame_status(self, data: pd.DataFrame):
        X = self._data_preparation(data)
        pred = self.model.predict(X[self.feature_cols])

        anomaly_ratio = np.mean(pred == -1)

        return "anomaly" if anomaly_ratio > self.threshold else "stable"