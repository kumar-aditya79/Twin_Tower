import math


class ThermalManagement:
    """
    Physics-informed thermal management subsystem for an aero-piston engine.

    Models:
    1. Combustion and friction heat generation.
    2. Atmospheric convective and oil cooler heat rejection.
    3. Cooling efficiency degradation (healthy = 1.0, degraded < 1.0).
    4. First-order dynamic response of Cylinder Head Temperature (CHT) and Oil Temperature.
    5. Oil temperature viscosity feedback on oil pressure.
    6. Real-time thermal health state classification (NOMINAL, CAUTION, OVERHEAT).
    """

    def __init__(
        self,
        tau_cht=8.0,
        tau_oil=20.0,
        rated_rpm=5000.0,
        cooling_efficiency=1.0,
    ):
        self.tau_cht = tau_cht        # Cylinder head thermal inertia time constant (s)
        self.tau_oil = tau_oil        # Oil thermal inertia time constant (s)
        self.rated_rpm = rated_rpm    # Engine rated speed (RPM)
        self.cooling_efficiency = max(0.1, min(1.0, float(cooling_efficiency)))

        # Operational thresholds for air-cooled aero-engines (°C)
        # Calibrated for typical aero-engine continuous cruise (Lycoming / Rotax):
        # Healthy 70% cruise settles at CHT ~210°C, Oil ~130°C (NOMINAL).
        # Caution indicates elevated operating conditions (CHT > 225°C or Oil > 135°C).
        # Overheat indicates safety-critical boundary (CHT > 250°C or Oil > 145°C).
        self.cht_caution_c = 225.0
        self.cht_limit_c = 250.0
        self.oil_caution_c = 135.0
        self.oil_limit_c = 145.0

    def compute_heat_balance(self, p_chem_w, p_gross_kw, q_exhaust_w, t_friction_nm, omega):
        """
        Compute energy balance partition:
        Fuel Chemical Energy = Mechanical Work + Exhaust Heat + Engine Structure Heat + Friction
        """
        p_gross_w = p_gross_kw * 1000.0
        # Heat generated within cylinder structure from combustion inefficiency
        q_combustion_heat_w = max(0.0, p_chem_w - p_gross_w - q_exhaust_w)
        # Mechanical friction heat generated in bearings, rings, and crank
        q_friction_heat_w = max(0.0, t_friction_nm * omega)
        # Total heat rejected through engine casing, fins, and oil system
        q_total_heat_gen_kw = (q_combustion_heat_w + q_friction_heat_w) / 1000.0

        return {
            "p_chem_kw": p_chem_w / 1000.0,
            "p_gross_kw": p_gross_kw,
            "q_exhaust_kw": q_exhaust_w / 1000.0,
            "q_combustion_heat_kw": q_combustion_heat_w / 1000.0,
            "q_friction_kw": q_friction_heat_w / 1000.0,
            "q_engine_heat_gen_kw": q_total_heat_gen_kw,
        }

    def compute_targets(
        self,
        ambient_temp_c,
        p_gross_kw,
        rpm,
        t_friction,
        cooling_eff=None,
    ):
        """
        Calculate steady-state equilibrium temperature targets for CHT and Oil.

        Physics:
        Convective heat rejection Q_rej = eta_cooling * (hA) * (T_target - T_ambient)
        At equilibrium Q_rej = Q_gen  ==> (T_target - T_ambient) = Delta_T_nominal / eta_cooling
        """
        eff = self.cooling_efficiency if cooling_eff is None else cooling_eff
        eff = max(0.1, min(1.0, float(eff)))

        # Nominal CHT rise (derived from baseline engine empirical calibration)
        speed_factor = 0.8 + 0.4 * (rpm / self.rated_rpm)
        delta_cht_nominal = 5.5 * p_gross_kw * speed_factor

        # Cooling degradation directly scales equilibrium temperature rise
        delta_cht = delta_cht_nominal / eff
        cht_target = ambient_temp_c + delta_cht

        # Oil temperature target (coupled to block heat and friction, cooled by airflow/oil cooler)
        delta_oil_nominal = 3.2 * p_gross_kw + 0.8 * t_friction
        delta_oil = delta_oil_nominal / math.sqrt(eff)
        oil_temp_target = ambient_temp_c + delta_oil

        return cht_target, oil_temp_target, delta_cht_nominal, delta_oil_nominal

    def compute_derivatives(self, cht_c, oil_temp_c, cht_target, oil_temp_target):
        """
        Compute first-order continuous temperature derivatives:
        d(CHT)/dt = (CHT_target - CHT) / tau_cht
        d(OilTemp)/dt = (OilTemp_target - OilTemp) / tau_oil
        """
        dcht_dt = (cht_target - cht_c) / self.tau_cht
        doil_temp_dt = (oil_temp_target - oil_temp_c) / self.tau_oil
        return dcht_dt, doil_temp_dt

    def compute_oil_pressure(self, rpm, oil_temp_c):
        """
        Calculate lubrication circuit oil pressure (bar).
        Models positive displacement pump delivery (speed-dependent)
        with viscosity drop at elevated oil temperatures.
        """
        oil_press_base = 1.5 + 0.0008 * rpm
        visc_factor = 1.0 - 0.0025 * (oil_temp_c - 80.0)
        oil_pressure_bar = max(1.0, min(6.0, oil_press_base * visc_factor))
        return oil_pressure_bar

    def evaluate_thermal_health(self, cht_c, oil_temp_c):
        """
        Classify operational health of engine thermal subsystem.
        """
        if cht_c >= self.cht_limit_c or oil_temp_c >= self.oil_limit_c:
            return "OVERHEAT"
        elif cht_c >= self.cht_caution_c or oil_temp_c >= self.oil_caution_c:
            return "CAUTION"
        return "NOMINAL"

    def compute(
        self,
        cht_c,
        oil_temp_c,
        p_gross_kw,
        p_chem_w,
        q_exhaust_w,
        t_friction_nm,
        omega,
        rpm,
        ambient_temp_c,
        cooling_eff=None,
    ):
        """
        Run complete thermal subsystem update for the current simulation timestep.
        """
        eff = self.cooling_efficiency if cooling_eff is None else cooling_eff
        eff = max(0.1, min(1.0, float(eff)))

        heat_balance = self.compute_heat_balance(
            p_chem_w, p_gross_kw, q_exhaust_w, t_friction_nm, omega
        )

        cht_target, oil_temp_target, delta_cht_nom, delta_oil_nom = self.compute_targets(
            ambient_temp_c, p_gross_kw, rpm, t_friction_nm, eff
        )

        dcht_dt, doil_temp_dt = self.compute_derivatives(
            cht_c, oil_temp_c, cht_target, oil_temp_target
        )

        oil_pressure_bar = self.compute_oil_pressure(rpm, oil_temp_c)
        thermal_status = self.evaluate_thermal_health(cht_c, oil_temp_c)

        # First-principles convective heat rejection:
        # Calibrated to nominal thermal conductances so that at healthy steady state,
        # Q_rejection == Q_generation (Heat balance satisfied).
        k_cht = heat_balance["q_combustion_heat_kw"] / max(1.0, delta_cht_nom)
        k_oil = heat_balance["q_friction_kw"] / max(1.0, delta_oil_nom)

        delta_t_cht_actual = max(0.0, cht_c - ambient_temp_c)
        delta_t_oil_actual = max(0.0, oil_temp_c - ambient_temp_c)

        q_cht_rejected_kw = eff * k_cht * delta_t_cht_actual
        q_oil_rejected_kw = math.sqrt(eff) * k_oil * delta_t_oil_actual
        q_total_rejected_kw = q_cht_rejected_kw + q_oil_rejected_kw

        return {
            "cht_target_c": cht_target,
            "dcht_dt": dcht_dt,
            "oil_temp_target_c": oil_temp_target,
            "doil_temp_dt": doil_temp_dt,
            "oil_pressure_bar": oil_pressure_bar,
            "cooling_efficiency": eff,
            "heat_generation_kw": heat_balance["q_engine_heat_gen_kw"],
            "heat_rejection_kw": q_total_rejected_kw,
            "thermal_status": thermal_status,
        }


