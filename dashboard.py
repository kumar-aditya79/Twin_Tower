"""
dashboard.py  -  M6 V1: Aero-Piston Engine Digital Twin Dashboard
==================================================================

Interactive Streamlit dashboard for visualising a simulated engine
mission, running Physics-Informed ML diagnostics in real time, and
demonstrating the injector-fault transition narrative.

Run with:
    streamlit run dashboard.py

Architecture
------------
    degraded_injector_telemetry.csv
              |
              v
      Mission Replay (slider / auto-play)
              |
              v
  DigitalTwinInferenceEngine.predict_dataframe()
              |
        +-----+------------------+
        v                        v
  Current Metrics          Timeline Charts (Plotly)

NOTE ON THIS REVISION
----------------------
This is a UI/UX-only revision. No physics, ML inference, data loading,
mission-replay, or fault-injection logic has been changed. Every value
shown on screen still comes directly from `df_diag` / `row`, which are
produced by the exact same `load_and_infer()` -> `predict_dataframe()`
pipeline as before. Only presentation (CSS, layout, chart styling,
iconography, and added explanatory visuals) has been touched.
"""

import os
import sys
import time

import numpy as np
import pandas as pd
import plotly.graph_objects as go
import streamlit as st
from plotly.subplots import make_subplots

# ---------------------------------------------------------------------------
# Python path -- ensure project root is importable regardless of working dir
# ---------------------------------------------------------------------------
_ROOT = os.path.dirname(os.path.abspath(__file__))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

