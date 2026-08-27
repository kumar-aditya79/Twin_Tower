"""Reusable controls and telemetry panels for the PyGame frontend."""

import pygame


class UI:
    def __init__(self, colors: dict[str, tuple[int, int, int]]):
        self.c = colors
        self.font = pygame.font.Font(None, 25)
        self.value_font = pygame.font.Font(None, 28)
        self.small = pygame.font.Font(None, 20)
        self.button_rects: dict[str, pygame.Rect] = {}
        self.timeline_rect = pygame.Rect(70, 792, 1300, 18)

    def text(self, surface, value, position, font=None, color=None):
        surface.blit((font or self.font).render(str(value), True, color or self.c["text"]), position)

    def button(self, surface, key, label, rect, active=False):
        self.button_rects[key] = pygame.Rect(rect)
        color = self.c["accent"] if active else self.c["border"]
        pygame.draw.rect(surface, (18, 31, 49), rect, border_radius=6)
        pygame.draw.rect(surface, color, rect, width=2, border_radius=6)
        label_surface = self.small.render(label, True, self.c["text"])
        surface.blit(label_surface, label_surface.get_rect(center=pygame.Rect(rect).center))

    def draw_header(self, surface, state, row):
        self.text(surface, "AERO-PISTON ENGINE DIGITAL TWIN", (42, 25), pygame.font.Font(None, 34))
        self.text(surface, "INTERACTIVE MISSION CONTROL · CSV REPLAY", (44, 58), self.small, self.c["muted"])
        status = row.get("alarm_status", "NORMAL")
        color = self.c["anomaly"] if status != "NORMAL" else self.c["normal"]
        self.text(surface, f"STATUS: {status}", (760, 25), self.font, color)
        self.text(surface, f"MISSION TIME: {state.time_s:05.1f} s", (760, 58), self.small, self.c["muted"])

    def draw_cards(self, surface, row):
        specs = [("RPM", "rpm", "{:.0f}"), ("BRAKE POWER", "power_kw", "{:.1f} kW"),
                 ("INJECTOR", "injector_efficiency", "{:.0%}"), ("EGT", "egt_c", "{:.1f} °C"),
                 ("CHT", "cht_c", "{:.1f} °C"), ("OIL TEMP", "oil_temp_c", "{:.1f} °C"),
                 ("OIL PRESSURE", "oil_pressure_bar", "{:.2f} bar"), ("VIBRATION", "vibration_g", "{:.2f} g")]
        for i, (label, key, fmt) in enumerate(specs):
            x = 45 + (i % 4) * 167
            y = 96 + (i // 4) * 72
            rect = pygame.Rect(x, y, 155, 58)
            pygame.draw.rect(surface, (18, 31, 49), rect, border_radius=7)
            pygame.draw.rect(surface, self.c["border"], rect, width=1, border_radius=7)
            self.text(surface, label, (x + 10, y + 7), self.small, self.c["muted"])
            self.text(surface, fmt.format(float(row.get(key, 0.0))), (x + 10, y + 29), self.value_font)

    def draw_diagnostics(self, surface, row, rect):
        is_anomaly = row.get("status") == "ANOMALY"
        color = self.c["anomaly"] if is_anomaly else self.c["normal"]
        pygame.draw.rect(surface, (13, 23, 37), rect, border_radius=10)
        pygame.draw.rect(surface, color, rect, width=2, border_radius=10)
        self.text(surface, "DIGITAL TWIN DIAGNOSTICS", (rect.x + 18, rect.y + 16), self.font, color)
        status = "🚨 ANOMALY DETECTED" if is_anomaly else "🟢 NORMAL OPERATING STATE"
        lines = [status, f"Anomaly Probability: {float(row.get('anomaly_probability', 0))*100:.1f}%",
                 f"Health Index: {float(row.get('health_index', 100)):.0f} / 100",
                 f"Severity: {row.get('severity_label', 'Healthy')}",
                 f"Confidence: {float(row.get('severity_confidence', 0))*100:.1f}%"]
        for i, line in enumerate(lines):
            self.text(surface, line, (rect.x + 18, rect.y + 58 + i * 31), self.small, color if i == 0 else self.c["text"])

    def draw_timeline(self, surface, state, start, end, fault_time):
        rect = self.timeline_rect
        pygame.draw.line(surface, self.c["border"], (rect.left, rect.centery), (rect.right, rect.centery), 10)
        progress = (state.time_s - start) / max(1e-9, end - start)
        cursor_x = rect.left + int(progress * rect.width)
        pygame.draw.line(surface, self.c["accent"], (rect.left, rect.centery), (cursor_x, rect.centery), 10)
        fault_x = rect.left + int((fault_time - start) / max(1e-9, end - start) * rect.width)
        pygame.draw.line(surface, self.c["warning"], (fault_x, rect.top - 10), (fault_x, rect.bottom + 10), 3)
        pygame.draw.circle(surface, self.c["text"], (cursor_x, rect.centery), 8)
        self.text(surface, f"{start:.0f}s", (rect.left, rect.bottom + 12), self.small, self.c["muted"])
        self.text(surface, "⚡ 30s INJECTOR FAULT", (fault_x - 66, rect.bottom + 12), self.small, self.c["warning"])
        self.text(surface, f"{end:.0f}s", (rect.right - 30, rect.bottom + 12), self.small, self.c["muted"])

    def draw_controls(self, surface, state):
        y = 846
        self.button(surface, "play", "PLAY", (45, y, 105, 34), state.playing)
        self.button(surface, "pause", "PAUSE", (158, y, 105, 34), not state.playing)
        self.button(surface, "reset", "RESET", (271, y, 105, 34))
        self.text(surface, f"Speed: {state.speed_multiplier:g}x", (410, y + 8), self.small, self.c["accent"])
        self.text(surface, "SPACE Play/Pause | LEFT/RIGHT Scrub | 1/2/3 Speed | H/F Presets | E Explain | G Graphs | ESC Exit", (560, y + 8), self.small, self.c["muted"])

    def timeline_time(self, x, start, end):
        ratio = max(0.0, min(1.0, (x - self.timeline_rect.left) / self.timeline_rect.width))
        return start + ratio * (end - start)
