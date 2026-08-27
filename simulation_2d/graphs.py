"""Small, dependency-free telemetry graph renderer."""

import pygame


class TelemetryGraphs:
    def __init__(self, rect: pygame.Rect, colors: dict[str, tuple[int, int, int]]):
        self.rect = rect
        self.colors = colors

    def draw(self, surface: pygame.Surface, data, index: int, fault_time: float) -> None:
        panel = pygame.Rect(self.rect)
        pygame.draw.rect(surface, (13, 23, 37), panel, border_radius=10)
        pygame.draw.rect(surface, self.colors["border"], panel, width=1, border_radius=10)
        font = pygame.font.Font(None, 22)
        small = pygame.font.Font(None, 18)
        surface.blit(font.render("LIVE TELEMETRY", True, self.colors["accent"]), (panel.x + 14, panel.y + 10))
        specs = [("rpm", "RPM", self.colors["accent"]), ("power_kw", "POWER", self.colors["normal"]),
                 ("vibration_g", "VIBRATION", self.colors["warning"]), ("injector_efficiency", "INJECTOR", self.colors["anomaly"])]
        chart_w, chart_h = 250, 64
        for item, (column, label, color) in enumerate(specs):
            x = panel.x + 14 + (item % 2) * 275
            y = panel.y + 38 + (item // 2) * 92
            chart = pygame.Rect(x, y, chart_w, chart_h)
            pygame.draw.rect(surface, (18, 31, 49), chart, border_radius=5)
            surface.blit(small.render(label, True, self.colors["muted"]), (x + 6, y + 4))
            values = data[column].to_numpy(dtype=float)
            lo, hi = float(values.min()), float(values.max())
            span = max(hi - lo, 1e-9)
            points = []
            for i, value in enumerate(values):
                px = x + 5 + int((chart_w - 10) * i / max(1, len(values) - 1))
                py = y + chart_h - 7 - int((chart_h - 25) * (value - lo) / span)
                points.append((px, py))
            if len(points) > 1:
                pygame.draw.lines(surface, color, False, points, 2)
            fault_x = x + 5 + int((chart_w - 10) * (fault_time - data["time_s"].iloc[0]) / max(1e-9, data["time_s"].iloc[-1] - data["time_s"].iloc[0]))
            pygame.draw.line(surface, self.colors["warning"], (fault_x, y + 22), (fault_x, y + chart_h - 4), 1)
            current_x = x + 5 + int((chart_w - 10) * index / max(1, len(values) - 1))
            pygame.draw.circle(surface, self.colors["text"], (current_x, points[index][1]), 4)
