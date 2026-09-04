"""
test_thermal_cooling.py
=======================
Verification and demonstration suite for the Thermal Management / Cooling Degradation Module.
Tests 4 distinct operational scenarios:
  Test A: Healthy Baseline (100% Cooling, ISA Standard Atmosphere)
  Test B: Cooling Degradation (Cooling drops to 70% at t = 30s)
  Test C: Hot Weather Operation (+3°C ambient ISA temperature offset)
  Test D: Hot Weather + Cooling Degradation (Combined environmental & degradation stress)
"""

import os
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from Engine.engine import PistonEngine
from Engine.simulation import EngineSimulator


def cooling_degradation_schedule(t, engine: PistonEngine):
    """
    Fault injection schedule for cooling system degradation:
    0 - 30 s:  Cooling efficiency = 1.00 (100% Healthy)
    30 - 60 s: Cooling efficiency = 0.70 (30% Heat Rejection Loss)
    """
    if t >= 30.0:
        engine.cooling_efficiency = 0.70
    else:
        engine.cooling_efficiency = 1.00


def main():
    print("=" * 80)
    print("  AERO-PISTON ENGINE DIGITAL TWIN - THERMAL & COOLING SUBSYSTEM TEST")
    print("  Evaluation of Heat Rejection, CHT, Oil Temp & Cooling System Degradation")
    print("=" * 80)

    duration_s = 60.0
    dt = 0.05
    altitude_ft = 10000.0
    throttle_setting = 0.70
    initial_rpm = 2500.0
    initial_cht = 75.0
    initial_oil_temp = 65.0

    # -------------------------------------------------------------------------
    # Scenario A: Healthy Baseline (Cooling = 100%, ISA standard)
    # -------------------------------------------------------------------------
    print("\n[Test A] Running Healthy Baseline Simulation (Cooling = 100%, ISA)...")
    engine_a = PistonEngine()
    sim_a = EngineSimulator(engine_a)
    df_a = sim_a.run(
        duration_s=duration_s,
        dt=dt,
        throttle_profile=throttle_setting,
        altitude_profile=altitude_ft,
        temp_offset_profile=0.0,
        initial_rpm=initial_rpm,
        initial_cht=initial_cht,
        initial_oil_temp=initial_oil_temp,
        fault_schedule=None,
    )

    # -------------------------------------------------------------------------
    # Scenario B: Cooling Degradation (Cooling = 70% at t = 30s, ISA)
    # -------------------------------------------------------------------------
    print("\n[Test B] Running Cooling Degradation Simulation (Cooling -> 70% @ t=30s)...")
    engine_b = PistonEngine()
    sim_b = EngineSimulator(engine_b)
    df_b = sim_b.run(
        duration_s=duration_s,
        dt=dt,
        throttle_profile=throttle_setting,
        altitude_profile=altitude_ft,
        temp_offset_profile=0.0,
        initial_rpm=initial_rpm,
        initial_cht=initial_cht,
        initial_oil_temp=initial_oil_temp,
        fault_schedule=cooling_degradation_schedule,
    )

    # -------------------------------------------------------------------------
    # Scenario C: Hot Weather (Cooling = 100%, ISA + 3°C offset)
    # -------------------------------------------------------------------------
    print("\n[Test C] Running Hot Weather Simulation (Cooling = 100%, ISA + 3°C)...")
    engine_c = PistonEngine()
    sim_c = EngineSimulator(engine_c)
    df_c = sim_c.run(
        duration_s=duration_s,
        dt=dt,
        throttle_profile=throttle_setting,
        altitude_profile=altitude_ft,
        temp_offset_profile=3.0,
        initial_rpm=initial_rpm,
        initial_cht=initial_cht + 3.0,
        initial_oil_temp=initial_oil_temp + 3.0,
        fault_schedule=None,
    )

    # -------------------------------------------------------------------------
    # Scenario D: Hot Weather + Cooling Degradation (ISA + 3°C, Cooling -> 70% @ t=30s)
    # -------------------------------------------------------------------------
    print("\n[Test D] Running Hot Weather + Cooling Degradation (ISA + 3°C, Cooling -> 70%)...")
    engine_d = PistonEngine()
    sim_d = EngineSimulator(engine_d)
    df_d = sim_d.run(
        duration_s=duration_s,
        dt=dt,
        throttle_profile=throttle_setting,
        altitude_profile=altitude_ft,
        temp_offset_profile=3.0,
        initial_rpm=initial_rpm,
        initial_cht=initial_cht + 3.0,
        initial_oil_temp=initial_oil_temp + 3.0,
        fault_schedule=cooling_degradation_schedule,
    )

    # -------------------------------------------------------------------------
    # Summary Comparison Table
    # -------------------------------------------------------------------------
    print("\n" + "=" * 95)
    print("  THERMAL TELEMETRY COMPARISON SNAPSHOT (Pre-Fault t=25s vs Post-Fault t=55s)")
    print("=" * 95)
    header = f"{'Scenario':<32}{'Time(s)':<8}{'Cooling':<10}{'CHT(°C)':<10}{'Oil(°C)':<10}{'OilPress(bar)':<15}{'Status':<10}"
    print(header)
    print("-" * 95)

    scenarios = [
        ("Test A: Healthy Baseline", df_a),
        ("Test B: Cooling Degradation", df_b),
        ("Test C: Hot Weather (+3°C)", df_c),
        ("Test D: Hot Day + Degradation", df_d),
    ]

    for name, df in scenarios:
        for t_eval in [25.0, 55.0]:
            idx = (df["time_s"] - t_eval).abs().argmin()
            row = df.iloc[idx]
            print(
                f"{name:<32}"
                f"{row['time_s']:<8.1f}"
                f"{row['cooling_efficiency']*100:<10.0f}"
                f"{row['cht_c']:<10.1f}"
                f"{row['oil_temp_c']:<10.1f}"
                f"{row['oil_pressure_bar']:<15.2f}"
                f"{row['thermal_status']:<10}"
            )
        print("-" * 95)

    # -------------------------------------------------------------------------
    # Assertions & Physics Validations
    # -------------------------------------------------------------------------
    idx_55 = (df_a["time_s"] - 55.0).abs().argmin()
    row_a_55 = df_a.iloc[idx_55]
    row_b_55 = df_b.iloc[idx_55]
    row_c_55 = df_c.iloc[idx_55]
    row_d_55 = df_d.iloc[idx_55]

    cht_a_55 = row_a_55["cht_c"]
    cht_b_55 = row_b_55["cht_c"]
    cht_c_55 = row_c_55["cht_c"]
    cht_d_55 = row_d_55["cht_c"]

    oil_a_55 = row_a_55["oil_temp_c"]
    oil_b_55 = row_b_55["oil_temp_c"]
    oil_c_55 = row_c_55["oil_temp_c"]
    oil_d_55 = row_d_55["oil_temp_c"]

    # 1. Healthy baseline settles into NOMINAL (Validation Finding 1)
    assert row_a_55["thermal_status"] == "NOMINAL", f"Healthy baseline must be NOMINAL at 55s: {row_a_55['thermal_status']}"

    # 2. Steady-state heat balance for healthy baseline (Validation Finding 3)
    heat_imbalance_55 = abs(row_a_55["heat_generation_kw"] - row_a_55["heat_rejection_kw"])
    assert heat_imbalance_55 < 0.5, f"Expected steady-state balance in Test A (<0.5 kW): {heat_imbalance_55:.2f} kW"

    # 3. Cooling degradation causes significant CHT rise and enters OVERHEAT
    assert cht_b_55 > cht_a_55 + 50.0, f"Expected CHT rise in Test B: {cht_b_55} vs {cht_a_55}"
    assert row_b_55["thermal_status"] == "OVERHEAT", f"Cooling degradation must trigger OVERHEAT: {row_b_55['thermal_status']}"

    # 4. Hot weather alone settles into CAUTION (Validation Finding 2: Diagnostic Separation)
    assert row_c_55["thermal_status"] == "CAUTION", f"Hot weather alone must be CAUTION: {row_c_55['thermal_status']}"
    assert cht_c_55 > cht_a_55 + 15.0, f"Expected hot weather CHT elevation: {cht_c_55} vs {cht_a_55}"
    assert cht_c_55 < 250.0, f"Hot weather alone must stay below OVERHEAT threshold: {cht_c_55}"

    # 5. Combined hot weather + degradation yields strongest thermal stress and OVERHEAT
    assert cht_d_55 > cht_b_55, f"Expected Test D CHT > Test B CHT: {cht_d_55} vs {cht_b_55}"
    assert row_d_55["thermal_status"] == "OVERHEAT", f"Test D must be OVERHEAT: {row_d_55['thermal_status']}"

    print("\n[VERIFIED] All physical heat-balance and diagnostic separation assertions PASSED!")

    # -------------------------------------------------------------------------
    # Generate Multi-Panel Comparison Plots
    # -------------------------------------------------------------------------
    print("\n[Plotting] Generating thermal scenario comparison visualization...")
    fig, axs = plt.subplots(2, 2, figsize=(14, 10))
    fig.suptitle(
        f"Aero-Piston Engine Digital Twin: Thermal Management & Cooling Degradation Scenarios\n(Altitude: {altitude_ft:,.0f} ft | Cruise Throttle: {throttle_setting*100:.0f}%)",
        fontsize=13,
        fontweight="bold",
    )

    t = df_a["time_s"]

    # 1. Cylinder Head Temperature (CHT) Response
    ax1 = axs[0, 0]
    ax1.plot(t, df_a["cht_c"], color="navy", linewidth=2.2, label="Test A: Healthy (100% Cooling)")
    ax1.plot(t, df_b["cht_c"], color="crimson", linewidth=2.2, linestyle="--", label="Test B: Cooling Degradation (70% @ 30s)")
    ax1.plot(t, df_c["cht_c"], color="darkorange", linewidth=2.0, label="Test C: Hot Weather (+3°C ISA)")
    ax1.plot(t, df_d["cht_c"], color="purple", linewidth=2.2, linestyle="-.", label="Test D: Hot Day + Degradation")
    ax1.axvline(x=30.0, color="gray", linestyle=":", alpha=0.9, label="Fault Injected (t=30s)")
    ax1.axhline(y=225.0, color="orange", linestyle="--", alpha=0.6, label="Caution Limit (225°C)")
    ax1.axhline(y=250.0, color="red", linestyle="--", alpha=0.6, label="Overheat Limit (250°C)")
    ax1.set_xlabel("Time (s)", fontweight="bold")
    ax1.set_ylabel("Cylinder Head Temp (°C)", fontweight="bold")
    ax1.set_title("1. Cylinder Head Temperature (CHT) Response", fontweight="bold")
    ax1.legend(loc="lower right", fontsize=8.5)
    ax1.grid(True, linestyle=":", alpha=0.6)

    # 2. Engine Oil Temperature Response
    ax2 = axs[0, 1]
    ax2.plot(t, df_a["oil_temp_c"], color="navy", linewidth=2.2, label="Test A: Healthy")
    ax2.plot(t, df_b["oil_temp_c"], color="crimson", linewidth=2.2, linestyle="--", label="Test B: Cooling Degradation")
    ax2.plot(t, df_c["oil_temp_c"], color="darkorange", linewidth=2.0, label="Test C: Hot Weather (+3°C ISA)")
    ax2.plot(t, df_d["oil_temp_c"], color="purple", linewidth=2.2, linestyle="-.", label="Test D: Hot Day + Degradation")
    ax2.axvline(x=30.0, color="gray", linestyle=":", alpha=0.9)
    ax2.axhline(y=135.0, color="orange", linestyle="--", alpha=0.6, label="Oil Caution (135°C)")
    ax2.axhline(y=145.0, color="red", linestyle="--", alpha=0.6, label="Oil Limit (145°C)")
    ax2.set_xlabel("Time (s)", fontweight="bold")
    ax2.set_ylabel("Oil Temperature (°C)", fontweight="bold")
    ax2.set_title("2. Lubrication Oil Temperature Response", fontweight="bold")
    ax2.legend(loc="lower right", fontsize=8.5)
    ax2.grid(True, linestyle=":", alpha=0.6)

    # 3. Oil Pressure Response (Viscosity Feedback)
    ax3 = axs[1, 0]
    ax3.plot(t, df_a["oil_pressure_bar"], color="navy", linewidth=2.0, label="Test A: Healthy")
    ax3.plot(t, df_b["oil_pressure_bar"], color="crimson", linewidth=2.0, linestyle="--", label="Test B: Cooling Degradation")
    ax3.plot(t, df_c["oil_pressure_bar"], color="darkorange", linewidth=2.0, label="Test C: Hot Weather (+3°C ISA)")
    ax3.plot(t, df_d["oil_pressure_bar"], color="purple", linewidth=2.0, linestyle="-.", label="Test D: Hot Day + Degradation")
    ax3.axvline(x=30.0, color="gray", linestyle=":", alpha=0.9)
    ax3.set_xlabel("Time (s)", fontweight="bold")
    ax3.set_ylabel("Oil Pressure (bar)", fontweight="bold")
    ax3.set_title("3. Oil Pressure (Viscosity Coupling)", fontweight="bold")
    ax3.legend(loc="upper right", fontsize=8.5)
    ax3.grid(True, linestyle=":", alpha=0.6)

    # 4. Heat Generation & Rejection Rates (Test A vs Test B)
    ax4 = axs[1, 1]
    ax4.plot(t, df_a["heat_generation_kw"], color="black", linewidth=2.0, label="Heat Generation (kW)")
    ax4.plot(t, df_a["heat_rejection_kw"], color="darkgreen", linewidth=2.0, label="Heat Rejection: Test A (Healthy)")
    ax4.plot(t, df_b["heat_rejection_kw"], color="crimson", linewidth=2.0, linestyle="--", label="Heat Rejection: Test B (Degraded)")
    ax4.axvline(x=30.0, color="gray", linestyle=":", alpha=0.9, label="Fault Injected (t=30s)")
    ax4.set_xlabel("Time (s)", fontweight="bold")
    ax4.set_ylabel("Thermal Power (kW)", fontweight="bold")
    ax4.set_title("4. Heat Generation vs Heat Rejection Dynamics", fontweight="bold")
    ax4.legend(loc="lower right", fontsize=8.5)
    ax4.grid(True, linestyle=":", alpha=0.6)

    plt.tight_layout()
    plots_dir = "plots"
    os.makedirs(plots_dir, exist_ok=True)
    plot_path = os.path.join(plots_dir, "thermal_cooling_scenarios.png")
    plt.savefig(plot_path, dpi=300)
    plt.close()

    print(f"    Plot successfully saved to: {plot_path}")
    print("\n[SUCCESS] Thermal Management & Cooling Degradation Module verification complete!")


if __name__ == "__main__":
    main()
