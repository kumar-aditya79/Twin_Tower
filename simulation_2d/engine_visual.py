"""Visual-only engine geometry driven by a shared crank angle."""

import math

import pygame


class EngineVisual:
    """Draw a simplified four-cylinder engine; no physics is calculated here."""

    def __init__(self, center: tuple[int, int]):
        self.center = center
        self.angle_deg = 0.0
        self.cylinder_phases = (0.0, math.pi, math.pi, 0.0)

    def update(self, rpm: float, dt: float) -> None:
        revolutions_per_second = max(0.0, float(rpm)) / 60.0
        self.angle_deg = (self.angle_deg + revolutions_per_second * 360.0 * dt) % 360.0

    def draw(self, surface: pygame.Surface, injector_efficiency: float = 1.0) -> None:
        cx, cy = self.center
        block = pygame.Rect(cx - 330, cy - 150, 660, 300)
        pygame.draw.rect(surface, (39, 55, 75), block, border_radius=12)
        pygame.draw.rect(surface, (93, 119, 145), block, width=3, border_radius=12)

        crank_y = cy + 95
        crank_start, crank_end = cx - 275, cx + 275
        pygame.draw.line(surface, (190, 202, 215), (crank_start, crank_y), (crank_end, crank_y), 10)
        crank_angle = math.radians(self.angle_deg)
        pygame.draw.circle(surface, (220, 228, 236), (cx, crank_y), 14)
        pygame.draw.line(
            surface, (80, 214, 232), (cx, crank_y),
            (cx + int(35 * math.cos(crank_angle)), crank_y + int(35 * math.sin(crank_angle))), 5,
        )

        cylinder_xs = [cx - 225, cx - 75, cx + 75, cx + 225]
        for number, (x, phase) in enumerate(zip(cylinder_xs, self.cylinder_phases), 1):
            top = cy - 115
            piston_y = cy - 15 + int(42 * math.sin(crank_angle + phase))
            pygame.draw.rect(surface, (67, 87, 111), (x - 48, top, 96, 190), border_radius=8)
            pygame.draw.rect(surface, (122, 143, 164), (x - 48, top, 96, 190), width=2, border_radius=8)

            efficiency = max(0.0, min(1.0, float(injector_efficiency)))
            spray_length = int(34 * efficiency)
            pygame.draw.line(surface, (246, 184, 75), (x, top - 12), (x, top + spray_length), 4)
            for dot_y in range(top + 8, top + spray_length, 9):
                pygame.draw.circle(surface, (255, 218, 111), (x, dot_y), 3)

            combustion = max(0, int(24 * efficiency)) if math.sin(crank_angle + phase) > 0.35 else 0
            if combustion:
                pygame.draw.circle(surface, (255, 111, 57), (x, top + 24), combustion)
                pygame.draw.circle(surface, (255, 218, 111), (x, top + 24), combustion // 2)

            pygame.draw.rect(surface, (183, 197, 208), (x - 34, piston_y, 68, 18), border_radius=4)
            pygame.draw.line(surface, (215, 224, 232), (x, piston_y + 18), (x, crank_y), 5)
            pygame.draw.circle(surface, (246, 184, 75), (x, crank_y), 8)
            pygame.draw.circle(surface, (220, 228, 236), (x, crank_y), 4)
            self._label(surface, f"P{number}", (x - 8, cy + 125), (229, 238, 249))

        # Keep the rotating propeller below the telemetry cards so its blades
        # remain visually separated from the header and metric grid.
        self._draw_propeller(surface, (cx, cy - 250), crank_angle)

    @staticmethod
    def _draw_propeller(surface: pygame.Surface, center: tuple[int, int], angle: float) -> None:
        x, y = center
        for offset in (0.0, math.pi / 2):
            a = angle + offset
            end = (x + int(74 * math.cos(a)), y + int(74 * math.sin(a)))
            pygame.draw.line(surface, (61, 199, 232), (x, y), end, 12)
        pygame.draw.circle(surface, (229, 238, 249), center, 10)

    @staticmethod
    def _label(surface: pygame.Surface, text: str, position: tuple[int, int], color) -> None:
        font = pygame.font.Font(None, 24)
        surface.blit(font.render(text, True, color), position)
