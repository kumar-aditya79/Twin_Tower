import os
import numpy as np
import pandas as pd
from Engine.engine import PistonEngine


class EngineSimulator:
    """
    Time-stepping dynamic simulator for the aero-piston engine.
    Solves 3D state vector ODE: x = [omega, CHT, OilTemp] using RK4 integration.
    """

    def __init__(self, engine: PistonEngine = None):
        self.engine = engine if engine is not None else PistonEngine()
        self.results_df = None

    def run(
        self,
        duration_s=60.0,
        dt=0.05,
        throttle_profile=0.5,
        altitude_profile=10000.0,
        temp_offset_profile=0.0,
        initial_rpm=2500.0,
        initial_cht=75.0,
        initial_oil_temp=65.0,
        fault_schedule=None,
    ):
        """
        Run dynamic multi-state simulation over duration_s with step size dt.

        Parameters
        ----------
        duration_s : float
            Total simulation duration in seconds.
        dt : float
            Integration step size in seconds.
        throttle_profile : float or callable f(t)
            Throttle input profile [0.0 to 1.0].
        altitude_profile : float or callable f(t)
            Altitude profile in feet.
        temp_offset_profile : float or callable f(t)
            Temperature deviation profile in °C.
        initial_rpm : float
            Starting engine speed in RPM.
        initial_cht : float
            Starting Cylinder Head Temperature in °C.
        initial_oil_temp : float
            Starting Oil Temperature in °C.
        fault_schedule : callable f(t, engine) or None
            Optional callback to modify engine health parameters at specific time points.

        Returns
        -------
        pd.DataFrame
            Telemetry history dataframe.
        """
        get_throttle = (
            throttle_profile
            if callable(throttle_profile)
            else lambda t: float(throttle_profile)
        )
        get_altitude = (
            altitude_profile
            if callable(altitude_profile)
            else lambda t: float(altitude_profile)
        )
        get_temp_offset = (
            temp_offset_profile
            if callable(temp_offset_profile)
            else lambda t: float(temp_offset_profile)
        )

        # Initial 3D State Vector: x = [omega, CHT, OilTemp]
        initial_omega = initial_rpm * (2.0 * np.pi / 60.0)
        x_current = np.array([initial_omega, initial_cht, initial_oil_temp], dtype=float)

        time_steps = np.arange(0.0, duration_s + dt / 2.0, dt)
        records = []

        for t in time_steps:
            # Apply dynamic fault schedule if provided
            if fault_schedule is not None:
                fault_schedule(t, self.engine)

            throttle = get_throttle(t)
            altitude_ft = get_altitude(t)
            temp_offset = get_temp_offset(t)

            # Record telemetry at current state
            telem = self.engine.compute_telemetry(
                x_current[0],
                x_current[1],
                x_current[2],
                throttle,
                altitude_ft,
                temp_offset,
                t,
            )
            telem["time_s"] = t
            records.append(telem)

            # RK4 3D Vector Step Integration
            def f_deriv(x, t_val):
                th = get_throttle(t_val)
                alt = get_altitude(t_val)
                toff = get_temp_offset(t_val)
                return np.array(
                    self.engine.derivative(x, th, alt, toff, t_val), dtype=float
                )

            k1 = f_deriv(x_current, t)
            k2 = f_deriv(x_current + 0.5 * dt * k1, t + 0.5 * dt)
            k3 = f_deriv(x_current + 0.5 * dt * k2, t + 0.5 * dt)
            k4 = f_deriv(x_current + dt * k3, t + dt)

            x_current += (dt / 6.0) * (k1 + 2.0 * k2 + 2.0 * k3 + k4)
            # Physical state lower bounds protection
            x_current[0] = max(0.1, x_current[0])
            x_current[1] = max(-20.0, x_current[1])
            x_current[2] = max(-20.0, x_current[2])

        self.results_df = pd.DataFrame(records)
        return self.results_df

    def export_csv(self, filepath):
        """Export simulation results to CSV file."""
        if self.results_df is None:
            raise ValueError("No simulation results available to export. Run simulation first.")
        
        os.makedirs(os.path.dirname(os.path.abspath(filepath)), exist_ok=True)
        self.results_df.to_csv(filepath, index=False)
        print(f"Telemetry saved successfully to: {filepath}")
