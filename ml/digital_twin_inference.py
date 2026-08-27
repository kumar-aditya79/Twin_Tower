import os
import joblib
import numpy as np
import pandas as pd


class DigitalTwinInferenceEngine:
    """
    Unified Physics-Informed Digital Twin Diagnostic Inference Engine.
    
    Combines:
    1. Physics Estimator: Predicts baseline expected healthy engine telemetry.
    2. Anomaly Classifier: Detects NORMAL vs ANOMALY engine state.
    3. Severity Classifier: Estimates 5-class injector health degradation severity.
    """

    def __init__(self, models_dir=None):
        if models_dir is None:
            models_dir = os.path.join("ml", "models")

        estimator_path = os.path.join(models_dir, "physics_estimator.joblib")
        classifier_path = os.path.join(models_dir, "anomaly_classifier.joblib")
        scaler_path = os.path.join(models_dir, "scaler.joblib")
        severity_path = os.path.join(models_dir, "severity_classifier.joblib")

        for path, name in [
            (estimator_path, "Physics Estimator"),
            (classifier_path, "Anomaly Classifier"),
            (scaler_path, "Feature Scaler"),
            (severity_path, "Severity Classifier"),
        ]:
            if not os.path.exists(path):
                raise FileNotFoundError(f"{name} model file not found at {path}")

        self.physics_estimator = joblib.load(estimator_path)
        self.anomaly_classifier = joblib.load(classifier_path)
        self.scaler = joblib.load(scaler_path)
        self.severity_classifier = joblib.load(severity_path)

        self.env_inputs = ["altitude_ft", "throttle", "air_density"]
        self.sensor_outputs = [
            "rpm",
            "torque_net_nm",
            "power_kw",
            "fuel_flow_l_hr",
            "egt_c",
            "cht_c",
            "oil_temp_c",
            "oil_pressure_bar",
            "vibration_g",
        ]
        self.features = self.env_inputs + self.sensor_outputs

        self.severity_features = [
            "throttle",
            "altitude_ft",
            "air_density",
            "rpm_residual",
            "power_residual",
            "egt_residual",
            "cht_residual",
            "oil_temp_residual",
            "oil_pressure_residual",
            "vibration_residual",
        ]

        self.severity_labels = {
            0: "Healthy (100%)",
            1: "95% Injector Health",
            2: "90% Injector Health",
            3: "85% Injector Health",
            4: "80% Injector Health",
        }

        self.health_pct_map = {
            0: 100.0,
            1: 95.0,
            2: 90.0,
            3: 85.0,
            4: 80.0,
        }

    def predict_sample(self, telemetry_sample):
        """
        Run end-to-end inference on a single telemetry sample or row.

        Parameters
        ----------
        telemetry_sample : dict or pd.Series
            Dictionary containing operating inputs and measured sensor channels.

        Returns
        -------
        dict
            Diagnostic status, anomaly probability, severity label, and health index.
        """
        if isinstance(telemetry_sample, pd.Series):
            sample = telemetry_sample.to_dict()
        else:
            sample = telemetry_sample

        # 1. Environment Inputs & Measured Sensor Values
        df_env = pd.DataFrame([[sample[f] for f in self.env_inputs]], columns=self.env_inputs)
        actual_sensors = np.array([sample[f] for f in self.sensor_outputs], dtype=float)

        # 2. Physics Baseline Prediction & Residual Computation
        predicted_healthy = self.physics_estimator.predict(df_env)[0]
        residuals = np.abs(actual_sensors - predicted_healthy)

        # Create explicit residual mapping dictionary
        res_map = {
            "rpm_residual": residuals[0],
            "torque_residual": residuals[1],
            "power_residual": residuals[2],
            "fuel_flow_residual": residuals[3],
            "egt_residual": residuals[4],
            "cht_residual": residuals[5],
            "oil_temp_residual": residuals[6],
            "oil_pressure_residual": residuals[7],
            "vibration_residual": residuals[8],
        }

        # 3. Anomaly Classifier Inference
        X_raw = np.array([sample[f] for f in self.features], dtype=float)
        X_aug = np.hstack([X_raw, residuals]).reshape(1, -1)
        X_scaled = self.scaler.transform(X_aug)

        anomaly_prob = float(self.anomaly_classifier.predict_proba(X_scaled)[0, 1])
        is_anomaly = anomaly_prob >= 0.50

        # 4. Severity Classifier Inference
        severity_input_dict = {
            "throttle": sample["throttle"],
            "altitude_ft": sample["altitude_ft"],
            "air_density": sample["air_density"],
            "rpm_residual": res_map["rpm_residual"],
            "power_residual": res_map["power_residual"],
            "egt_residual": res_map["egt_residual"],
            "cht_residual": res_map["cht_residual"],
            "oil_temp_residual": res_map["oil_temp_residual"],
            "oil_pressure_residual": res_map["oil_pressure_residual"],
            "vibration_residual": res_map["vibration_residual"],
        }
        df_sev = pd.DataFrame([severity_input_dict])[self.severity_features]
        sev_class = int(self.severity_classifier.predict(df_sev)[0])
        sev_probs = self.severity_classifier.predict_proba(df_sev)[0]
        sev_conf = float(np.max(sev_probs))

        sev_label = self.severity_labels.get(sev_class, f"Class {sev_class}")
        health_pct = self.health_pct_map.get(sev_class, 100.0)

        # 5. Final Diagnostic Synthesis
        if not is_anomaly:
            status = "NORMAL"
            final_label = "Healthy"
            final_health_index = 100.0
        else:
            status = "ANOMALY"
            final_label = sev_label
            final_health_index = health_pct

        return {
            "status": status,
            "anomaly_probability": anomaly_prob,
            "health_index": final_health_index,
            "severity_class": sev_class,
            "severity_label": final_label,
            "severity_confidence": sev_conf,
            "residuals": {
                "rpm": float(res_map["rpm_residual"]),
                "power": float(res_map["power_residual"]),
                "cht": float(res_map["cht_residual"]),
                "vibration": float(res_map["vibration_residual"]),
            },
        }

    def predict_dataframe(self, dataframe):
        """
        Run vectorized batch inference over a full telemetry DataFrame.

        Parameters
        ----------
        dataframe : pd.DataFrame
            DataFrame containing telemetry columns.

        Returns
        -------
        pd.DataFrame
            Original DataFrame augmented with diagnostic predictions.
        """
        df_out = dataframe.copy()

        # 1. Physics Baseline Prediction
        predicted_healthy = self.physics_estimator.predict(df_out[self.env_inputs])
        actual_sensors = df_out[self.sensor_outputs].values
        residuals = np.abs(actual_sensors - predicted_healthy)

        # 2. Anomaly Classifier Inference
        X_raw = df_out[self.features].values
        X_aug = np.hstack([X_raw, residuals])
        X_scaled = self.scaler.transform(X_aug)

        anomaly_probs = self.anomaly_classifier.predict_proba(X_scaled)[:, 1]
        df_out["anomaly_probability"] = anomaly_probs
        df_out["status"] = np.where(anomaly_probs >= 0.50, "ANOMALY", "NORMAL")

        # 3. Severity Classifier Inference
        res_map = {
            "rpm_residual": residuals[:, 0],
            "torque_residual": residuals[:, 1],
            "power_residual": residuals[:, 2],
            "fuel_flow_residual": residuals[:, 3],
            "egt_residual": residuals[:, 4],
            "cht_residual": residuals[:, 5],
            "oil_temp_residual": residuals[:, 6],
            "oil_pressure_residual": residuals[:, 7],
            "vibration_residual": residuals[:, 8],
        }

        sev_df = pd.DataFrame({
            "throttle": df_out["throttle"].values,
            "altitude_ft": df_out["altitude_ft"].values,
            "air_density": df_out["air_density"].values,
            "rpm_residual": res_map["rpm_residual"],
            "power_residual": res_map["power_residual"],
            "egt_residual": res_map["egt_residual"],
            "cht_residual": res_map["cht_residual"],
            "oil_temp_residual": res_map["oil_temp_residual"],
            "oil_pressure_residual": res_map["oil_pressure_residual"],
            "vibration_residual": res_map["vibration_residual"],
        })[self.severity_features]

        sev_classes = self.severity_classifier.predict(sev_df)
        sev_probs = self.severity_classifier.predict_proba(sev_df)
        sev_confs = np.max(sev_probs, axis=1)

        df_out["severity_class"] = sev_classes
        df_out["severity_confidence"] = sev_confs
        df_out["severity_label"] = [self.severity_labels.get(c, f"Class {c}") for c in sev_classes]
        df_out["health_index"] = [self.health_pct_map.get(c, 100.0) if df_out["status"].iloc[i] == "ANOMALY" else 100.0 for i, c in enumerate(sev_classes)]

        return df_out


