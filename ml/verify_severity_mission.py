import os
import sys

# Ensure root directory is on Python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from ml.digital_twin_inference import DigitalTwinInferenceEngine


def verify_severity_mission():
    print("=" * 75)
    print("  AERO-PISTON ENGINE DIGITAL TWIN - MISSION SEVERITY REPLAY (M5)")
    print("=" * 75)

    # 1. Initialize Unified Digital Twin Inference Engine
    print("\n[1] Initializing Unified Digital Twin Diagnostic Engine...")
    engine = DigitalTwinInferenceEngine()
    print("    - Physics Estimator, Anomaly Classifier & Severity Classifier loaded.")

    # 2. Load Mission Telemetry Dataset
    mission_csv = os.path.join("data", "degraded_injector_telemetry.csv")
    if not os.path.exists(mission_csv):
        raise FileNotFoundError(f"Mission CSV not found at {mission_csv}. Run main.py first.")

    print(f"\n[2] Loading Mission Telemetry Stream: {mission_csv}")
    df_mission = pd.read_csv(mission_csv)
    print(f"    Total Mission Time Steps: {len(df_mission)} (Duration = {df_mission['time_s'].max():.1f} s)")

    # 3. Stream Vectorized Batch Inference & Apply Temporal 3-Sample Filter
    print("\n[3] Executing Fast Vectorized Inference & Temporal Fault Filter:")
    df_res = engine.predict_dataframe(df_mission)

    # Temporal 3-Sample Consecutive Filter
    consecutive_anomalies = 0
    REQUIRED_CONSECUTIVE = 3
    alarm_statuses = []

    for idx, row in df_res.iterrows():
        if row["status"] == "ANOMALY":
            consecutive_anomalies += 1
        else:
            consecutive_anomalies = 0
        
        if consecutive_anomalies >= REQUIRED_CONSECUTIVE:
            alarm_statuses.append("CONFIRMED FAULT")
        elif row["status"] == "ANOMALY":
            alarm_statuses.append("WARNING")
        else:
            alarm_statuses.append("NORMAL")

    df_res["alarm_status"] = alarm_statuses

    # 4. Sequential Snapshot Table
    print("\n[4] Diagnostic Mission Progression Snapshot:")
    print("-" * 95)
    print(f"{'Time (s)':<10}{'Throttle':<10}{'RPM':<9}{'Power (kW)':<12}{'Vib (g)':<9}{'Anomaly Prob':<15}{'Health Index & Severity':<26}{'Alarm Status':<15}")
    print("-" * 95)
    for st in [5.0, 15.0, 28.0, 31.0, 35.0, 50.0]:
        idx = (df_res["time_s"] - st).abs().argmin()
        row = df_res.iloc[idx]
        th_str = f"{row['throttle']*100:.0f}%"
        prob_str = f"{row['anomaly_probability']*100:.1f}%"
        health_str = f"{row['health_index']:.0f}% ({row['severity_label']})"
        print(
            f"{row['time_s']:<10.1f}"
            f"{th_str:<10}"
            f"{row['rpm']:<9.0f}"
            f"{row['power_kw']:<12.1f}"
            f"{row['vibration_g']:<9.2f}"
            f"{prob_str:<15}"
            f"{health_str:<26}"
            f"{row['alarm_status']:<15}"
        )
    print("-" * 95)

    # 5. Visual Plotting
    print("\n[5] Generating Mission Severity Timeline Plot...")
    fig, axs = plt.subplots(4, 1, figsize=(12, 10), sharex=True)
    fig.suptitle(
        "Aero-Piston Digital Twin: Mission Telemetry, Anomaly Trigger & Injector Severity",
        fontsize=13,
        fontweight="bold",
    )

    # Panel 1: Engine Speed & Power
    ax1 = axs[0]
    ax1_p = ax1.twinx()
    ax1.plot(df_res["time_s"], df_res["rpm"], color="navy", linewidth=2, label="Engine Speed (RPM)")
    ax1_p.plot(df_res["time_s"], df_res["power_kw"], color="darkgreen", linestyle="--", linewidth=2, label="Power (kW)")
    ax1.axvline(x=30.0, color="black", linestyle=":", label="Fault Injected (t=30s)")
    ax1.set_ylabel("Engine Speed (RPM)", color="navy")
    ax1_p.set_ylabel("Power (kW)", color="darkgreen")
    ax1.set_title("1. Engine Speed & Power Output")
    ax1.grid(True, linestyle=":", alpha=0.6)

    # Panel 2: Vibration & Fuel Flow
    ax2 = axs[1]
    ax2.plot(df_res["time_s"], df_res["vibration_g"], color="teal", linewidth=2, label="Vibration (g)")
    ax2.axvline(x=30.0, color="black", linestyle=":")
    ax2.set_ylabel("Vibration (g)", color="teal")
    ax2.set_title("2. Engine Vibration Amplitude")
    ax2.grid(True, linestyle=":", alpha=0.6)

    # Panel 3: Anomaly Probability Stream
    ax3 = axs[2]
    ax3.plot(df_res["time_s"], df_res["anomaly_probability"] * 100, color="red", linewidth=2, label="Anomaly Probability (%)")
    ax3.axhline(y=50.0, color="black", linestyle="--", label="Decision Threshold (50%)")
    ax3.axvline(x=30.0, color="black", linestyle=":")
    ax3.fill_between(df_res["time_s"], df_res["anomaly_probability"] * 100, 50.0, where=(df_res["anomaly_probability"] >= 0.50), color="red", alpha=0.3)
    ax3.set_ylabel("Anomaly Prob (%)", color="red")
    ax3.set_title("3. Digital Twin Anomaly Detection Stream")
    ax3.legend(loc="upper left")
    ax3.grid(True, linestyle=":", alpha=0.6)

    # Panel 4: Health Index & Severity Level
    ax4 = axs[3]
    ax4.plot(df_res["time_s"], df_res["health_index"], color="purple", linewidth=2.5, label="Engine Health Index (%)")
    ax4.axvline(x=30.0, color="black", linestyle=":", label="Fault Injected (t=30s)")
    ax4.set_xlabel("Simulation Time (s)")
    ax4.set_ylabel("Health Index (%)", color="purple")
    ax4.set_ylim(50, 105)
    ax4.set_title("4. Engine Health Index & Severity Estimation")
    ax4.legend(loc="lower left")
    ax4.grid(True, linestyle=":", alpha=0.6)

    plt.tight_layout()
    plots_dir = "plots"
    os.makedirs(plots_dir, exist_ok=True)
    plot_path = os.path.join(plots_dir, "m5_mission_severity_timeline.png")
    plt.savefig(plot_path, dpi=300)
    plt.close()

    print(f"    Plot saved successfully to: {plot_path}")
    print("\n[SUCCESS] Mission Severity Replay Complete!")


if __name__ == "__main__":
    verify_severity_mission()
