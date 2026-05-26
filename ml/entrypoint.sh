#!/bin/sh
set -e

cd /app
mkdir -p /app/saved_models /data

export SYNTHETIC_DATA_DIR=/data

if [ ! -f /data/synthetic_rul.csv ] || [ ! -f /data/synthetic_current_anomalies.csv ]; then
  echo "[ml-entrypoint] Generating synthetic training data..."
  python generate_synthetic.py
fi

if [ ! -f /app/saved_models/rul_v1.joblib ]; then
  echo "[ml-entrypoint] Training RUL model..."
  python train_rul.py
fi

if [ ! -f /app/saved_models/isolation_forest_v1.joblib ]; then
  echo "[ml-entrypoint] Training IsolationForest..."
  python train_isolation_forest.py
fi

echo "[ml-entrypoint] Starting uvicorn..."
exec uvicorn api:app --host 0.0.0.0 --port 8002