def self_test():
    print("=" * 70)
    print("  DIGITAL TWIN UNIFIED INFERENCE ENGINE SELF-TEST")
    print("=" * 70)

    engine = DigitalTwinInferenceEngine()

    # Healthy Telemetry Sample (10,000 ft, 70% throttle)
    healthy_sample = {
        "altitude_ft": 10000.0,
        "throttle": 0.70,
        "air_density": 0.9046,
        "rpm": 2907.0,
        "torque_net_nm": 103.4,
        "power_kw": 31.5,
        "fuel_flow_l_hr": 14.41,
        "egt_c": 688.5,
        "cht_c": 204.4,
        "oil_temp_c": 92.0,
        "oil_pressure_bar": 3.8,
        "vibration_g": 1.99,
    }
    res_h = engine.predict_sample(healthy_sample)
    print("\n[1] Healthy Telemetry Sample:")
    print(f"    Status:              {res_h['status']}")
    print(f"    Anomaly Probability: {res_h['anomaly_probability']*100:.1f}%")
    print(f"    Health Index:        {res_h['health_index']:.0f} / 100")
    print(f"    Severity Label:      {res_h['severity_label']}")
    print(f"    Severity Confidence: {res_h['severity_confidence']*100:.1f}%")

    # Fault Telemetry Sample (80% Injector Fault)
    degraded_sample = {
        "altitude_ft": 10000.0,
        "throttle": 0.70,
        "air_density": 0.9046,
        "rpm": 2537.0,
        "torque_net_nm": 78.5,
        "power_kw": 20.9,
        "fuel_flow_l_hr": 10.01,
        "egt_c": 688.5,
        "cht_c": 145.5,
        "oil_temp_c": 82.0,
        "oil_pressure_bar": 3.5,
        "vibration_g": 2.29,
    }
    res_d = engine.predict_sample(degraded_sample)
    print("\n[2] Injector Degraded Telemetry Sample:")
    print(f"    Status:              {res_d['status']}")
    print(f"    Anomaly Probability: {res_d['anomaly_probability']*100:.1f}%")
    print(f"    Health Index:        {res_d['health_index']:.0f} / 100")
    print(f"    Severity Label:      {res_d['severity_label']}")
    print(f"    Severity Confidence: {res_d['severity_confidence']*100:.1f}%")

    print("\n[SUCCESS] Digital Twin Unified Inference Engine Complete!")


if __name__ == "__main__":
    self_test()
