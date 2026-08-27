import os
import numpy as np
import pandas as pd


def explore_dataset():
    print("=" * 75)
    print("  AERO-PISTON ENGINE DIGITAL TWIN - DATASET EXPLORATION & AUDIT")
    print("=" * 75)

    csv_path = os.path.join("data", "engine_telemetry_dataset.csv")
    if not os.path.exists(csv_path):
        raise FileNotFoundError(f"Dataset not found at {csv_path}. Run generate_dataset.py first.")

    print(f"\n[1] Loading Telemetry Dataset from: {csv_path}")
    df = pd.read_csv(csv_path)

    # 1. Dataset Shape & Memory Usage
    rows, cols = df.shape
    mem_mb = df.memory_usage(deep=True).sum() / (1024 * 1024)
    print(f"    Total Rows:            {rows:,}")
    print(f"    Total Columns:         {cols}")
    print(f"    Memory Usage:          {mem_mb:.2f} MB")

    # 2. Column Types Audit
    print(f"\n[2] Column List & Data Types:")
    for col in df.columns:
        print(f"    - {col:<25} {str(df[col].dtype):<15}")

    # 3. Missing / NaN Values Audit
    null_sum = df.isnull().sum().sum()
    print(f"\n[3] Missing / NaN Values Check:")
    print(f"    Total Null Values:     {null_sum} (Expected: 0)")
    assert null_sum == 0, "ERROR: Dataset contains null values!"

    # 4. Infinite Values Audit
    num_cols = df.select_dtypes(include=np.number).columns
    inf_sum = np.isinf(df[num_cols]).sum().sum()
    print(f"\n[4] Infinite Values Check:")
    print(f"    Total Inf Values:      {inf_sum} (Expected: 0)")
    assert inf_sum == 0, "ERROR: Dataset contains infinite values!"

    # 5. Duplicate Rows Audit
    dup_sum = df.duplicated().sum()
    print(f"\n[5] Duplicate Rows Check:")
    print(f"    Exact Duplicate Rows:  {dup_sum}")

    # 6. Condition & Health Breakdown
    print(f"\n[6] Health Condition Breakdown:")
    for cond, count in df["condition"].value_counts().items():
        pct = (count / rows) * 100
        runs = df[df["condition"] == cond]["run_id"].nunique()
        print(f"    - {cond:<22}: {count:,} samples ({pct:.1f}%) | {runs} runs")

    # 7. Injector Efficiency Distribution
    print(f"\n[7] Injector Health Efficiency Distribution:")
    for eff, count in df["injector_efficiency"].value_counts().sort_index(ascending=False).items():
        pct = (count / rows) * 100
        print(f"    - {int(eff*100)}% Injector Efficiency:  {count:,} samples ({pct:.1f}%)")

    # 8. Per-Run Sample Count Verification
    samples_per_run = df.groupby("run_id").size()
    print(f"\n[8] Per-Run Sample Count Audit:")
    print(f"    Total Unique Runs:     {len(samples_per_run)}")
    print(f"    Samples Per Run:       Min = {samples_per_run.min()}, Max = {samples_per_run.max()}, Mean = {samples_per_run.mean():.1f}")
    assert samples_per_run.min() == samples_per_run.max(), "ERROR: Inconsistent sample counts per run!"

    # 9. Feature Range & Statistics Summary
    sensor_features = [
        "rpm", "torque_net_nm", "power_kw", "fuel_flow_l_hr",
        "egt_c", "cht_c", "oil_temp_c", "oil_pressure_bar", "vibration_g"
    ]
    print(f"\n[9] Feature Range Statistics Summary:")
    print("-" * 75)
    print(f"{'Feature':<20}{'Min':<12}{'Max':<12}{'Mean':<12}{'Std':<12}")
    print("-" * 75)
    for feat in sensor_features:
        print(
            f"{feat:<20}"
            f"{df[feat].min():<12.2f}"
            f"{df[feat].max():<12.2f}"
            f"{df[feat].mean():<12.2f}"
            f"{df[feat].std():<12.2f}"
        )
    print("-" * 75)

    print("\n[SUCCESS] Dataset Exploration & Quality Audit Complete!")


if __name__ == "__main__":
    explore_dataset()

