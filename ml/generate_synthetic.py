"""
Generate two synthetic datasets for ML training:

1. data/synthetic_current_anomalies.csv
   30 days × 1 reading/min, labeled anomalies (spike/drift/oscillation)
   Columns: datetime, current_a, voltage_v, power_kw, anomaly, anomaly_type

2. data/synthetic_rul.csv
   180-day degradation trajectory with RUL labels
   Columns: day, window_idx, current_rms, current_std, current_max, spike_freq, rul

Usage:
    python ml/generate_synthetic.py
"""
import os
import numpy as np
import pandas as pd

DATA_DIR = os.environ.get(
    "SYNTHETIC_DATA_DIR",
    os.path.join(os.path.dirname(__file__), "..", "data"),
)
ANOMALY_CSV = os.path.join(DATA_DIR, "synthetic_current_anomalies.csv")
RUL_CSV     = os.path.join(DATA_DIR, "synthetic_rul.csv")

RNG = np.random.default_rng(42)

# ─── Dataset 1: Normal operation + labeled anomalies ──────────────────────────

DAYS        = 30
FREQ_MIN    = 1          # 1 reading per minute
TOTAL_ROWS  = DAYS * 24 * 60   # 43 200

# Base load: 8-12A sinusoidal daily pattern
def base_current(ts: pd.DatetimeIndex) -> np.ndarray:
    hour = ts.hour + ts.minute / 60
    # Peak 10:00-18:00, trough 02:00-06:00
    daily = 2.0 * np.sin(np.pi * (hour - 2) / 16)  # -2 to +2
    return 10.0 + daily + RNG.normal(0, 0.3, len(ts))


def inject_anomalies(df: pd.DataFrame) -> pd.DataFrame:
    anomaly     = np.zeros(len(df), dtype=int)
    atype       = np.full(len(df), "", dtype=object)

    n_spikes    = 15
    n_drifts    = 4
    n_oscills   = 6

    # --- Spikes
    for _ in range(n_spikes):
        start = RNG.integers(0, len(df) - 30)
        dur   = int(RNG.integers(5, 31))
        amp   = RNG.uniform(8, 15)
        end   = min(start + dur, len(df))
        df.iloc[start:end, df.columns.get_loc("current_a")] += amp
        anomaly[start:end] = 1
        atype[start:end]   = "spike"

    # --- Drifts (gradual +0.05A/step over 12-24h)
    for _ in range(n_drifts):
        dur   = int(RNG.integers(12 * 60, 24 * 60))
        start = RNG.integers(0, len(df) - dur)
        slope = 0.05 / 60          # per minute
        ramp  = np.arange(dur) * slope
        end   = start + dur
        df.iloc[start:end, df.columns.get_loc("current_a")] += ramp
        anomaly[start:end] = 1
        atype[start:end]   = "drift"

    # --- Oscillations (±3A at 0.05 Hz, 60s bursts)
    for _ in range(n_oscills):
        start = RNG.integers(0, len(df) - 60)
        t     = np.arange(60)
        osc   = 3.0 * np.sin(2 * np.pi * 0.05 * t)
        df.iloc[start:start+60, df.columns.get_loc("current_a")] += osc
        anomaly[start:start+60] = 1
        atype[start:start+60]   = "oscillation"

    df["anomaly"]      = anomaly
    df["anomaly_type"] = atype
    return df


def generate_anomaly_dataset() -> pd.DataFrame:
    ts = pd.date_range("2024-01-01", periods=TOTAL_ROWS, freq="min", tz="UTC")
    current = base_current(ts)
    voltage = RNG.normal(220, 2, TOTAL_ROWS)          # 220V ± 2V
    power   = current * voltage / 1000                 # kW

    df = pd.DataFrame({
        "datetime":   ts,
        "current_a":  current,
        "voltage_v":  voltage,
        "power_kw":   power,
    })
    df = inject_anomalies(df)
    # Clamp current to realistic range
    df["current_a"] = df["current_a"].clip(0, 30)
    return df


# ─── Dataset 2: Degradation / RUL ─────────────────────────────────────────────

TOTAL_DAYS  = 180
WIN_SIZE    = 60          # 60-minute windows
STEP        = 30          # 30-minute step
MINS_PER_DAY = 24 * 60


def day_current(day: int, minute_arr: np.ndarray) -> np.ndarray:
    """Generate per-minute current for one day with increasing degradation."""
    phase = day / TOTAL_DAYS

    if phase < 0.5:           # Phase 1: healthy
        base     = 10.0
        noise_σ  = 0.3
        spike_p  = 0.01 / MINS_PER_DAY
    elif phase < 0.83:        # Phase 2: degrading
        progress = (phase - 0.5) / 0.33
        base     = 10.0 + progress * 3.0
        noise_σ  = 0.3 + progress * 0.7
        spike_p  = 0.01 / MINS_PER_DAY + progress * 0.03 / MINS_PER_DAY
    else:                     # Phase 3: critical
        progress = (phase - 0.83) / 0.17
        base     = 13.0 + progress * 4.5
        noise_σ  = 1.0 + progress * 1.5
        spike_p  = 0.04 / MINS_PER_DAY + progress * 0.1 / MINS_PER_DAY

    signal = base + RNG.normal(0, noise_σ, len(minute_arr))

    # Inject spikes
    spike_mask = RNG.random(len(minute_arr)) < spike_p
    signal[spike_mask] += RNG.uniform(5, 12, spike_mask.sum())

    return signal.clip(0, 30)


def extract_window_features(signal: np.ndarray, spike_baseline: float) -> dict:
    rms        = float(np.sqrt(np.mean(signal ** 2)))
    std        = float(np.std(signal))
    max_       = float(np.max(np.abs(signal)))
    spike_freq = float(np.mean(signal > spike_baseline * 1.5))
    return {"current_rms": rms, "current_std": std, "current_max": max_, "spike_freq": spike_freq}


def generate_rul_dataset() -> pd.DataFrame:
    rows = []
    spike_baseline = 10.0

    for day in range(TOTAL_DAYS):
        rul    = TOTAL_DAYS - 1 - day
        signal = day_current(day, np.arange(MINS_PER_DAY))

        win_idx = 0
        for start in range(0, MINS_PER_DAY - WIN_SIZE + 1, STEP):
            window = signal[start:start + WIN_SIZE]
            feats  = extract_window_features(window, spike_baseline)
            rows.append({"day": day, "window_idx": win_idx, "rul": rul, **feats})
            win_idx += 1

    return pd.DataFrame(rows)


# ─── Main ──────────────────────────────────────────────────────────────────────

def main():
    os.makedirs(DATA_DIR, exist_ok=True)

    print("[synthetic] Generating anomaly dataset …")
    df_anom = generate_anomaly_dataset()
    df_anom.to_csv(ANOMALY_CSV, index=False)
    n_anom = df_anom["anomaly"].sum()
    print(f"  -> {ANOMALY_CSV}  ({len(df_anom):,} rows, {n_anom:,} anomaly points)")

    print("[synthetic] Generating RUL dataset …")
    df_rul = generate_rul_dataset()
    df_rul.to_csv(RUL_CSV, index=False)
    print(f"  -> {RUL_CSV}  ({len(df_rul):,} rows, {TOTAL_DAYS} days)")


if __name__ == "__main__":
    main()
