"""Configuration for the PyGame digital-twin replay prototype."""

from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
MISSION_CSV = PROJECT_ROOT / "data" / "degraded_injector_telemetry.csv"
WINDOW_SIZE = (1440, 900)
TARGET_FPS = 60
MISSION_START_S = 0.0
BACKGROUND = (9, 16, 28)
PANEL = (18, 29, 46)
TEXT = (229, 238, 249)
TEXT_MUTED = (145, 164, 187)
ACCENT = (61, 199, 232)
WARNING = (246, 184, 75)
NORMAL = (62, 213, 152)
ANOMALY = (255, 92, 108)
BORDER = (38, 58, 82)
