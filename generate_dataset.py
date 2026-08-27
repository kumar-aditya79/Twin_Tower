import os
import time
import numpy as np
import pandas as pd

from Engine.engine import PistonEngine
from Engine.simulation import EngineSimulator


def generate_dataset():
    print("=" * 70)
    print("  AERO-PISTON ENGINE DIGITAL TWIN - TELEMETRY DATASET GENERATOR")
    print("=" * 70)

    # Operating Condition Grid Search Vectors
    altitudes = [0.0, 5000.0, 10000.0, 15000.0, 20000.0]        # 5 levels
    throttles = [0.40, 0.50, 0.60, 0.70, 0.80, 0.90]             # 6 levels
    temp_offsets = [-10.0, 0.0, 10.0]                            # 3 levels
    injector_efficiencies = [1.00, 0.95, 0.90, 0.85, 0.80]       # 5 levels

    total_runs = len(altitudes) * len(throttles) * len(temp_offsets) * len(injector_efficiencies)
    print(f"\n[CONFIG] Generating Multi-Scenario Dataset:")
    print(f"    Altitudes:         {altitudes} ft")
    print(f"    Throttles:         {[int(t*100) for t in throttles]}%")
    print(f"    Temp Offsets:      {temp_offsets} °C")
    print(f"    Injector Health:   {[int(e*100) for e in injector_efficiencies]}%")
    print(f"    Total Matrix Runs: {total_runs}")

    duration_s = 60.0
    dt = 0.1  # 0.1s integration step (601 samples/run)

    all_dfs = []
    run_id = 0
    start_time = time.time()

    for alt in altitudes:
        for th in throttles:
            for toff in temp_offsets:
                for inj_eff in injector_efficiencies:
                    run_id += 1
                    
                    # Create engine instance and apply health parameter
                    engine = PistonEngine(displacement_l=3.0, inertia=0.20)
                    engine.injector_efficiency = inj_eff
                    
                    simulator = EngineSimulator(engine)
                    
                    # Determine condition label & numerical binary label
                    if inj_eff == 1.00:
                        condition = "healthy"
                        health_label = 0  # 0 = Normal / Healthy
                    else:
                        condition = f"degraded_inj_{int(inj_eff*100)}"
                        health_label = 1  # 1 = Anomaly / Degraded

                    # Run dynamic RK4 simulation
                    df_run = simulator.run(
                        duration_s=duration_s,
                        dt=dt,
                        throttle_profile=th,
                        altitude_profile=alt,
                        temp_offset_profile=toff,
                        initial_rpm=2500.0,
                        initial_cht=75.0,
                        initial_oil_temp=65.0,
                    )

                    # Add metadata columns
                    df_run["run_id"] = run_id
                    df_run["condition"] = condition
                    df_run["health_label"] = health_label
                    df_run["injector_efficiency"] = inj_eff

                    all_dfs.append(df_run)

                    if run_id % 50 == 0 or run_id == total_runs:
                        elapsed = time.time() - start_time
                        print(f"    Progress: {run_id}/{total_runs} runs completed ({elapsed:.1f}s)")

    # Combine all runs
    dataset_df = pd.concat(all_dfs, ignore_index=True)

    # -------------------------------------------------------------
    # Automated Sanity Checks
    # -------------------------------------------------------------
    print("\n[VERIFICATION] Conducting Dataset Sanity Checks:")
    print(f"    Total Dataset Rows:    {len(dataset_df):,}")
    print(f"    Total Unique Runs:     {dataset_df['run_id'].nunique()}")

    # 1. Null / NaN check
    null_count = dataset_df.isnull().sum().sum()
    print(f"    Null / NaN Count:      {null_count} (Expected: 0)")
    assert null_count == 0, "ERROR: Dataset contains null values!"

    # 2. Infinite value check
    inf_count = np.isinf(dataset_df.select_dtypes(include=np.number)).sum().sum()
    print(f"    Inf Value Count:       {inf_count} (Expected: 0)")
    assert inf_count == 0, "ERROR: Dataset contains infinite values!"

    # 3. Physical range lower bound checks
    print(f"    RPM Range:             {dataset_df['rpm'].min():.0f} to {dataset_df['rpm'].max():.0f} RPM")
    print(f"    Power Range:           {dataset_df['power_kw'].min():.1f} to {dataset_df['power_kw'].max():.1f} kW")
    print(f"    Fuel Flow Range:       {dataset_df['fuel_flow_l_hr'].min():.1f} to {dataset_df['fuel_flow_l_hr'].max():.1f} L/h")
    print(f"    CHT Range:             {dataset_df['cht_c'].min():.1f} to {dataset_df['cht_c'].max():.1f} °C")
    print(f"    EGT Range:             {dataset_df['egt_c'].min():.1f} to {dataset_df['egt_c'].max():.1f} °C")
    print(f"    Oil Pressure Range:    {dataset_df['oil_pressure_bar'].min():.2f} to {dataset_df['oil_pressure_bar'].max():.2f} bar")

    assert dataset_df['rpm'].min() > 0, "ERROR: Negative or zero RPM found!"
    assert dataset_df['power_kw'].min() >= 0, "ERROR: Negative power found!"
    assert dataset_df['fuel_flow_l_hr'].min() >= 0, "ERROR: Negative fuel flow found!"

    # 4. Condition counts
    print("\n    Condition Breakdown:")
    for cond, count in dataset_df["condition"].value_counts().items():
        print(f"      - {cond:<20}: {count:,} samples ({count//601} runs)")

    # -------------------------------------------------------------
    # Export CSV Dataset
    # -------------------------------------------------------------
    data_dir = "data"
    os.makedirs(data_dir, exist_ok=True)
    export_path = os.path.join(data_dir, "engine_telemetry_dataset.csv")
    dataset_df.to_csv(export_path, index=False)

    print(f"\n[SUCCESS] Dataset successfully generated and saved to: {export_path}")


if __name__ == "__main__":
    generate_dataset()
