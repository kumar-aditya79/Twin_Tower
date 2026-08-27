import os
import sys
import numpy as np
import pandas as pd

from ml.digital_twin_inference import DigitalTwinInferenceEngine


def print_dashboard_panel(sample, diag_result, label_title):
    print("=" * 65)
    print(f"  AERO-PISTON ENGINE DIGITAL TWIN - {label_title.upper()}")
    print("=" * 65)
    print(f"  Flight Mission Time : {sample['time_s']:.1f} s")
    print(f"  Altitude           : {sample['altitude_ft']:,.0f} ft")
    print(f"  Throttle           : {sample['throttle']*100:.0f} %")
    print("-" * 65)
    print("  ENGINE SENSOR TELEMETRY")
    print("-" * 65)
    print(f"  Engine Speed (RPM) : {sample['rpm']:.0f} RPM")
    print(f"  Net Brake Power    : {sample['power_kw']:.1f} kW")
    print(f"  Fuel Consumption   : {sample['fuel_flow_l_hr']:.2f} L/h")
    print(f"  Exhaust Gas Temp   : {sample['egt_c']:.1f} deg C")
    print(f"  Cylinder Head Temp : {sample['cht_c']:.1f} deg C")
    print(f"  Oil Temperature    : {sample['oil_temp_c']:.1f} deg C")
    print(f"  Oil Pressure       : {sample['oil_pressure_bar']:.2f} bar")
    print(f"  Vibration Level    : {sample['vibration_g']:.2f} g")
    print("-" * 65)
    print("  DIGITAL TWIN DIAGNOSTIC HEALTH MONITOR")
    print("-" * 65)
    print(f"  Engine Health Status: {diag_result['status']}")
    print(f"  Anomaly Probability : {diag_result['anomaly_probability']*100:.1f} %")
    print(f"  Health Index Score  : {diag_result['health_index']:.0f} / 100")
    print(f"  Fault Severity      : {diag_result['severity_label']}")
    print(f"  Severity Confidence : {diag_result['severity_confidence']*100:.1f} %")
    print("=" * 65 + "\n")


def main():
    engine = DigitalTwinInferenceEngine()

    mission_csv = os.path.join("data", "degraded_injector_telemetry.csv")
    if not os.path.exists(mission_csv):
        raise FileNotFoundError(f"Mission CSV not found at {mission_csv}. Run main.py first.")

    df_mission = pd.read_csv(mission_csv)

    # 1. Healthy Snapshot at t = 15.0 s
    idx_healthy = (df_mission["time_s"] - 15.0).abs().argmin()
    sample_healthy = df_mission.iloc[idx_healthy]
    diag_healthy = engine.predict_sample(sample_healthy)

    print_dashboard_panel(sample_healthy, diag_healthy, "Healthy Baseline State (t = 15.0 s)")

    # 2. Degraded Fault Snapshot at t = 45.0 s
    idx_degraded = (df_mission["time_s"] - 45.0).abs().argmin()
    sample_degraded = df_mission.iloc[idx_degraded]
    diag_degraded = engine.predict_sample(sample_degraded)

    print_dashboard_panel(sample_degraded, diag_degraded, "Injector Degraded State (t = 45.0 s)")

    print("[SUCCESS] Digital Twin Terminal CLI Demonstration Complete!")


if __name__ == "__main__":
    main()
