"""One-time Digital Twin diagnostics for mission replay."""

from pathlib import Path

import pandas as pd


class CachedDiagnostics:
    """Load telemetry and run the existing inference pipeline once."""

    def __init__(self, dataframe: pd.DataFrame, models_dir: str | Path):
        self.data = dataframe.sort_values("time_s").reset_index(drop=True)
        self._diagnostic_error = None
        self.data["alarm_status"] = "NORMAL"
        try:
            from ml.digital_twin_inference import DigitalTwinInferenceEngine

            engine = DigitalTwinInferenceEngine(models_dir=str(models_dir))
            self.data = engine.predict_dataframe(self.data)
            consecutive = 0
            statuses = []
            for status in self.data["status"]:
                consecutive = consecutive + 1 if status == "ANOMALY" else 0
                statuses.append("CONFIRMED FAULT" if consecutive >= 3 else "WARNING" if status == "ANOMALY" else "NORMAL")
            self.data["alarm_status"] = statuses
        except (FileNotFoundError, ImportError, ValueError, KeyError, OSError) as exc:
            self._diagnostic_error = str(exc)
            self.data["status"] = "UNAVAILABLE"
            self.data["anomaly_probability"] = 0.0
            self.data["health_index"] = 100.0
            self.data["severity_label"] = "Diagnostics unavailable"
            self.data["severity_confidence"] = 0.0

        self.times = self.data["time_s"].to_numpy()

    @property
    def diagnostic_error(self):
        return self._diagnostic_error

    def index_at_time(self, time_s: float) -> int:
        return int(abs(self.times - time_s).argmin())

    def row_at_time(self, time_s: float):
        return self.data.iloc[self.index_at_time(time_s)]
