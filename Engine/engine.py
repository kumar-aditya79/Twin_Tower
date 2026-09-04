import math
from Engine.atmosphere import atmosphere
from Engine.thermal_management import ThermalManagement


class PistonEngine:
    """
    Physics-informed dynamic model of a 4-stroke piston aero-engine.
    
    Milestone 2 & 3 extensions:
    - Thermal dynamic states: CHT (Cylinder Head Temp) & Oil Temperature
    - Auxiliary sensors: Oil Pressure & Combustion Imbalance Vibration
    - Degradation models: Injector efficiency factor
    """

    def __init__(
        self,
        displacement_l=3.0,
        inertia=0.20,
        rated_rpm=5000.0,
        baseline_thermal_eff=0.30,
        fuel_lhv=44.0e6,
        afr_target=14.0,
        k_prop=0.001116,
    ):
        self.displacement_m3 = displacement_l * 1.0e-3
        self.inertia = inertia  # kg·m²
        self.rated_rpm = rated_rpm
        self.rated_omega = rated_rpm * (2.0 * math.pi / 60.0)  # rad/s
        self.baseline_thermal_eff = baseline_thermal_eff
        self.fuel_lhv = fuel_lhv  # J/kg
        self.afr_target = afr_target
        self.k_prop = k_prop  # Propeller load coefficient: T_load = k_prop * omega^2

        # Mechanical friction coefficients: T_fric = c_f0 + c_f1 * omega
        self.c_f0 = 12.0  # N·m constant friction
        self.c_f1 = 0.03  # N·m / (rad/s) viscous friction

        # Thermal time constants (seconds)
        self.tau_cht = 8.0   # CHT thermal inertia constant
        self.tau_oil = 20.0  # Oil temp thermal inertia constant

        # Health / Degradation parameters (Defaults to healthy 1.0)
        self.injector_efficiency = 1.0
        self.cooling_efficiency = 1.0

        # Subsystems
        self.thermal_subsystem = ThermalManagement(
            tau_cht=self.tau_cht,
            tau_oil=self.tau_oil,
            rated_rpm=self.rated_rpm,
            cooling_efficiency=self.cooling_efficiency,
        )

    def compute_volumetric_efficiency(self, throttle, omega):
        """
        Calculate volumetric efficiency based on throttle position and engine speed.
        """
        throttle_clamped = max(0.0, min(1.0, throttle))
        rpm = omega * (60.0 / (2.0 * math.pi))
        speed_factor = 1.0 - 0.12 * ((rpm - 3500.0) / 3500.0) ** 2
        speed_factor = max(0.65, min(1.0, speed_factor))

        eta_v = throttle_clamped * 0.88 * speed_factor
        return max(0.05, min(0.92, eta_v))

    def compute_telemetry(
        self,
        omega,
        cht_c=75.0,
        oil_temp_c=65.0,
        throttle=0.5,
        altitude_ft=0.0,
        temp_offset_c=0.0,
        time_s=0.0,
    ):
        """
        Compute complete engine state telemetry for given state variables and environment.

        Parameters
        ----------
        omega : float
            Engine speed in rad/s.
        cht_c : float
            Current Cylinder Head Temperature in °C.
        oil_temp_c : float
            Current Oil Temperature in °C.
        throttle : float
            Throttle position [0.0 to 1.0].
        altitude_ft : float
            Altitude in feet.
        temp_offset_c : float
            Temperature offset from ISA (°C).
        time_s : float
            Current simulation time in seconds.

        Returns
        -------
        dict
            Engine telemetry parameters.
        """
        omega = max(0.1, omega)
        rpm = omega * (60.0 / (2.0 * math.pi))

        # Atmospheric conditions
        atmo = atmosphere(altitude_ft, temp_offset_c)
        air_density = atmo["density_kg_m3"]
        ambient_temp_c = atmo["temperature_c"]

        # Air mass flow rate (4-stroke engine)
        eta_v = self.compute_volumetric_efficiency(throttle, omega)
        air_flow_kg_s = air_density * self.displacement_m3 * (omega / (4.0 * math.pi)) * eta_v

        # Fuel mass flow rate with injector efficiency degradation factor
        fuel_flow_kg_s = (air_flow_kg_s / self.afr_target) * self.injector_efficiency

        # Chemical Power released by combustion
        p_chem = fuel_flow_kg_s * self.fuel_lhv  # Watts

        # Thermal Efficiency variation with RPM
        rpm_ratio = max(0.1, min(1.3, rpm / self.rated_rpm))
        thermal_eff = self.baseline_thermal_eff * (1.0 - 0.08 * (rpm_ratio - 0.8) ** 2)

        # Gross combustion power & torque
        p_gross = p_chem * thermal_eff
        t_gross = p_gross / omega if omega > 0.5 else 0.0

        # Friction torque & net output torque
        t_friction = self.c_f0 + self.c_f1 * omega
        t_net = max(-t_friction, t_gross - t_friction)

        # Net Brake Power (kW)
        p_brake_kw = max(0.0, (t_net * omega) / 1000.0)
        p_gross_kw = (p_gross) / 1000.0

        # Propeller Absorber Load Torque
        t_load = self.k_prop * (omega ** 2)

        # Fuel flow in Liters per hour (Avgas density ~0.72 kg/L)
        fuel_density_kg_l = 0.72
        fuel_flow_l_hr = (fuel_flow_kg_s * 3600.0) / fuel_density_kg_l

        # Refined EGT calculation (Exhaust heat fraction sensitive to throttle & speed)
        exhaust_heat_fraction = 0.22 + 0.08 * throttle + 0.03 * (rpm / self.rated_rpm)
        q_exhaust = p_chem * exhaust_heat_fraction
        exhaust_mass_flow = max(1e-4, air_flow_kg_s + fuel_flow_kg_s)
        cp_exhaust = 1100.0  # J/(kg·K)
        delta_t_exhaust = q_exhaust / (exhaust_mass_flow * cp_exhaust)
        egt_c = ambient_temp_c + delta_t_exhaust

        # Thermal Subsystem Dynamic Calculations
        thermal_data = self.thermal_subsystem.compute(
            cht_c=cht_c,
            oil_temp_c=oil_temp_c,
            p_gross_kw=p_gross_kw,
            p_chem_w=p_chem,
            q_exhaust_w=q_exhaust,
            t_friction_nm=t_friction,
            omega=omega,
            rpm=rpm,
            ambient_temp_c=ambient_temp_c,
            cooling_eff=self.cooling_efficiency,
        )
        cht_target = thermal_data["cht_target_c"]
        dcht_dt = thermal_data["dcht_dt"]
        oil_temp_target = thermal_data["oil_temp_target_c"]
        doil_temp_dt = thermal_data["doil_temp_dt"]
        oil_pressure_bar = thermal_data["oil_pressure_bar"]

        # Vibration Model (g): Baseline speed-dependent + Injector degradation imbalance
        vib_base = 1.0 + 0.0003 * rpm + 0.15 * math.sin(2.0 * omega * time_s)
        combustion_imbalance = 4.0 * (1.0 - self.injector_efficiency) * (rpm / 3000.0)
        vibration_g = max(0.2, vib_base + combustion_imbalance)

        return {
            "rpm": rpm,
            "omega": omega,
            "throttle": throttle,
            "altitude_ft": altitude_ft,
            "air_density": air_density,
            "air_flow_kg_s": air_flow_kg_s,
            "fuel_flow_kg_s": fuel_flow_kg_s,
            "fuel_flow_l_hr": fuel_flow_l_hr,
            "torque_gross_nm": t_gross,
            "torque_friction_nm": t_friction,
            "torque_net_nm": t_net,
            "torque_load_nm": t_load,
            "power_kw": p_brake_kw,
            "egt_c": egt_c,
            "cht_c": cht_c,
            "cht_target_c": cht_target,
            "dcht_dt": dcht_dt,
            "oil_temp_c": oil_temp_c,
            "oil_temp_target_c": oil_temp_target,
            "doil_temp_dt": doil_temp_dt,
            "oil_pressure_bar": oil_pressure_bar,
            "vibration_g": vibration_g,
            "injector_efficiency": self.injector_efficiency,
            "cooling_efficiency": self.cooling_efficiency,
            "heat_generation_kw": thermal_data["heat_generation_kw"],
            "heat_rejection_kw": thermal_data["heat_rejection_kw"],
            "thermal_status": thermal_data["thermal_status"],
            "volumetric_efficiency": eta_v,
        }

    def derivative(self, state, throttle, altitude_ft=0.0, temp_offset_c=0.0, time_s=0.0):
        """
        Compute derivatives d(state)/dt for state vector x = [omega, CHT, OilTemp]:
        - d(omega)/dt = (T_net - T_load) / Inertia
        - d(CHT)/dt = (CHT_target - CHT) / tau_cht
        - d(OilTemp)/dt = (OilTemp_target - OilTemp) / tau_oil
        """
        omega, cht_c, oil_temp_c = state[0], state[1], state[2]
        telemetry = self.compute_telemetry(
            omega, cht_c, oil_temp_c, throttle, altitude_ft, temp_offset_c, time_s
        )

        domega_dt = (telemetry["torque_net_nm"] - telemetry["torque_load_nm"]) / self.inertia
        dcht_dt = telemetry["dcht_dt"]
        doil_temp_dt = telemetry["doil_temp_dt"]

        return [domega_dt, dcht_dt, doil_temp_dt]
