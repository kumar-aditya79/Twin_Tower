import os
import joblib
import numpy as np
import pandas as pd


class SeverityClassifier:
    """
    Severity Classifier wrapper for 5-class Injector Health Degradation Estimation:
    0 -> Healthy (100%)
    1 -> 95% Injector Health
    2 -> 90% Injector Health
    3 -> 85% Injector Health
    4 -> 80% Injector Health
    """

    def __init__(self, model_path=None):
        if model_path is None:
            model_path = os.path.join("ml", "models", "severity_classifier.joblib")

        if not os.path.exists(model_path):
            raise FileNotFoundError(f"Severity classifier model not found at {model_path}")

        self.model = joblib.load(model_path)
        self.feature_names = getattr(
            self.model,
            "feature_names_in_",
            [
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
            ],
        )

        self.labels = {
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

    def predict(self, feature_data):
        """
        Predict injector degradation severity class, label, confidence, and estimated health %.

        Parameters
        ----------
        feature_data : dict, list, np.ndarray, or pd.DataFrame
            Features matching the 10 exact input features:
            ['throttle', 'altitude_ft', 'air_density', 'rpm_residual', 'power_residual',
             'egt_residual', 'cht_residual', 'oil_temp_residual', 'oil_pressure_residual',
             'vibration_residual']

        Returns
        -------
        dict
            {"severity_class": int, "severity_label": str, "confidence": float, "health_pct": float}
        """
        if isinstance(feature_data, dict):
            X = pd.DataFrame([feature_data])[self.feature_names]
        elif isinstance(feature_data, pd.DataFrame):
            X = feature_data[self.feature_names]
        elif isinstance(feature_data, (list, np.ndarray)):
            arr = np.asarray(feature_data, dtype=float)
            if arr.ndim == 1:
                arr = arr.reshape(1, -1)
            X = pd.DataFrame(arr, columns=self.feature_names)
        else:
            raise ValueError(f"Unsupported feature_data type: {type(feature_data)}")

        prediction = int(self.model.predict(X)[0])
        probabilities = self.model.predict_proba(X)[0]
        confidence = float(np.max(probabilities))

        return {
            "severity_class": prediction,
            "severity_label": self.labels.get(prediction, f"Class {prediction}"),
            "confidence": confidence,
            "health_pct": self.health_pct_map.get(prediction, 100.0),
        }


def self_test():
    print("=" * 60)
    print("  SEVERITY CLASSIFIER INFERENCE SELF-TEST")
    print("=" * 60)

    classifier = SeverityClassifier()

    # Test Sample 1: Zero residual (Healthy)
    sample_healthy = {
        "throttle": 0.70,
        "altitude_ft": 10000.0,
        "air_density": 0.9046,
        "rpm_residual": 0.0,
        "power_residual": 0.0,
        "egt_residual": 0.0,
        "cht_residual": 0.0,
        "oil_temp_residual": 0.0,
        "oil_pressure_residual": 0.0,
        "vibration_residual": 0.0,
    }
    res_healthy = classifier.predict(sample_healthy)
    print("\n[1] Healthy Sample Test:")
    print(f"    Result:     {res_healthy['severity_label']}")
    print(f"    Class:      {res_healthy['severity_class']}")
    print(f"    Confidence: {res_healthy['confidence']*100:.1f}%")

    # Test Sample 2: Severe Residual (80% Injector Fault)
    sample_severe = {
        "throttle": 0.70,
        "altitude_ft": 10000.0,
        "air_density": 0.9046,
        "rpm_residual": 370.0,
        "power_residual": 10.6,
        "egt_residual": 25.0,
        "cht_residual": 65.0,
        "oil_temp_residual": 15.0,
        "oil_pressure_residual": 0.35,
        "vibration_residual": 0.30,
    }
    res_severe = classifier.predict(sample_severe)
    print("\n[2] Severe Fault Sample Test:")
    print(f"    Result:     {res_severe['severity_label']}")
    print(f"    Class:      {res_severe['severity_class']}")
    print(f"    Confidence: {res_severe['confidence']*100:.1f}%")

    print("\n[SUCCESS] Severity Classifier Self-Test Complete!")


if __name__ == "__main__":
    self_test()
