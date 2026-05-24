"""
Download SKAB (Skoltech Anomaly Benchmark) dataset into data/skab/.
SKAB contains 35 CSV files with real industrial sensor data including
Current (A) measurements and labeled anomalies.

Usage:
    python ml/download_skab.py
"""
import os
import shutil
import subprocess
import sys

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
SKAB_DIR = os.path.join(DATA_DIR, "skab")
SKAB_RAW = os.path.join(DATA_DIR, "SKAB_raw")
SKAB_REPO = "https://github.com/waico/SKAB.git"


def check_existing():
    if os.path.isdir(SKAB_DIR):
        csv_files = [f for f in os.listdir(SKAB_DIR) if f.endswith(".csv")]
        if csv_files:
            print(f"[SKAB] Already present: {len(csv_files)} CSV files in {SKAB_DIR}")
            return True
    return False


def clone_and_extract():
    print(f"[SKAB] Cloning {SKAB_REPO} ...")
    result = subprocess.run(
        ["git", "clone", "--depth", "1", SKAB_REPO, SKAB_RAW],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        print(f"[SKAB] git clone failed:\n{result.stderr}")
        sys.exit(1)

    # SKAB repo structure: data/other/ and data/valve1/ etc. contain the CSVs
    raw_data = os.path.join(SKAB_RAW, "data")
    if not os.path.isdir(raw_data):
        print(f"[SKAB] Expected data/ folder not found in cloned repo.")
        sys.exit(1)

    os.makedirs(SKAB_DIR, exist_ok=True)

    # Flatten: collect all CSVs from subdirectories
    copied = 0
    for root, _dirs, files in os.walk(raw_data):
        for fname in files:
            if fname.endswith(".csv"):
                src = os.path.join(root, fname)
                # Prefix with subfolder name to avoid collisions
                rel = os.path.relpath(root, raw_data).replace(os.sep, "_")
                dst_name = f"{rel}_{fname}" if rel != "." else fname
                shutil.copy2(src, os.path.join(SKAB_DIR, dst_name))
                copied += 1

    print(f"[SKAB] Copied {copied} CSV files to {SKAB_DIR}")

    # Cleanup raw clone
    shutil.rmtree(SKAB_RAW, ignore_errors=True)


def main():
    os.makedirs(DATA_DIR, exist_ok=True)
    if check_existing():
        return
    clone_and_extract()
    print("[SKAB] Done.")


if __name__ == "__main__":
    main()
