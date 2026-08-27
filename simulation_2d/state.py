"""Visualization-only replay state."""

from dataclasses import dataclass


@dataclass
class SimulationState:
    time_s: float
    start_time: float
    end_time: float
    playing: bool = True
    speed_multiplier: float = 1.0
    dragging_timeline: bool = False
    show_help: bool = False
    show_explainability: bool = False
    show_graphs: bool = True

    def clamp_time(self, value: float) -> float:
        return max(self.start_time, min(float(value), self.end_time))

    def set_mission_time(self, value: float) -> None:
        self.time_s = self.clamp_time(value)

    def reset(self) -> None:
        self.time_s = self.start_time
        self.playing = False

    def update(self, dt: float) -> None:
        if self.playing:
            self.set_mission_time(self.time_s + dt * self.speed_multiplier)
            if self.time_s >= self.end_time:
                self.playing = False
