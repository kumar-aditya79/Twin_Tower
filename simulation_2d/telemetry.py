"""CSV-backed mission replay access for the PyGame layer."""

import csv
from pathlib import Path


REQUIRED_COLUMNS = {
    "time_s",
    "rpm",
    "injector_efficiency",
}


class MissionTelemetry:
    """Read-only view of a mission CSV, indexed by mission time."""

    def __init__(self, csv_path: str | Path):
        self.csv_path = Path(csv_path)
        if not self.csv_path.exists():
            raise FileNotFoundError(f"Mission telemetry not found: {self.csv_path}")

        with self.csv_path.open("r", newline="", encoding="utf-8") as handle:
            reader = csv.DictReader(handle)
            fieldnames = set(reader.fieldnames or ())
            missing = REQUIRED_COLUMNS - fieldnames
            if missing:
                raise ValueError(f"Mission telemetry is missing columns: {sorted(missing)}")
            self.data = [
                {key: float(value) if key != "time_s" else float(value) for key, value in row.items()}
                for row in reader
            ]

        self.data.sort(key=lambda row: row["time_s"])
        missing = REQUIRED_COLUMNS - set(self.data[0]) if self.data else REQUIRED_COLUMNS
        if missing:
            raise ValueError(f"Mission telemetry is missing columns: {sorted(missing)}")
        if not self.data:
            raise ValueError("Mission telemetry CSV contains no rows")

        self._times = [row["time_s"] for row in self.data]

    @property
    def start_time(self) -> float:
        return float(self._times[0])

    @property
    def end_time(self) -> float:
        return float(self._times[-1])

    def at_time(self, mission_time: float) -> dict:
        """Return the telemetry row nearest to ``mission_time`` as a dictionary."""
        index = min(range(len(self._times)), key=lambda i: abs(self._times[i] - mission_time))
        return self.data[index].copy()
