import os
import joblib
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd


def verify_mission_fault():
    print("=" * 75)
    print("  AERO-PISTON ENGINE DIGITAL TWIN - REAL-TIME MISSION FAULT REPLAY (M5)")
    print("=" * 75)

    # 1. Load Serialized Trained Models
    models_dir = os.path.join("ml", "models")
    estimator_path = os.path.join(models_dir, "physics_estimator.joblib")
    classifier_path = os.path.join(models_dir, "anomaly_classifier.joblib")
    scaler_path = os.path.join(models_dir, "scaler.joblib")

    if not (os.path.exists(estimator_path) and os.path.exists(classifier_path) and os.path.exists(scaler_path)):
        raise FileNotFoundError("Serialized ML models not found in ml/models/. Run ml/train_anomaly_models.py first.")

    print(f"\n[1] Loading Serialized ML Models from: {models_dir}")
    physics_estimator = joblib.load(estimator_path)
    anomaly_classifier = joblib.load(classifier_path)
    scaler = joblib.load(scaler_path)
    print("    - Physics Estimator, Anomaly Classifier & Scaler loaded successfully.")

    # 2. Load Real-Time Mission Telemetry (60s Flight with Fault at t=30s)
    mission_csv = os.path.join("data", "degraded_injector_telemetry.csv")
    if not os.path.exists(mission_csv):
        raise FileNotFoundError(f"Mission CSV not found at {mission_csv}. Run main.py first.")

    print(f"\n[2] Loading Mission Telemetry Stream: {mission_csv}")
    df_mission = pd.read_csv(mission_csv)
    print(f"    Total Mission Time Steps: {len(df_mission)} (Duration = {df_mission['time_s'].max():.1f} s)")

    env_inputs = ["altitude_ft", "throttle", "air_density"]
    sensor_outputs = [
        "rpm", "torque_net_nm", "power_kw", "fuel_flow_l_hr",
        "egt_c", "cht_c", "oil_temp_c", "oil_pressure_bar", "vibration_g"
    ]
    features = env_inputs + sensor_outputs

    # 3. Stream Inference Line-by-Line (Zero-Latency Real-Time Simulation)
    print("\n[3] Executing Real-Time Mission Stream Inference:")
    predicted_healthy_sensors = physics_estimator.predict(df_mission[env_inputs])
    actual_sensors = df_mission[sensor_outputs].values
    residuals = np.abs(actual_sensors - predicted_healthy_sensors)

    X_aug = np.hstack([df_mission[features].values, residuals])
    X_scaled = scaler.transform(X_aug)

    anomaly_probs = anomaly_classifier.predict_proba(X_scaled)[:, 1]
    anomaly_preds = (anomaly_probs >= 0.5).astype(int)

    df_mission["anomaly_prob_pct"] = anomaly_probs * 100.0
    df_mission["anomaly_status"] = np.where(df_mission["anomaly_prob_pct"] >= 50.0, "ANOMALY", "NORMAL")

    # 4. Summary Snapshot Comparison (Pre-Fault t=25s vs Post-Fault t=50s)
    print("\n[4] Real-Time Anomaly Detection Snapshot:")
    print("-" * 80)
    print(f"{'Time (s)':<10}{'Throttle':<12}{'RPM':<10}{'Power (kW)':<12}{'Vib (g)':<10}{'Anomaly Prob':<16}{'Engine Status':<10}")
    print("-" * 80)
    for st in [10.0, 25.0, 31.0, 45.0, 58.0]:
        idx = (df_mission["time_s"] - st).abs().argmin()
        row = df_mission.iloc[idx]
        th_str = f"{row['throttle']*100:.0f}%"
        prob_str = f"{row['anomaly_prob_pct']:.1f}%"
        print(
            f"{row['time_s']:<10.1f}"
            f"{th_str:<12}"
            f"{row['rpm']:<10.0f}"
            f"{row['power_kw']:<12.1f}"
            f"{row['vibration_g']:<10.2f}"
            f"{prob_str:<16}"
            f"{row['anomaly_status']:<10}"
        )
    print("-" * 80)

    # 5. Plotting Real-Time Mission Timeline
    print("\n[5] Generating Real-Time Mission Fault Timeline Plot...")
    fig, axs = plt.subplots(3, 1, figsize=(12, 9), sharex=True)
    fig.suptitle(
        "M5 Preparation: Real-Time Telemetry Stream & Anomaly Trigger Timeline",
        fontsize=14,
        fontweight="bold",
    )

    # Panel 1: Engine Speed & Power Output
    ax1 = axs[0]
    ax1_p = ax1.twinx()
    ax1.plot(df_mission["time_s"], df_mission["rpm"], color="navy", linewidth=2, label="Engine Speed (RPM)")
    ax1_p.plot(df_mission["time_s"], df_mission["power_kw"], color="darkgreen", linestyle="--", linewidth=2, label="Power (kW)")
    ax1.axvline(x=30.0, color="black", linestyle=":", label="Fault Injected (t=30s)")
    ax1.set_ylabel("Engine Speed (RPM)", color="navy")
    ax1_p.set_ylabel("Power (kW)", color="darkgreen")
    ax1.set_title("1. Dynamic Engine Speed & Power Output")
    ax1.grid(True, linestyle=":", alpha=0.6)

    # Panel 2: Vibration & Fuel Flow Rate
    ax2 = axs[1]
    ax2_f = ax2.twinx()
    ax2.plot(df_mission["time_s"], df_mission["vibration_g"], color="teal", linewidth=2, label="Vibration (g)")
    ax2_f.plot(df_mission["time_s"], df_mission["fuel_flow_l_hr"], color="crimson", linestyle="-.", linewidth=2, label="Fuel Flow (L/h)")
    ax2.axvline(x=30.0, color="black", linestyle=":")
    ax2.set_ylabel("Vibration (g)", color="teal")
    ax2_f.set_ylabel("Fuel Flow (L/h)", color="crimson")
    ax2.set_title("2. Vibration & Fuel Consumption Rate")
    ax2.grid(True, linestyle=":", alpha=0.6)

    # Panel 3: Digital Twin Anomaly Probability Trigger Timeline
    ax3 = axs[2]
    ax3.plot(df_mission["time_s"], df_mission["anomaly_prob_pct"], color="red", linewidth=2.5, label="Anomaly Probability (%)")
    ax3.axhline(y=50.0, color="black", linestyle="--", label="Decision Threshold (50%)")
    ax3.axvline(x=30.0, color="black", linestyle=":", label="Fault Injected (t=30s)")
    ax3.fill_between(df_mission["time_s"], df_mission["anomaly_prob_pct"], 50.0, where=(df_mission["anomaly_prob_pct"] >= 50.0), color="red", alpha=0.3, label="ALARM ACTIVE")
    ax3.set_xlabel("Simulation Time (s)")
    ax3.set_ylabel("Anomaly Prob (%)", color="red")
    ax3.set_title("3. Digital Twin Real-Time Anomaly Alarm Trigger")
    ax3.legend(loc="upper left")
    ax3.grid(True, linestyle=":", alpha=0.6)

    plt.tight_layout()
    plots_dir = "plots"
    os.makedirs(plots_dir, exist_ok=True)
    plot_path = os.path.join(plots_dir, "m5_mission_fault_timeline.png")
    plt.savefig(plot_path, dpi=300)
    plt.close()

    print(f"    Mission timeline plot saved successfully to: {plot_path}")
    print("\n[SUCCESS] Real-Time Mission Fault Verification Complete!")


if __name__ == "__main__":
    verify_mission_fault()