# ---------------------------------------------------------------------------
# Page configuration  (must be the very first Streamlit call)
# ---------------------------------------------------------------------------
st.set_page_config(
    page_title="Aero-Piston Engine Digital Twin",
    page_icon="✈️",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ---------------------------------------------------------------------------
# Design tokens
# ---------------------------------------------------------------------------
C_BG        = "#0A0E14"
C_PANEL     = "#111826"
C_PANEL_2   = "#0D1420"
C_BORDER    = "#1E2A3C"
C_TEXT      = "#E6EDF5"
C_TEXT_DIM  = "#8CA3BE"
C_CYAN      = "#3FC7E8"
C_BLUE      = "#4E9AF1"
C_GREEN     = "#3ED598"
C_AMBER     = "#F6B84B"
C_RED       = "#FF5C6C"
C_VIOLET    = "#B08CF9"

# ---------------------------------------------------------------------------
# Custom CSS -- aerospace mission-control theme
# ---------------------------------------------------------------------------
st.markdown(
    f"""
    <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap');

    html, body, [class*="css"] {{
        font-family: 'Inter', -apple-system, sans-serif;
    }}
    .stApp {{ background-color: {C_BG}; }}
    #MainMenu, footer, header[data-testid="stHeader"] {{ visibility: hidden; height: 0; }}
    .block-container {{ padding-top: 1.1rem; padding-bottom: 2rem; max-width: 1500px; }}

    /* ---------- Header ---------- */
    .dt-header {{
        background: linear-gradient(120deg, #0D1420 0%, #0B1A2A 55%, #0D1420 100%);
        border: 1px solid {C_BORDER};
        border-left: 3px solid {C_CYAN};
        border-radius: 10px;
        padding: 14px 22px;
        margin-bottom: 16px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 10px;
    }}
    .dt-header-title h1 {{
        color: {C_TEXT};
        margin: 0;
        font-size: 1.45rem;
        font-weight: 800;
        letter-spacing: 1.5px;
    }}
    .dt-header-title p {{
        color: {C_CYAN};
        margin: 2px 0 0 0;
        font-size: 0.68rem;
        font-weight: 600;
        letter-spacing: 2px;
        text-transform: uppercase;
        opacity: 0.85;
    }}
    .dt-badges {{ display: flex; gap: 8px; flex-wrap: wrap; }}
    .dt-badge {{
        background: {C_PANEL_2};
        border: 1px solid {C_BORDER};
        border-radius: 7px;
        padding: 5px 12px;
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.72rem;
        color: {C_TEXT_DIM};
        white-space: nowrap;
    }}
    .dt-badge b {{ color: {C_TEXT}; font-weight: 700; }}

    /* ---------- Section labels ---------- */
    .section-label {{
        color: {C_CYAN};
        font-size: 0.72rem;
        font-weight: 700;
        letter-spacing: 2.5px;
        text-transform: uppercase;
        margin: 6px 0 10px 2px;
        opacity: 0.9;
        display: flex;
        align-items: center;
        gap: 8px;
    }}
    .section-label:after {{
        content: "";
        flex: 1;
        height: 1px;
        background: linear-gradient(90deg, {C_BORDER}, transparent);
    }}

    /* ---------- Health status hero ---------- */
    .status-hero {{
        border-radius: 12px;
        padding: 20px 24px;
        border: 1px solid;
        display: flex;
        flex-direction: column;
        justify-content: center;
        height: 100%;
        min-height: 118px;
    }}
    .status-hero.normal {{
        background: linear-gradient(135deg, rgba(62,213,152,0.10), rgba(13,20,32,0.4));
        border-color: rgba(62,213,152,0.45);
    }}
    .status-hero.anomaly {{
        background: linear-gradient(135deg, rgba(255,92,108,0.14), rgba(13,20,32,0.4));
        border-color: rgba(255,92,108,0.55);
    }}
    .status-hero .eyebrow {{
        font-size: 0.68rem; letter-spacing: 2px; font-weight: 700; text-transform: uppercase;
        color: {C_TEXT_DIM}; margin-bottom: 6px;
    }}
    .status-hero.normal .headline {{ color: {C_GREEN}; }}
    .status-hero.anomaly .headline {{ color: {C_RED}; }}
    .status-hero .headline {{
        font-size: 1.55rem; font-weight: 800; letter-spacing: 0.5px; line-height: 1.15;
    }}
    .status-hero .subline {{ color: {C_TEXT_DIM}; font-size: 0.82rem; margin-top: 4px; }}

    /* ---------- Metric cards ---------- */
    .metric-card {{
        background: {C_PANEL};
        border: 1px solid {C_BORDER};
        border-radius: 10px;
        padding: 12px 14px;
        height: 100%;
        transition: border-color 0.15s ease;
    }}
    .metric-card:hover {{ border-color: {C_CYAN}; }}
    .metric-card .m-label {{
        color: {C_TEXT_DIM}; font-size: 0.66rem; font-weight: 700;
        letter-spacing: 1.2px; text-transform: uppercase; margin-bottom: 6px;
    }}
    .metric-card .m-value {{
        font-family: 'JetBrains Mono', monospace; font-size: 1.35rem; font-weight: 700; color: {C_TEXT};
        line-height: 1.1;
    }}
    .metric-card .m-unit {{ font-size: 0.72rem; color: {C_TEXT_DIM}; font-weight: 500; margin-left: 3px; }}
    .metric-card .m-tag {{ font-size: 0.68rem; font-weight: 700; margin-top: 5px; }}

    /* ---------- Telemetry tiles ---------- */
    .tele-tile {{
        background: {C_PANEL};
        border: 1px solid {C_BORDER};
        border-radius: 10px;
        padding: 10px 12px;
        text-align: left;
        height: 100%;
    }}
    .tele-tile .t-icon {{ font-size: 1.05rem; opacity: 0.9; }}
    .tele-tile .t-label {{
        color: {C_TEXT_DIM}; font-size: 0.62rem; font-weight: 700;
        letter-spacing: 1px; text-transform: uppercase; margin: 5px 0 2px 0;
    }}
    .tele-tile .t-value {{
        font-family: 'JetBrains Mono', monospace; color: {C_TEXT}; font-size: 1.12rem; font-weight: 700;
    }}
    .tele-tile .t-unit {{ font-size: 0.68rem; color: {C_TEXT_DIM}; margin-left: 2px; }}

    /* ---------- Diagnostic panel ---------- */
    .diag-panel {{
        border-radius: 10px; padding: 16px 18px; border: 1px solid;
    }}
    .diag-panel.ok {{
        background: rgba(62,213,152,0.06); border-color: rgba(62,213,152,0.35);
    }}
    .diag-panel.bad {{
        background: rgba(255,92,108,0.08); border-color: rgba(255,92,108,0.45);
    }}
    .diag-title {{ font-weight: 800; font-size: 0.95rem; letter-spacing: 0.5px; margin-bottom: 10px; }}
    .diag-panel.ok .diag-title {{ color: {C_GREEN}; }}
    .diag-panel.bad .diag-title {{ color: {C_RED}; }}
    .diag-row {{ display: flex; justify-content: space-between; font-size: 0.82rem; padding: 4px 0; color: {C_TEXT_DIM}; }}
    .diag-row b {{ color: {C_TEXT}; font-family: 'JetBrains Mono', monospace; }}
    .diag-chip {{
        display: inline-block; background: {C_PANEL_2}; border: 1px solid {C_BORDER};
        border-radius: 6px; padding: 3px 9px; margin: 3px 5px 0 0; font-size: 0.75rem;
        font-family: 'JetBrains Mono', monospace; color: {C_TEXT};
    }}
    .diag-chip.up {{ color: {C_RED}; border-color: rgba(255,92,108,0.4); }}
    .diag-chip.down {{ color: {C_AMBER}; border-color: rgba(246,184,75,0.4); }}

    /* ---------- Pipeline ---------- */
    .pipeline-wrap {{
        display: flex; align-items: stretch; gap: 6px; overflow-x: auto; padding: 4px 2px 8px 2px;
    }}
    .pipe-step {{
        flex: 1; min-width: 128px;
        background: {C_PANEL};
        border: 1px solid {C_BORDER};
        border-top: 2px solid {C_CYAN};
        border-radius: 8px;
        padding: 10px 10px;
        text-align: center;
    }}
    .pipe-step .p-icon {{ font-size: 1.15rem; }}
    .pipe-step .p-title {{ color: {C_TEXT}; font-weight: 700; font-size: 0.72rem; margin-top: 4px; letter-spacing: 0.3px; }}
    .pipe-step .p-desc {{ color: {C_TEXT_DIM}; font-size: 0.63rem; margin-top: 2px; line-height: 1.3; }}
    .pipe-arrow {{ display: flex; align-items: center; color: {C_TEXT_DIM}; font-size: 1rem; padding: 0 2px; }}

    /* ---------- Mission timeline ---------- */
    .mtl-wrap {{
        background: {C_PANEL};
        border: 1px solid {C_BORDER};
        border-radius: 10px;
        padding: 14px 18px 10px 18px;
    }}
    .mtl-track {{
        position: relative; height: 8px; border-radius: 5px;
        background: {C_PANEL_2}; border: 1px solid {C_BORDER}; margin: 14px 4px 20px 4px;
    }}
    .mtl-fill {{
        position: absolute; top: 0; left: 0; height: 100%; border-radius: 5px;
        background: linear-gradient(90deg, {C_CYAN}, {C_BLUE});
    }}
    .mtl-cursor {{
        position: absolute; top: -6px; width: 3px; height: 20px; border-radius: 2px;
        background: {C_TEXT}; box-shadow: 0 0 6px rgba(230,237,245,0.6);
    }}
    .mtl-fault-mark {{
        position: absolute; top: -6px; width: 2px; height: 20px; background: {C_AMBER};
    }}
    .mtl-fault-label {{
        position: absolute; top: -30px; transform: translateX(-50%); font-size: 0.62rem;
        color: {C_AMBER}; font-weight: 700; letter-spacing: 0.5px; white-space: nowrap;
        font-family: 'JetBrains Mono', monospace;
    }}
    .mtl-labels {{ display: flex; justify-content: space-between; font-size: 0.68rem; color: {C_TEXT_DIM};
        font-family: 'JetBrains Mono', monospace; }}

    /* ---------- Buttons ---------- */
    .stButton > button {{
        background: {C_PANEL_2}; border: 1px solid {C_BORDER}; color: {C_TEXT};
        border-radius: 7px; font-weight: 600; font-size: 0.8rem;
    }}
    .stButton > button:hover {{ border-color: {C_CYAN}; color: {C_CYAN}; }}

    /* ---------- Sidebar ---------- */
    section[data-testid="stSidebar"] {{ background-color: {C_PANEL_2}; border-right: 1px solid {C_BORDER}; }}
    section[data-testid="stSidebar"] .stMarkdown p, section[data-testid="stSidebar"] label {{ color: {C_TEXT_DIM}; }}

    /* ---------- Tabs ---------- */
    .stTabs [data-baseweb="tab-list"] {{ gap: 4px; }}
    .stTabs [data-baseweb="tab"] {{
        background: {C_PANEL}; border-radius: 7px 7px 0 0; border: 1px solid {C_BORDER};
        color: {C_TEXT_DIM}; font-size: 0.82rem; font-weight: 600; padding: 8px 16px;
    }}
    .stTabs [aria-selected="true"] {{ color: {C_CYAN} !important; border-bottom-color: {C_PANEL} !important; }}
    </style>
    """,
    unsafe_allow_html=True,
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
MISSION_FILES = {
    "Degraded Injector Mission": os.path.join(_ROOT, "data", "degraded_injector_telemetry.csv"),
    "Healthy Baseline Mission":  os.path.join(_ROOT, "data", "healthy_telemetry.csv"),
}
MODELS_DIR = os.path.join(_ROOT, "ml", "models")
FAULT_TIME_S = 30.0   # Known injector-fault onset in the degraded mission

# ---------------------------------------------------------------------------
# Cached resource loaders  (UNCHANGED CORE LOGIC)
# ---------------------------------------------------------------------------

@st.cache_resource(show_spinner="Loading Digital Twin Inference Engine...")
def load_inference_engine():
    required_models = [
        "physics_estimator.joblib",
        "anomaly_classifier.joblib",
        "scaler.joblib",
        "severity_classifier.joblib",
    ]
    missing = [m for m in required_models if not os.path.exists(os.path.join(MODELS_DIR, m))]
    if missing:
        st.error(
            "**Model files not found.**\n\n"
            "Expected the following files inside `ml/models/`:\n"
            + "\n".join(f"- `{m}`" for m in missing)
            + "\n\nPlease run the model training scripts first."
        )
        st.stop()

    try:
        from ml.digital_twin_inference import DigitalTwinInferenceEngine
        return DigitalTwinInferenceEngine(models_dir=MODELS_DIR)
    except Exception as exc:
        st.error(f"**Failed to load Inference Engine:** {exc}")
        st.stop()


@st.cache_data(show_spinner="Loading mission telemetry and running inference...")
def load_and_infer(filepath: str):
    if not os.path.exists(filepath):
        st.error(f"**Mission CSV not found:** `{filepath}`")
        st.stop()

    df = pd.read_csv(filepath)

    required_cols = [
        "time_s", "rpm", "power_kw", "fuel_flow_l_hr", "egt_c", "cht_c",
        "oil_temp_c", "oil_pressure_bar", "vibration_g", "throttle",
        "altitude_ft", "air_density", "torque_net_nm",
    ]
    missing_cols = [c for c in required_cols if c not in df.columns]
    if missing_cols:
        st.error(f"**Missing columns in mission CSV:** {missing_cols}")
        st.stop()

    engine = load_inference_engine()
    df_diag = engine.predict_dataframe(df)
    return df_diag


# ---------------------------------------------------------------------------
# Presentation helpers (display-only, no computation of new values)
# ---------------------------------------------------------------------------

def health_badge(health_index: float) -> str:
    if health_index >= 95:
        return "🟢"
    elif health_index >= 85:
        return "🟡"
    return "🔴"


def format_throttle(val: float) -> str:
    return f"{val * 100:.0f} %"


def metric_card(label, value, unit="", tag=None, tag_color=None, col=None):
    """Render a compact, styled metric card. Values are passed in as-is."""
    tag_html = f'<div class="m-tag" style="color:{tag_color}">{tag}</div>' if tag else ""
    html = f"""
    <div class="metric-card">
        <div class="m-label">{label}</div>
        <div class="m-value">{value}<span class="m-unit">{unit}</span></div>
        {tag_html}
    </div>
    """
    target = col if col is not None else st
    target.markdown(html, unsafe_allow_html=True)


def tele_tile(icon, label, value, unit, col):
    html = f"""
    <div class="tele-tile">
        <span class="t-icon">{icon}</span>
        <div class="t-label">{label}</div>
        <div class="t-value">{value}<span class="t-unit">{unit}</span></div>
    </div>
    """
    col.markdown(html, unsafe_allow_html=True)


# ---------------------------------------------------------------------------
# Main dashboard
# ---------------------------------------------------------------------------

def main():
    # Session state  (UNCHANGED)
    if "playing" not in st.session_state:
        st.session_state.playing = False
    if "current_time" not in st.session_state:
        st.session_state.current_time = 15.0

    # -------------------------------------------------------------------
    # SIDEBAR -- Mission Controls  (logic unchanged, styling refreshed)
    # -------------------------------------------------------------------
    with st.sidebar:
        st.markdown(
            f"""<div style="padding:6px 0 14px 0; border-bottom:1px solid {C_BORDER}; margin-bottom:14px;">
            <div style="color:{C_TEXT}; font-weight:800; font-size:1.05rem;">✈️ MISSION CONTROLS</div>
            <div style="color:{C_TEXT_DIM}; font-size:0.7rem; letter-spacing:1px;">DIGITAL TWIN REPLAY SYSTEM</div>
            </div>""",
            unsafe_allow_html=True,
        )

        st.markdown('<p class="section-label">Mission Data</p>', unsafe_allow_html=True)
        selected_scenario = st.selectbox(
            "Select Mission",
            list(MISSION_FILES.keys()),
            label_visibility="collapsed",
        )
        filepath = MISSION_FILES[selected_scenario]

        df_diag = load_and_infer(filepath)
        max_time = float(df_diag["time_s"].max())
        min_time = float(df_diag["time_s"].min())

        # Playback buttons  (UNCHANGED LOGIC)
        st.markdown('<p class="section-label">Playback</p>', unsafe_allow_html=True)
        col_play, col_pause, col_reset = st.columns(3)
        with col_play:
            if st.button("▶ Start", use_container_width=True):
                st.session_state.playing = True
        with col_pause:
            if st.button("⏸ Pause", use_container_width=True):
                st.session_state.playing = False
        with col_reset:
            if st.button("🔄 Reset", use_container_width=True):
                st.session_state.playing = False
                st.session_state.current_time = min_time

        playing_txt = "🟢 PLAYING" if st.session_state.playing else "⏸️ PAUSED"
        st.caption(f"Status: **{playing_txt}**")

        # Mission time slider  (UNCHANGED LOGIC)
        st.markdown('<p class="section-label">Mission Time</p>', unsafe_allow_html=True)
        slider_time = st.slider(
            "Simulation Time (s)",
            min_value=min_time,
            max_value=max_time,
            value=float(st.session_state.current_time),
            step=0.5,
            format="%.1f s",
            label_visibility="collapsed",
        )
        if abs(slider_time - st.session_state.current_time) > 0.01:
            st.session_state.playing = False
            st.session_state.current_time = slider_time
        current_time = st.session_state.current_time

        if "Degraded" in selected_scenario:
            st.markdown('<p class="section-label">Demo Tip</p>', unsafe_allow_html=True)
            st.info(
                "Move slider to **t = 15 s** → Healthy engine.\n\n"
                "Move slider to **t = 45 s** → Fault detected.\n\n"
                "The injector degrades at **t ≈ 30 s**."
            )

        st.markdown(f'<div style="border-top:1px solid {C_BORDER}; margin:14px 0 10px 0;"></div>', unsafe_allow_html=True)
        st.caption(f"🗂️ Rows loaded: **{len(df_diag):,}**")
        st.caption(f"🕐 Duration: **{min_time:.0f} – {max_time:.0f} s**")

    # -------------------------------------------------------------------
    # Select closest row to current_time  (UNCHANGED LOGIC)
    # -------------------------------------------------------------------
    idx = (df_diag["time_s"] - current_time).abs().argmin()
    row = df_diag.iloc[idx]
    is_anomaly = row["status"] == "ANOMALY"
    is_degraded_mission = "Degraded" in selected_scenario

    # -------------------------------------------------------------------
    # PAGE HEADER
    # -------------------------------------------------------------------
    state_txt = "ANOMALY" if is_anomaly else "NORMAL"
    state_color = C_RED if is_anomaly else C_GREEN
    st.markdown(
        f"""
        <div class="dt-header">
            <div class="dt-header-title">
                <h1>🛩️ AERO-PISTON ENGINE DIGITAL TWIN</h1>
                <p>Real-Time Engine Health &amp; Anomaly Monitoring · Hackathon MVP</p>
            </div>
            <div class="dt-badges">
                <div class="dt-badge">MISSION&nbsp;<b>{selected_scenario}</b></div>
                <div class="dt-badge">T&nbsp;<b>{current_time:.1f}s</b></div>
                <div class="dt-badge">ALT&nbsp;<b>{row['altitude_ft']:,.0f} ft</b></div>
                <div class="dt-badge">THR&nbsp;<b>{format_throttle(row['throttle'])}</b></div>
                <div class="dt-badge" style="border-color:{state_color}; color:{state_color};">STATE&nbsp;<b style="color:{state_color};">{state_txt}</b></div>
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )

    # -------------------------------------------------------------------
    # SECTION -- Digital Twin Health Diagnostics (primary focal point)
    # -------------------------------------------------------------------
    st.markdown('<p class="section-label">Engine Health Status</p>', unsafe_allow_html=True)

    col_status, col_prob, col_health, col_sev, col_conf = st.columns([2.1, 1, 1, 1.5, 1])

    with col_status:
        if is_anomaly:
            st.markdown(
                f"""<div class="status-hero anomaly">
                    <div class="eyebrow">Engine Health</div>
                    <div class="headline">🚨 ANOMALY DETECTED</div>
                    <div class="subline">{row['severity_label']} · deviates from physics-based healthy baseline</div>
                </div>""",
                unsafe_allow_html=True,
            )
        else:
            st.markdown(
                f"""<div class="status-hero normal">
                    <div class="eyebrow">Engine Health</div>
                    <div class="headline">🟢 NORMAL</div>
                    <div class="subline">Operating within expected physics-based parameters</div>
                </div>""",
                unsafe_allow_html=True,
            )

    with col_prob:
        prob_pct = row["anomaly_probability"] * 100
        tag = "⚠ HIGH RISK" if is_anomaly else "✔ SAFE"
        metric_card("Anomaly Probability", f"{prob_pct:.1f}", "%", tag, C_RED if is_anomaly else C_GREEN, col_prob)

    with col_health:
        hi = float(row["health_index"])
        tag = f"{hi - 100:.0f} pts" if is_anomaly else "MAX"
        metric_card(f"{health_badge(hi)} Health Index", f"{hi:.0f}", "/100", tag, C_RED if is_anomaly else C_GREEN, col_health)

    with col_sev:
        metric_card("Fault Severity", f"{row['severity_label']}", "", None, None, col_sev)

    with col_conf:
        metric_card("Severity Confidence", f"{row['severity_confidence']*100:.1f}", "%", None, None, col_conf)

    # -------------------------------------------------------------------
    # SECTION -- Fault Diagnostic Panel (only meaningful when anomalous)
    # -------------------------------------------------------------------
    st.markdown("<div style='height:14px'></div>", unsafe_allow_html=True)
    if is_anomaly:
        chips = ""
        for label, direction in [("RPM", "down"), ("Brake Power", "down"),
                                  ("Vibration", "up"), ("EGT", "down")]:
            arrow = "↑" if direction == "up" else "↓"
            cls = "up" if direction == "up" else "down"
            chips += f'<span class="diag-chip {cls}">{label} {arrow}</span>'
        st.markdown(
            f"""
            <div class="diag-panel bad">
                <div class="diag-title">🚨 ANOMALY DETECTED — Injector Degradation</div>
                <div class="diag-row"><span>Severity</span><b>{row['severity_label']}</b></div>
                <div class="diag-row"><span>Confidence</span><b>{row['severity_confidence']*100:.1f}%</b></div>
                <div class="diag-row"><span>Anomaly Probability</span><b>{row['anomaly_probability']*100:.1f}%</b></div>
                <div style="margin-top:8px; color:{C_TEXT_DIM}; font-size:0.72rem; letter-spacing:0.5px;">AFFECTED TELEMETRY</div>
                <div style="margin-top:4px;">{chips}</div>
            </div>
            """,
            unsafe_allow_html=True,
        )
    else:
        st.markdown(
            f"""
            <div class="diag-panel ok">
                <div class="diag-title">🟢 NO FAULT — Baseline Nominal</div>
                <div class="diag-row"><span>Anomaly Probability</span><b>{row['anomaly_probability']*100:.1f}%</b></div>
                <div class="diag-row"><span>Health Index</span><b>{row['health_index']:.0f} / 100</b></div>
                <div style="margin-top:6px; color:{C_TEXT_DIM}; font-size:0.78rem;">
                    All monitored channels are consistent with the physics-based expected state.
                </div>
            </div>
            """,
            unsafe_allow_html=True,
        )

    st.markdown("<div style='height:18px'></div>", unsafe_allow_html=True)

    # -------------------------------------------------------------------
    # SECTION -- Engine Telemetry tiles
    # -------------------------------------------------------------------
    st.markdown('<p class="section-label">Engine Telemetry Channels</p>', unsafe_allow_html=True)

    t1, t2, t3, t4, t5 = st.columns(5)
    tele_tile("🔄", "Engine Speed", f"{row['rpm']:.0f}", "RPM", t1)
    tele_tile("⚡", "Brake Power", f"{row['power_kw']:.1f}", "kW", t2)
    tele_tile("⛽", "Fuel Flow", f"{row['fuel_flow_l_hr']:.2f}", "L/h", t3)
    tele_tile("🌡️", "Exhaust Gas Temp", f"{row['egt_c']:.1f}", "°C", t4)
    tele_tile("🌡️", "Cylinder Head Temp", f"{row['cht_c']:.1f}", "°C", t5)

    t6, t7, t8, t9, t10 = st.columns(5)
    tele_tile("🛢️", "Oil Temperature", f"{row['oil_temp_c']:.1f}", "°C", t6)
    tele_tile("🛢️", "Oil Pressure", f"{row['oil_pressure_bar']:.2f}", "bar", t7)
    tele_tile("📳", "Vibration", f"{row['vibration_g']:.2f}", "g", t8)
    tele_tile("🎚️", "Throttle", format_throttle(row["throttle"]), "", t9)
    tele_tile("📡", "Altitude", f"{row['altitude_ft']:,.0f}", "ft", t10)

    st.markdown("<div style='height:20px'></div>", unsafe_allow_html=True)

    # -------------------------------------------------------------------
    # SECTION -- Mission Timeline (visual wrapper around existing state)
    # SECTION -- Mission Playback Timeline (native Streamlit components)
    # -------------------------------------------------------------------
    st.markdown('<p class="section-label">Mission Playback Timeline</p>', unsafe_allow_html=True)

    span = max_time - min_time if max_time > min_time else 1.0
    progress_pct = max(0.0, min(100.0, (current_time - min_time) / span * 100))
    fault_pct = max(0.0, min(100.0, (FAULT_TIME_S - min_time) / span * 100)) if is_degraded_mission else None
    progress_frac = max(0.0, min(1.0, (current_time - min_time) / span))

    fault_marker_html = ""
    if fault_pct is not None:
        fault_marker_html = f"""
            <div class="mtl-fault-label" style="left:{fault_pct}%;">⚡ FAULT {FAULT_TIME_S:.0f}s</div>
            <div class="mtl-fault-mark" style="left:{fault_pct}%;"></div>
        """
    # Progress bar — always renders correctly in any Streamlit version
    st.progress(progress_frac)

    st.markdown(
        f"""
        <div class="mtl-wrap">
            <div class="mtl-track">
                <div class="mtl-fill" style="width:{progress_pct}%;"></div>
                {fault_marker_html}
                <div class="mtl-cursor" style="left:{progress_pct}%;"></div>
            </div>
            <div class="mtl-labels">
                <span>{min_time:.0f}s</span>
                <span style="color:{C_CYAN};">● T = {current_time:.1f}s</span>
                <span>{max_time:.0f}s</span>
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )
    # Timeline label row
    lbl_left, lbl_mid, lbl_right = st.columns([1, 2, 1])
    with lbl_left:
        st.caption(f"**{min_time:.0f} s**")
    with lbl_mid:
        if is_degraded_mission:
            fault_frac = (FAULT_TIME_S - min_time) / span
            fault_bar_pos = int(fault_frac * 40)   # approximate char position in a 40-char track
            track = "─" * fault_bar_pos + "⚡" + "─" * (40 - fault_bar_pos - 1)
            st.caption(f"`{track}`  **⚡ Fault @ {FAULT_TIME_S:.0f} s**")
        else:
            st.caption(f"🕐 **T = {current_time:.1f} s** &nbsp;|&nbsp; {progress_frac*100:.0f}% complete")
    with lbl_right:
        st.caption(f"**{max_time:.0f} s**", help="Mission end time")

    st.markdown("<div style='height:22px'></div>", unsafe_allow_html=True)
    # Current time + fault callout badges
    badge_cols = st.columns([1, 1, 2])
    with badge_cols[0]:
        st.info(f"🕐 **T = {current_time:.1f} s**")
    with badge_cols[1]:
        if is_degraded_mission:
            if current_time < FAULT_TIME_S:
                st.success(f"🟢 Pre-fault  ({FAULT_TIME_S - current_time:.0f} s to fault)")
            else:
                st.error(f"🚨 Post-fault  (+{current_time - FAULT_TIME_S:.0f} s)")

    st.markdown("<div style='height:10px'></div>", unsafe_allow_html=True)

    # -------------------------------------------------------------------
    # SECTION -- Interactive Telemetry Graphs (tabbed by system)
    # -------------------------------------------------------------------
    st.markdown('<p class="section-label">Mission Timeline — Interactive Charts</p>', unsafe_allow_html=True)

    plot_font = dict(family="JetBrains Mono, monospace", size=11, color=C_TEXT_DIM)
    times = df_diag["time_s"]

    def base_layout(height=380, legend=True):
        layout = dict(
            height=height,
            template="plotly_dark",
            paper_bgcolor=C_PANEL,
            plot_bgcolor=C_PANEL,
            margin=dict(l=10, r=10, t=36, b=10),
            font=plot_font,
            hoverlabel=dict(bgcolor=C_PANEL_2, font=plot_font),
        )
        if legend:
            layout["legend"] = dict(
                orientation="h", yanchor="bottom", y=1.03, xanchor="right", x=1, font=dict(size=10)
            )
        else:
            layout["showlegend"] = False
        return layout

    def add_markers(fig, y_col, row_idx=None, col_idx=None, showlegend=False):
        fig.add_trace(
            go.Scatter(
                x=[row["time_s"]], y=[row[y_col]], mode="markers",
                marker=dict(color=C_TEXT, size=10, line=dict(color=C_CYAN, width=2)),
                name="Current", showlegend=showlegend,
                hovertemplate=f"t=%{{x:.1f}}s<br>{y_col}=%{{y:.2f}}<extra></extra>",
            ),
            row=row_idx, col=col_idx,
        )

    def add_fault_line(fig, row_idx=None, col_idx=None):
        if not is_degraded_mission:
            return
        kwargs = dict(x=FAULT_TIME_S, line_dash="dot", line_color=C_AMBER, line_width=1.6)
        if row_idx is not None:
            fig.add_vline(row=row_idx, col=col_idx, **kwargs)
        else:
            fig.add_vline(**kwargs)

    def add_current_line(fig, row_idx=None, col_idx=None):
        kwargs = dict(x=current_time, line_dash="dash", line_color=C_CYAN, line_width=1.3, opacity=0.6)
        if row_idx is not None:
            fig.add_vline(row=row_idx, col=col_idx, **kwargs)
        else:
            fig.add_vline(**kwargs)

    tab_perf, tab_thermal, tab_mech, tab_ops = st.tabs(
        ["⚙️ Engine Performance", "🌡️ Thermal State", "🔧 Mechanical Health", "🎚️ Operating Conditions"]
    )

    with tab_perf:
        fig = make_subplots(rows=1, cols=2, subplot_titles=("Engine Speed (RPM)", "Brake Power & Fuel Flow"))
        fig.add_trace(go.Scatter(x=times, y=df_diag["rpm"], name="RPM", line=dict(color=C_BLUE, width=2),
                                  hovertemplate="t=%{x:.1f}s<br>RPM=%{y:.0f}<extra></extra>"), row=1, col=1)
        add_markers(fig, "rpm", 1, 1)
        add_fault_line(fig, 1, 1); add_current_line(fig, 1, 1)

        fig.add_trace(go.Scatter(x=times, y=df_diag["power_kw"], name="Power (kW)", line=dict(color=C_GREEN, width=2),
                                  hovertemplate="t=%{x:.1f}s<br>Power=%{y:.1f} kW<extra></extra>"), row=1, col=2)
        fig.add_trace(go.Scatter(x=times, y=df_diag["fuel_flow_l_hr"], name="Fuel Flow (L/h)",
                                  line=dict(color=C_VIOLET, width=2, dash="dot"),
                                  hovertemplate="t=%{x:.1f}s<br>Fuel=%{y:.2f} L/h<extra></extra>"), row=1, col=2)
        add_markers(fig, "power_kw", 1, 2, showlegend=True)
        add_fault_line(fig, 1, 2); add_current_line(fig, 1, 2)

        fig.update_layout(**base_layout(360))
        fig.update_xaxes(title_text="Time (s)", gridcolor=C_BORDER)
        fig.update_yaxes(gridcolor=C_BORDER)
        st.plotly_chart(fig, use_container_width=True, config={"displaylogo": False})

    with tab_thermal:
        fig = go.Figure()
        for col_name, label, color in [("egt_c", "EGT (°C)", C_RED), ("cht_c", "CHT (°C)", C_AMBER),
                                        ("oil_temp_c", "Oil Temp (°C)", C_VIOLET)]:
            fig.add_trace(go.Scatter(x=times, y=df_diag[col_name], name=label, line=dict(color=color, width=2),
                                      hovertemplate=f"t=%{{x:.1f}}s<br>{label}=%{{y:.1f}}<extra></extra>"))
        fig.add_trace(go.Scatter(x=[row["time_s"]], y=[row["egt_c"]], mode="markers",
                                  marker=dict(color=C_TEXT, size=10, line=dict(color=C_CYAN, width=2)),
                                  name="Current", showlegend=True,
                                  hovertemplate="t=%{x:.1f}s<extra></extra>"))
        add_fault_line(fig); add_current_line(fig)
        fig.update_layout(**base_layout(380))
        fig.update_xaxes(title_text="Time (s)", gridcolor=C_BORDER)
        fig.update_yaxes(title_text="Temperature (°C)", gridcolor=C_BORDER)
        st.plotly_chart(fig, use_container_width=True, config={"displaylogo": False})

    with tab_mech:
        fig = make_subplots(rows=1, cols=2, subplot_titles=("Vibration (g)", "Oil Pressure (bar)"))
        fig.add_trace(go.Scatter(x=times, y=df_diag["vibration_g"], name="Vibration", line=dict(color=C_VIOLET, width=2),
                                  fill="tozeroy", fillcolor="rgba(176,140,249,0.10)",
                                  hovertemplate="t=%{x:.1f}s<br>Vib=%{y:.3f}g<extra></extra>"), row=1, col=1)
        add_markers(fig, "vibration_g", 1, 1)
        add_fault_line(fig, 1, 1); add_current_line(fig, 1, 1)

        fig.add_trace(go.Scatter(x=times, y=df_diag["oil_pressure_bar"], name="Oil Pressure", line=dict(color=C_BLUE, width=2),
                                  hovertemplate="t=%{x:.1f}s<br>Oil P=%{y:.2f} bar<extra></extra>"), row=1, col=2)
        add_markers(fig, "oil_pressure_bar", 1, 2)
        add_fault_line(fig, 1, 2); add_current_line(fig, 1, 2)

        fig.update_layout(**base_layout(360, legend=False))
        fig.update_xaxes(title_text="Time (s)", gridcolor=C_BORDER)
        fig.update_yaxes(gridcolor=C_BORDER)
        st.plotly_chart(fig, use_container_width=True, config={"displaylogo": False})

    with tab_ops:
        fig = make_subplots(rows=1, cols=2, subplot_titles=("Throttle (%)", "Altitude (ft)"))
        fig.add_trace(go.Scatter(x=times, y=df_diag["throttle"] * 100, name="Throttle",
                                  line=dict(color=C_CYAN, width=2),
                                  hovertemplate="t=%{x:.1f}s<br>Throttle=%{y:.0f}%<extra></extra>"), row=1, col=1)
        fig.add_trace(go.Scatter(x=[row["time_s"]], y=[row["throttle"] * 100], mode="markers",
                                  marker=dict(color=C_TEXT, size=10, line=dict(color=C_CYAN, width=2)),
                                  showlegend=False,
                                  hovertemplate="t=%{x:.1f}s<br>Throttle=%{y:.0f}%<extra></extra>"), row=1, col=1)
        add_fault_line(fig, 1, 1); add_current_line(fig, 1, 1)

        fig.add_trace(go.Scatter(x=times, y=df_diag["altitude_ft"], name="Altitude", line=dict(color=C_GREEN, width=2),
                                  hovertemplate="t=%{x:.1f}s<br>Alt=%{y:,.0f} ft<extra></extra>"), row=1, col=2)
        add_markers(fig, "altitude_ft", 1, 2)
        add_fault_line(fig, 1, 2); add_current_line(fig, 1, 2)

        fig.update_layout(**base_layout(360, legend=False))
        fig.update_xaxes(title_text="Time (s)", gridcolor=C_BORDER)
        fig.update_yaxes(gridcolor=C_BORDER)
        st.plotly_chart(fig, use_container_width=True, config={"displaylogo": False})

    if is_degraded_mission:
        st.caption("⚡ Dotted amber line marks injector fault onset (t ≈ 30s) · Dashed cyan line marks current playback position.")
    else:
        st.caption("Dashed cyan line marks current playback position. Healthy baseline mission — no fault injected.")

    st.markdown("<div style='height:22px'></div>", unsafe_allow_html=True)

    # -------------------------------------------------------------------
    # SECTION -- Digital Twin Pipeline explainer
    # -------------------------------------------------------------------
    st.markdown('<p class="section-label">Digital Twin Pipeline</p>', unsafe_allow_html=True)

    pipeline_steps = [
        ("📡", "Sensor Telemetry", "Raw mission data stream"),
        ("🧮", "Physics-Based Model", "Expected healthy engine state"),
        ("Δ", "Physics Residuals", "Actual vs. expected deviation"),
        ("🧠", "ML Anomaly Detection", "Classifies normal vs. anomaly"),
        ("🩺", "Severity Classification", "Estimates fault severity"),
        ("✅", "Health Assessment", "Health index + alert output"),
    ]
    arrow = '<div class="pipe-arrow">→</div>'
    steps_html = arrow.join(
        f"""<div class="pipe-step">
                <div class="p-icon">{icon}</div>
                <div class="p-title">{title}</div>
                <div class="p-desc">{desc}</div>
            </div>"""
        for icon, title, desc in pipeline_steps
    )
    st.markdown(f'<div class="pipeline-wrap">{steps_html}</div>', unsafe_allow_html=True)

    st.markdown("<div style='height:10px'></div>", unsafe_allow_html=True)

    # -------------------------------------------------------------------
    # Narrative Footer
    # -------------------------------------------------------------------
    st.markdown("---")
    if is_degraded_mission:
        st.markdown('<p class="section-label">Mission Story</p>', unsafe_allow_html=True)
        narrative_cols = st.columns(5)
        stages = [
            ("0 – 30 s",  "🟢 Normal",    "Full injector efficiency"),
            ("t ≈ 30 s",  "⚡ Fault",     "Injector drops to 80%"),
            ("30 – 60 s", "🔴 Degraded",  "Power & RPM decrease"),
            ("ML Layer",  "🧠 Detect",    "Physics residuals spike"),
            ("Output",    "🚨 Alert",     "Severity + Health Index"),
        ]
        for col, (t, title, desc) in zip(narrative_cols, stages):
            with col:
                st.markdown(
                    f"""<div class="metric-card">
                        <div class="m-label">{t}</div>
                        <div style="font-weight:700; color:{C_TEXT}; font-size:0.9rem; margin-top:4px;">{title}</div>
                        <div style="color:{C_TEXT_DIM}; font-size:0.72rem; margin-top:2px;">{desc}</div>
                    </div>""",
                    unsafe_allow_html=True,
                )
    else:
        st.caption("Healthy Baseline Mission — no fault injection. All systems nominal.")

    # -------------------------------------------------------------------
    # Auto-play logic  (UNCHANGED LOGIC)
    # -------------------------------------------------------------------
    if st.session_state.playing:
        next_time = current_time + 0.5
        if next_time > max_time:
            st.session_state.playing = False
            st.session_state.current_time = max_time
        else:
            st.session_state.current_time = next_time
            time.sleep(0.4)
            st.rerun()


if __name__ == "__main__":
    main()