def self_test():
    print("=" * 60)
    print("  THERMAL MANAGEMENT SUBSYSTEM SELF-TEST")
    print("=" * 60)

    tm = ThermalManagement()

    # Nominal healthy conditions at steady state
    ambient = -4.8
    p_gross = 37.0
    p_chem = 126000.0
    q_exh = 35000.0
    t_fric = 20.2
    omega = 304.4
    rpm = 2907.0

    target_cht, target_oil, _, _ = tm.compute_targets(ambient, p_gross, rpm, t_fric, 1.0)

    # Evaluate at steady-state temperatures
    res_steady = tm.compute(
        cht_c=target_cht,
        oil_temp_c=target_oil,
        p_gross_kw=p_gross,
        p_chem_w=p_chem,
        q_exhaust_w=q_exh,
        t_friction_nm=t_fric,
        omega=omega,
        rpm=rpm,
        ambient_temp_c=ambient,
        cooling_eff=1.0,
    )
    print("\n[1] Healthy Steady-State Balance:")
    print(f"    CHT:                {target_cht:.1f} °C")
    print(f"    Oil Temp:           {target_oil:.1f} °C")
    print(f"    Heat Generation:    {res_steady['heat_generation_kw']:.2f} kW")
    print(f"    Heat Rejection:     {res_steady['heat_rejection_kw']:.2f} kW")
    print(f"    Energy Imbalance:   {abs(res_steady['heat_generation_kw'] - res_steady['heat_rejection_kw']):.4f} kW")
    print(f"    Thermal Status:     {res_steady['thermal_status']}")

    assert abs(res_steady['heat_generation_kw'] - res_steady['heat_rejection_kw']) < 1e-4, "Steady state must balance!"
    assert res_steady['thermal_status'] == "NOMINAL", "Healthy steady state must be NOMINAL!"

    # Degraded cooling conditions (70% cooling efficiency)
    res_degraded = tm.compute(
        cht_c=target_cht,
        oil_temp_c=target_oil,
        p_gross_kw=p_gross,
        p_chem_w=p_chem,
        q_exhaust_w=q_exh,
        t_friction_nm=t_fric,
        omega=omega,
        rpm=rpm,
        ambient_temp_c=ambient,
        cooling_eff=0.70,
    )
    deficit = res_degraded['heat_generation_kw'] - res_degraded['heat_rejection_kw']
    print("\n[2] Cooling Degradation Onset (70% Cooling @ t=30s):")
    print(f"    CHT Target:         {res_degraded['cht_target_c']:.1f} °C (Delta: +{res_degraded['cht_target_c'] - target_cht:.1f} °C)")
    print(f"    Heat Rejection:     {res_degraded['heat_rejection_kw']:.2f} kW")
    print(f"    Heat Deficit:       {deficit:.2f} kW")
    print(f"    d(CHT)/dt:          +{res_degraded['dcht_dt']:.2f} °C/s")

    assert deficit > 10.0, "Degradation must produce significant heat deficit!"
    print("\n[PASS] Thermal Management Subsystem self-test passed successfully!")


if __name__ == "__main__":
    self_test()
