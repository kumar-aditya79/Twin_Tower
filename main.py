import os
import matplotlib.pyplot as plt
import numpy as np

from Engine.engine import PistonEngine
from Engine.simulation import EngineSimulator


def injector_degradation_fault_schedule(t, engine: PistonEngine):
    """
    Fault injection schedule:
    0 - 30 s:  Injector efficiency = 100% (Healthy)
    30 - 60 s: Injector efficiency = 80%  (20% fuel starvation fault)
    """
    if t >= 30.0:
        engine.injector_efficiency = 0.80
    else:
        engine.injector_efficiency = 1.00


def main():
    print("=" * 70)
    print("  AERO-PISTON ENGINE DIGITAL TWIN - SIMULATION MVP")
    print("  Milestones 2 & 3: Thermal Telemetry & Injector Fault Injection")
    print("=" * 70)

    # Simulation setup
    altitude_ft = 10000.0  # 10,000 ft altitude
    duration_s = 60.0
    dt = 0.05
    initial_rpm = 2500.0
    throttle_setting = 0.70  # Constant 70% throttle cruise

    # -------------------------------------------------------------
    # Run 1: Healthy Baseline Engine Simulation
    # -------------------------------------------------------------
    print("\n[1] Running Healthy Baseline Simulation (Injector Efficiency = 100%)...")
    healthy_engine = PistonEngine(displacement_l=3.0, inertia=0.20)
    healthy_sim = EngineSimulator(healthy_engine)

    df_healthy = healthy_sim.run(
        duration_s=duration_s,
        dt=dt,
        throttle_profile=throttle_setting,
        altitude_profile=altitude_ft,
        temp_offset_profile=0.0,
        initial_rpm=initial_rpm,
        initial_cht=75.0,
        initial_oil_temp=65.0,
        fault_schedule=None,
    )
    csv_healthy = os.path.join("data", "healthy_telemetry.csv")
    healthy_sim.export_csv(csv_healthy)

    # -------------------------------------------------------------
    # Run 2: Injector Degradation Fault Simulation
    # -------------------------------------------------------------
    print("\n[2] Running Degraded Simulation (Injector Fault injected at t = 30.0 s)...")
    degraded_engine = PistonEngine(displacement_l=3.0, inertia=0.20)
    degraded_sim = EngineSimulator(degraded_engine)

    df_degraded = degraded_sim.run(
        duration_s=duration_s,
        dt=dt,
        throttle_profile=throttle_setting,
        altitude_profile=altitude_ft,
        temp_offset_profile=0.0,
        initial_rpm=initial_rpm,
        initial_cht=75.0,
        initial_oil_temp=65.0,
        fault_schedule=injector_degradation_fault_schedule,
    )
    csv_degraded = os.path.join("data", "degraded_injector_telemetry.csv")
    degraded_sim.export_csv(csv_degraded)

    # -------------------------------------------------------------
    # Summary Snapshot Comparison
    # -------------------------------------------------------------
    print("\n[3] Telemetry Comparison Snapshot (Pre-Fault t=25s vs Post-Fault t=50s):")
    print("-" * 78)
    print(f"{'Condition':<15}{'Time (s)':<10}{'RPM':<10}{'Power (kW)':<12}{'Fuel (L/h)':<12}{'CHT (°C)':<10}{'Vib (g)':<10}")
    print("-" * 78)

    for condition, df in [("Healthy", df_healthy), ("Degraded", df_degraded)]:
        for st in [25.0, 50.0]:
            row = df.iloc[(df["time_s"] - st).abs().argmin()]
            print(
                f"{condition:<15}"
                f"{row['time_s']:<10.1f}"
                f"{row['rpm']:<10.0f}"
                f"{row['power_kw']:<12.1f}"
                f"{row['fuel_flow_l_hr']:<12.2f}"
                f"{row['cht_c']:<10.1f}"
                f"{row['vibration_g']:<10.2f}"
            )
    print("-" * 78)

    # -------------------------------------------------------------
    # Visual Comparison Plotting
    # -------------------------------------------------------------
    print("\n[4] Generating Healthy vs Degraded Comparison Plots...")
    fig, axs = plt.subplots(2, 2, figsize=(13, 9))
    fig.suptitle(
        f"M2 & M3 Digital Twin: Healthy vs Injector Degraded Engine Telemetry (Alt = {altitude_ft:,.0f} ft)",
        fontsize=13,
        fontweight="bold",
    )

    # 1. Engine Speed (RPM) Response
    ax1 = axs[0, 0]
    ax1.plot(df_healthy["time_s"], df_healthy["rpm"], color="navy", linewidth=2, label="Healthy Engine")
    ax1.plot(df_degraded["time_s"], df_degraded["rpm"], color="crimson", linewidth=2, linestyle="--", label="Injector Degraded (80%)")
    ax1.axvline(x=30.0, color="black", linestyle=":", alpha=0.8, label="Fault Injected (t=30s)")
    ax1.set_xlabel("Time (s)")
    ax1.set_ylabel("Engine Speed (RPM)")
    ax1.set_title("1. Engine Speed (RPM) Response")
    ax1.legend(loc="lower right")
    ax1.grid(True, linestyle=":", alpha=0.6)

    # 2. Brake Power (kW) & Fuel Flow Rate
    ax2 = axs[0, 1]
    ax2.plot(df_healthy["time_s"], df_healthy["power_kw"], color="darkgreen", linewidth=2, label="Healthy Power (kW)")
    ax2.plot(df_degraded["time_s"], df_degraded["power_kw"], color="orange", linewidth=2, linestyle="--", label="Degraded Power (kW)")
    ax2.axvline(x=30.0, color="black", linestyle=":", alpha=0.8)
    ax2.set_xlabel("Time (s)")
    ax2.set_ylabel("Brake Power (kW)")
    ax2.set_title("2. Engine Brake Power Output")
    ax2.legend(loc="lower right")
    ax2.grid(True, linestyle=":", alpha=0.6)

    # 3. Thermal Telemetry (CHT & EGT °C)
    ax3 = axs[1, 0]
    ax3.plot(df_healthy["time_s"], df_healthy["cht_c"], color="darkred", linewidth=2, label="Healthy CHT (°C)")
    ax3.plot(df_degraded["time_s"], df_degraded["cht_c"], color="coral", linewidth=2, linestyle="--", label="Degraded CHT (°C)")
    ax3.plot(df_healthy["time_s"], df_healthy["egt_c"], color="purple", linewidth=1.5, alpha=0.7, label="Healthy EGT (°C)")
    ax3.plot(df_degraded["time_s"], df_degraded["egt_c"], color="magenta", linewidth=1.5, linestyle="--", alpha=0.7, label="Degraded EGT (°C)")
    ax3.axvline(x=30.0, color="black", linestyle=":", alpha=0.8)
    ax3.set_xlabel("Time (s)")
    ax3.set_ylabel("Temperature (°C)")
    ax3.set_title("3. Thermal Telemetry (CHT & EGT)")
    ax3.legend(loc="lower right")
    ax3.grid(True, linestyle=":", alpha=0.6)

    # 4. Engine Vibration & Injector Health
    ax4 = axs[1, 1]
    ax4_h = ax4.twinx()
    ax4.plot(df_healthy["time_s"], df_healthy["vibration_g"], color="teal", linewidth=1.5, label="Healthy Vib (g)")
    ax4.plot(df_degraded["time_s"], df_degraded["vibration_g"], color="red", linewidth=2, label="Degraded Vib (g)")
    ax4_h.plot(df_degraded["time_s"], df_degraded["injector_efficiency"] * 100, color="black", linestyle="-.", alpha=0.5, label="Injector Eff (%)")
    ax4.axvline(x=30.0, color="black", linestyle=":", alpha=0.8)
    ax4.set_xlabel("Time (s)")
    ax4.set_ylabel("Vibration (g)", color="teal")
    ax4_h.set_ylabel("Injector Efficiency (%)", color="black")
    ax4.set_title("4. Engine Vibration & Fault Injection")
    ax4.legend(loc="upper left")
    ax4.grid(True, linestyle=":", alpha=0.6)

    plt.tight_layout()
    plots_dir = "plots"
    os.makedirs(plots_dir, exist_ok=True)
    plot_path = os.path.join(plots_dir, "m2_m3_fault_comparison.png")
    plt.savefig(plot_path, dpi=300)
    plt.close()

    print(f"    Plot figure saved successfully to: {plot_path}")
    print("\n[SUCCESS] Milestones 2 & 3 Simulation Complete!")


if __name__ == "__main__":
    main()
