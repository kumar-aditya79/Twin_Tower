"""Interactive PyGame mission replay controller."""

import sys
from pathlib import Path

import pandas as pd
import pygame

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from simulation_2d.config import (ANOMALY, ACCENT, BACKGROUND, BORDER, MISSION_CSV,
                                       MISSION_START_S, NORMAL, PANEL, PROJECT_ROOT, TARGET_FPS,
                                       TEXT, TEXT_MUTED, WARNING, WINDOW_SIZE)
    from simulation_2d.diagnostics import CachedDiagnostics
    from simulation_2d.engine_visual import EngineVisual
    from simulation_2d.graphs import TelemetryGraphs
    from simulation_2d.state import SimulationState
    from simulation_2d.ui import UI
else:
    from .config import (ANOMALY, ACCENT, BACKGROUND, BORDER, MISSION_CSV, MISSION_START_S,
                         NORMAL, PANEL, PROJECT_ROOT, TARGET_FPS, TEXT, TEXT_MUTED, WARNING,
                         WINDOW_SIZE)
    from .diagnostics import CachedDiagnostics
    from .engine_visual import EngineVisual
    from .graphs import TelemetryGraphs
    from .state import SimulationState
    from .ui import UI


def run() -> None:
    pygame.init()
    screen = pygame.display.set_mode(WINDOW_SIZE)
    pygame.display.set_caption("Aero-Piston Engine Digital Twin | Interactive Mission Control")
    clock = pygame.time.Clock()
    dataframe = pd.read_csv(MISSION_CSV).sort_values("time_s").reset_index(drop=True)
    diagnostics = CachedDiagnostics(dataframe, PROJECT_ROOT / "ml" / "models")
    state = SimulationState(MISSION_START_S, float(diagnostics.times[0]), float(diagnostics.times[-1]))
    ui = UI({"accent": ACCENT, "border": BORDER, "normal": NORMAL, "anomaly": ANOMALY,
             "warning": WARNING, "text": TEXT, "muted": TEXT_MUTED})
    # Lower the complete mechanical assembly to keep the pistons and
    # propeller clear of the telemetry cards above it.
    engine = EngineVisual((390, 550))
    graphs = TelemetryGraphs(pygame.Rect(760, 510, 640, 270), ui.c)
    current_index = diagnostics.index_at_time(state.time_s)

    def set_mission_time(value: float) -> None:
        nonlocal current_index
        state.set_mission_time(value)
        current_index = diagnostics.index_at_time(state.time_s)

    def handle_event(event: pygame.event.Event) -> bool:
        nonlocal current_index
        if event.type == pygame.QUIT:
            return False
        if event.type == pygame.KEYDOWN:
            if event.key == pygame.K_ESCAPE:
                return False
            if event.key == pygame.K_SPACE:
                state.playing = not state.playing
            elif event.key == pygame.K_r:
                state.reset(); engine.angle_deg = 0.0; set_mission_time(state.start_time)
            elif event.key == pygame.K_LEFT:
                state.playing = False
                set_mission_time(diagnostics.times[max(0, current_index - 1)])
            elif event.key == pygame.K_RIGHT:
                state.playing = False
                set_mission_time(diagnostics.times[min(len(diagnostics.times) - 1, current_index + 1)])
            elif event.key == pygame.K_HOME:
                state.playing = False; set_mission_time(state.start_time)
            elif event.key == pygame.K_END:
                state.playing = False; set_mission_time(state.end_time)
            elif event.key in (pygame.K_1, pygame.K_2, pygame.K_3):
                state.speed_multiplier = {pygame.K_1: 0.5, pygame.K_2: 1.0, pygame.K_3: 2.0}[event.key]
            elif event.key == pygame.K_h:
                state.playing = False; set_mission_time(15.0)
            elif event.key == pygame.K_f:
                state.playing = False; set_mission_time(45.0)
            elif event.key == pygame.K_e:
                state.show_explainability = not state.show_explainability
            elif event.key == pygame.K_g:
                state.show_graphs = not state.show_graphs
            elif event.key == pygame.K_QUESTION:
                state.show_help = not state.show_help
        if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
            if ui.timeline_rect.inflate(0, 28).collidepoint(event.pos):
                state.dragging_timeline = True; state.playing = False
                set_mission_time(ui.timeline_time(event.pos[0], state.start_time, state.end_time))
            elif ui.button_rects.get("play", pygame.Rect(0, 0, 0, 0)).collidepoint(event.pos):
                state.playing = True
            elif ui.button_rects.get("pause", pygame.Rect(0, 0, 0, 0)).collidepoint(event.pos):
                state.playing = False
            elif ui.button_rects.get("reset", pygame.Rect(0, 0, 0, 0)).collidepoint(event.pos):
                state.reset(); engine.angle_deg = 0.0; set_mission_time(state.start_time)
        elif event.type == pygame.MOUSEBUTTONUP and event.button == 1:
            state.dragging_timeline = False
        elif event.type == pygame.MOUSEMOTION and state.dragging_timeline:
            set_mission_time(ui.timeline_time(event.pos[0], state.start_time, state.end_time))
        return True

    running = True
    while running:
        dt = min(clock.tick(TARGET_FPS) / 1000.0, 0.1)
        for event in pygame.event.get():
            running = handle_event(event) and running
        state.update(dt)
        current_index = diagnostics.index_at_time(state.time_s)
        row = diagnostics.data.iloc[current_index]
        engine.update(float(row["rpm"]), dt if state.playing else 0.0)
        screen.fill(BACKGROUND)
        pygame.draw.rect(screen, PANEL, (24, 18, 1392, 864), border_radius=14)
        ui.draw_header(screen, state, row)
        ui.draw_cards(screen, row)
        engine.draw(screen, float(row["injector_efficiency"]))
        ui.draw_diagnostics(screen, row, pygame.Rect(760, 100, 640, 220))
        if state.show_explainability and row.get("status") == "ANOMALY":
            pygame.draw.rect(screen, (43, 28, 38), (760, 335, 640, 145), border_radius=9)
            ui.text(screen, "WHY WAS ANOMALY DETECTED?", (780, 350), ui.font, ANOMALY)
            ui.text(screen, "Injector degradation → fuel delivery → combustion → torque", (780, 385), ui.small, TEXT)
            ui.text(screen, "RPM ↓   Power ↓   EGT ↓   Vibration ↑   →   ML anomaly", (780, 415), ui.small, TEXT)
            ui.text(screen, "The known 30 s event is separate from the ML diagnosis.", (780, 445), ui.small, TEXT_MUTED)
        if state.show_graphs:
            graphs.draw(screen, diagnostics.data, current_index, 30.0)
        ui.draw_timeline(screen, state, state.start_time, state.end_time, 30.0)
        ui.draw_controls(screen, state)
        if state.show_help:
            help_rect = pygame.Rect(400, 675, 330, 120)
            pygame.draw.rect(screen, (13, 23, 37), help_rect, border_radius=8)
            pygame.draw.rect(screen, ACCENT, help_rect, width=1, border_radius=8)
            ui.text(screen, "CONTROLS", (420, 690), ui.font, ACCENT)
            ui.text(screen, "SPACE play/pause · R reset · ← → scrub", (420, 720), ui.small)
            ui.text(screen, "H healthy (15s) · F fault (45s) · E explain", (420, 745), ui.small)
            ui.text(screen, "1/2/3 speed · G graphs · ESC exit", (420, 770), ui.small)
        pygame.display.flip()
    pygame.quit()


if __name__ == "__main__":
    run()
