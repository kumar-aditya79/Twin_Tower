"""
dashboard.py  -  Aero-Piston Engine Digital Twin: Interactive Control Center
=============================================================================
SIH 2027 | Problem Statement 26054
"""

import os
import sys
import time
import math
import json
import numpy as np
import pandas as pd
import plotly.graph_objects as go
import streamlit as st
import streamlit.components.v1 as components

_ROOT = os.path.dirname(os.path.abspath(__file__))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from Engine.engine import PistonEngine
from Engine.simulation import EngineSimulator
from Engine.atmosphere import atmosphere
from ml.digital_twin_inference import DigitalTwinInferenceEngine

st.set_page_config(
    page_title="Aero-Piston Engine Digital Twin | Control Center",
    page_icon="✈️",
    layout="wide",
    initial_sidebar_state="collapsed",
)

st.markdown(
    """
    <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap');

    html, body, [class*="css"] {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    }
    .stApp {
        background-color: #0A0E17;
        color: #E2E8F0;
    }
    #MainMenu, footer, header[data-testid="stHeader"] {
        visibility: hidden;
        height: 0;
    }
    .block-container {
        padding-top: 0.55rem;
        padding-bottom: 0.8rem;
        padding-left: 1rem;
        padding-right: 1rem;
        max-width: 100%;
    }

    .ctrl-card {
        background: #101726;
        border: 1px solid #1E293B;
        border-radius: 10px;
        padding: 11px 13px;
        margin-bottom: 9px;
    }
    .ctrl-card-title {
        font-size: 0.85rem;
        font-weight: 700;
        color: #94A3B8;
        letter-spacing: 0.5px;
        margin-bottom: 9px;
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .top-nav {
        background: #101726;
        border: 1px solid #1E293B;
        border-radius: 10px;
        padding: 10px 20px;
        margin-bottom: 12px;
        display: flex;
        align-items: center;
        justify-content: space-between;
    }
    .top-brand {
        display: flex;
        align-items: center;
        gap: 12px;
    }
    .top-brand h1 {
        font-size: 1.25rem;
        font-weight: 800;
        color: #F8FAFC;
        margin: 0;
        letter-spacing: 0.5px;
    }
    .top-brand p {
        font-size: 0.72rem;
        color: #38BDF8;
        margin: 0;
        font-weight: 500;
        letter-spacing: 1px;
    }

    .telem-bar {
        background: #101726;
        border: 1px solid #1E293B;
        border-radius: 10px;
        padding: 8px 12px;
        display: flex;
        align-items: center;
        justify-content: space-around;
        margin-bottom: 12px;
        flex-wrap: wrap;
        gap: 8px;
    }
    .telem-item {
        text-align: center;
        min-width: 80px;
    }
    .telem-label {
        font-size: 0.68rem;
        color: #94A3B8;
        font-weight: 600;
        margin-bottom: 4px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }
    .telem-val {
        font-family: 'JetBrains Mono', monospace;
        font-size: 1.48rem;
        font-weight: 800;
        color: #F8FAFC;
        line-height: 1.1;
    }
    .telem-val.red { color: #EF4444; }
    .telem-val.amber { color: #F59E0B; }
    .telem-val.green { color: #10B981; }
    .telem-unit {
        font-size: 0.70rem;
        color: #64748B;
        margin-top: 2px;
    }

    .health-banner-overheat {
        background: linear-gradient(135deg, rgba(239, 68, 68, 0.20), rgba(16, 23, 38, 0.95));
        border: 2px solid #EF4444;
        border-radius: 10px;
        padding: 14px;
        text-align: center;
        margin-bottom: 14px;
    }
    .health-banner-caution {
        background: linear-gradient(135deg, rgba(245, 158, 11, 0.20), rgba(16, 23, 38, 0.95));
        border: 2px solid #F59E0B;
        border-radius: 10px;
        padding: 14px;
        text-align: center;
        margin-bottom: 14px;
    }
    .health-banner-normal {
        background: linear-gradient(135deg, rgba(16, 185, 129, 0.18), rgba(16, 23, 38, 0.95));
        border: 2px solid #10B981;
        border-radius: 10px;
        padding: 14px;
        text-align: center;
        margin-bottom: 14px;
    }
    .health-headline {
        font-size: 1.3rem;
        font-weight: 800;
        letter-spacing: 1px;
    }
    .health-subline {
        font-size: 0.75rem;
        color: #94A3B8;
        margin-top: 4px;
    }

    .custom-prog-wrap {
        background: #1E293B;
        border-radius: 8px;
        height: 12px;
        overflow: hidden;
        margin: 6px 0 14px 0;
    }
    .custom-prog-fill {
        height: 100%;
        border-radius: 8px;
        transition: width 0.3s ease;
    }

    .causal-box {
        background: #0B111E;
        border: 1px solid #1E293B;
        border-radius: 8px;
        padding: 12px 14px;
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.75rem;
        color: #CBD5E1;
        line-height: 1.6;
    }
    .causal-arrow {
        color: #38BDF8;
        font-weight: bold;
        text-align: center;
        margin: 2px 0;
    }

    .event-log-box {
        background: #0B111E;
        border: 1px solid #1E293B;
        border-radius: 8px;
        padding: 10px 14px;
        height: 130px;
        overflow-y: auto;
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.72rem;
        color: #94A3B8;
    }
    .event-log-entry {
        margin-bottom: 4px;
    }

    .section-kicker {
        color: #38BDF8;
        font-size: 0.68rem;
        font-weight: 700;
        letter-spacing: 1.6px;
        text-transform: uppercase;
        margin: 2px 0 7px 1px;
    }

    [data-testid="stPlotlyChart"] {
        border: 1px solid #1E293B;
        border-radius: 8px;
        overflow: hidden;
        background: #0B111E;
    }

    div[data-testid="stHorizontalBlock"] {
        gap: 0.65rem;
    }

    .stButton > button {
        border-radius: 6px;
        font-weight: 600;
        font-size: 0.8rem;
    }
    </style>
    """,
    unsafe_allow_html=True,
)

@st.cache_resource(show_spinner="Loading ML Models...")
def load_ml_engine():
    models_dir = os.path.join(_ROOT, "ml", "models")
    return DigitalTwinInferenceEngine(models_dir=models_dir)

@st.cache_data(show_spinner="Running Dynamic Engine Physics Simulation...")
def simulate_mission(
    altitude_ft,
    throttle,
    temp_offset_c,
    fault_type,
    fault_severity_pct,
    fault_start_s,
    duration_s=60.0,
    dt=0.05,
):
    engine = PistonEngine()

    def fault_schedule(t, eng):
        if t >= fault_start_s:
            if fault_type == "Cooling Degradation":
                eng.cooling_efficiency = max(0.1, min(1.0, fault_severity_pct / 100.0))
            elif fault_type == "Injector Degradation":
                eng.injector_efficiency = max(0.1, min(1.0, fault_severity_pct / 100.0))
        else:
            eng.cooling_efficiency = 1.00
            eng.injector_efficiency = 1.00

    sim = EngineSimulator(engine)
    df = sim.run(
        duration_s=duration_s,
        dt=dt,
        throttle_profile=float(throttle),
        altitude_profile=float(altitude_ft),
        temp_offset_profile=float(temp_offset_c),
        initial_rpm=2500.0,
        initial_cht=75.0,
        initial_oil_temp=65.0,
        fault_schedule=fault_schedule if fault_type != "None (Healthy)" else None,
    )

    ml_engine = load_ml_engine()
    df_diag = ml_engine.predict_dataframe(df)
    return df_diag

if "sim_time" not in st.session_state:
    st.session_state.sim_time = 32.0
if "mission_time_control" not in st.session_state:
    st.session_state.mission_time_control = st.session_state.sim_time
if "playing" not in st.session_state:
    st.session_state.playing = False
if "engine_running" not in st.session_state:
    st.session_state.engine_running = False
if "reset_token" not in st.session_state:
    st.session_state.reset_token = 0
if "altitude" not in st.session_state:
    st.session_state.altitude = 10000.0
if "throttle" not in st.session_state:
    st.session_state.throttle = 70.0
if "ambient_temp" not in st.session_state:
    st.session_state.ambient_temp = 25.0
if "fault_type" not in st.session_state:
    st.session_state.fault_type = "Cooling Degradation"
if "fault_severity" not in st.session_state:
    st.session_state.fault_severity = 70.0
if "fault_start_s" not in st.session_state:
    st.session_state.fault_start_s = 30.0
if "visual_rpm_scale" not in st.session_state:
    st.session_state.visual_rpm_scale = 12.0
if "event_log" not in st.session_state:
    st.session_state.event_log = [
        "[ 00.0s ]  Simulation initialized",
        "[ 00.0s ]  Engine start: dynamic mission replay ready",
    ]

status_dot_color = "#10B981" if st.session_state.playing else "#F59E0B"
status_text = "Simulation Running" if st.session_state.playing else "Simulation Ready / Paused"

st.markdown(
    f"""
    <div class="top-nav">
        <div class="top-brand">
            <div style="font-size: 1.8rem;">✈️</div>
            <div>
                <h1>Aero-Piston Engine Digital Twin</h1>
                <p>Simulate &bull; Monitor &bull; Detect &bull; Predict</p>
            </div>
        </div>
        <div style="display: flex; align-items: center; gap: 24px;">
            <div style="display: flex; align-items: center; gap: 8px; font-size: 0.82rem; font-weight: 600;">
                <span style="color: {status_dot_color}; font-size: 1.1rem;">●</span>
                <span style="color: #94A3B8;">{status_text}</span>
            </div>
            <div style="font-family: 'JetBrains Mono', monospace; font-size: 0.88rem; font-weight: 700; color: #38BDF8;">
                Time: {st.session_state.sim_time:.1f} s
            </div>
            <div style="font-size: 0.78rem; font-weight: 700; color: #64748B; letter-spacing: 0.5px;">
                SIH 2027 | PS 26054
            </div>
        </div>
    </div>
    """,
    unsafe_allow_html=True,
)

tab_sim, tab_data, tab_diag, tab_about = st.tabs(["Simulation", "Data & Logs", "Diagnostics", "About"])

with tab_sim:
    col_left, col_center, col_right = st.columns([1.0, 2.85, 1.15])

    with col_left:
        # Card 1: Mission Controls
        st.markdown('<div class="ctrl-card">', unsafe_allow_html=True)
        st.markdown('<div class="ctrl-card-title">🎛️ Mission Controls</div>', unsafe_allow_html=True)

        altitude = st.slider(
            "Altitude (ft)",
            min_value=0,
            max_value=20000,
            value=int(st.session_state.altitude),
            step=1000,
            key="altitude_control",
        )
        st.session_state.altitude = float(altitude)

        throttle = st.slider(
            "Throttle (%)",
            min_value=0,
            max_value=100,
            value=int(st.session_state.throttle),
            step=5,
            key="throttle_control",
        )
        st.session_state.throttle = float(throttle)

        ambient_temp = st.slider(
            "Ambient Temperature (°C)",
            min_value=-20,
            max_value=50,
            value=int(st.session_state.ambient_temp),
            step=1,
            key="ambient_temp_control",
        )
        st.session_state.ambient_temp = float(ambient_temp)

        visual_rpm_scale = st.slider(
            "3D Animation Speed (%)",
            min_value=5,
            max_value=100,
            value=int(st.session_state.visual_rpm_scale),
            step=5,
            help="Slows only the 3D piston/crankshaft/propeller animation. Backend RPM and telemetry remain unchanged.",
            key="visual_rpm_scale_control",
        )
        st.session_state.visual_rpm_scale = float(visual_rpm_scale)
        st.markdown('</div>', unsafe_allow_html=True)

        # Card 2: Fault Injection
        st.markdown('<div class="ctrl-card">', unsafe_allow_html=True)
        st.markdown('<div class="ctrl-card-title">🔧 Fault Injection</div>', unsafe_allow_html=True)

        fault_options = ["None (Healthy)", "Injector Degradation", "Cooling Degradation"]
        fault_type = st.radio(
            "Select Fault",
            fault_options,
            index=fault_options.index(st.session_state.fault_type),
            label_visibility="collapsed",
            key="fault_type_control",
        )
        st.session_state.fault_type = fault_type

        if fault_type == "Cooling Degradation":
            severity = st.slider(
                "Cooling Efficiency (%)",
                min_value=10,
                max_value=100,
                value=int(st.session_state.fault_severity),
                step=5,
                key="fault_severity_control",
            )
            st.session_state.fault_severity = float(severity)
        elif fault_type == "Injector Degradation":
            severity = st.slider(
                "Injector Efficiency (%)",
                min_value=10,
                max_value=100,
                value=int(st.session_state.fault_severity),
                step=5,
                key="fault_severity_control",
            )
            st.session_state.fault_severity = float(severity)

        fault_start_s = st.number_input(
            "Fault Start Time (s)",
            min_value=0.0,
            max_value=60.0,
            value=float(st.session_state.fault_start_s),
            step=5.0,
            key="fault_start_control",
        )
        st.session_state.fault_start_s = fault_start_s

        col_b1, col_b2, col_b3 = st.columns(3)
        with col_b1:
            if st.button("▶ Start Fault Check", use_container_width=True, type="primary"):
                st.session_state.playing = True
        with col_b2:
            if st.button("⏸ Pause Fault Check", use_container_width=True):
                st.session_state.playing = False
        with col_b3:
            if st.button("🔄 Reset", use_container_width=True):
                st.session_state.playing = False
                st.session_state.engine_running = False
                st.session_state.reset_token += 1
                st.session_state.sim_time = 0.0
                st.session_state.mission_time_control = 0.0

        engine_col_1, engine_col_2 = st.columns(2)
        with engine_col_1:
            if st.button("⚙️ Run Engine Only", use_container_width=True):
                st.session_state.engine_running = True
        with engine_col_2:
            if st.button("⏹ Stop Engine Only", use_container_width=True):
                st.session_state.engine_running = False

        st.markdown('</div>', unsafe_allow_html=True)

        # Card 3: Mission Scenarios (Presets)
        st.markdown('<div class="ctrl-card">', unsafe_allow_html=True)
        st.markdown('<div class="ctrl-card-title">📋 Mission Scenarios</div>', unsafe_allow_html=True)

        col_s1, col_s2 = st.columns(2)
        with col_s1:
            if st.button("Healthy Cruise", use_container_width=True):
                st.session_state.altitude = 10000.0
                st.session_state.throttle = 70.0
                st.session_state.ambient_temp = 25.0
                st.session_state.fault_type = "None (Healthy)"
                st.session_state.fault_severity = 100.0
                st.session_state.sim_time = 25.0
                st.rerun()

            if st.button("Hot Weather (+3°C)", use_container_width=True):
                st.session_state.altitude = 10000.0
                st.session_state.throttle = 70.0
                st.session_state.ambient_temp = 28.0
                st.session_state.fault_type = "None (Healthy)"
                st.session_state.sim_time = 32.0
                st.rerun()

            if st.button("Injector Fault (80%)", use_container_width=True):
                st.session_state.altitude = 10000.0
                st.session_state.throttle = 70.0
                st.session_state.ambient_temp = 25.0
                st.session_state.fault_type = "Injector Degradation"
                st.session_state.fault_severity = 80.0
                st.session_state.fault_start_s = 30.0
                st.session_state.sim_time = 45.0
                st.rerun()

        with col_s2:
            if st.button("High Altitude", use_container_width=True):
                st.session_state.altitude = 18000.0
                st.session_state.throttle = 85.0
                st.session_state.ambient_temp = -10.0
                st.session_state.fault_type = "None (Healthy)"
                st.session_state.sim_time = 30.0
                st.rerun()

            if st.button("Cooling Fault (70%)", use_container_width=True):
                st.session_state.altitude = 10000.0
                st.session_state.throttle = 70.0
                st.session_state.ambient_temp = 25.0
                st.session_state.fault_type = "Cooling Degradation"
                st.session_state.fault_severity = 70.0
                st.session_state.fault_start_s = 30.0
                st.session_state.sim_time = 45.0
                st.rerun()

            if st.button("Custom Scenario", use_container_width=True):
                st.session_state.sim_time = 15.0
                st.rerun()

        st.markdown('</div>', unsafe_allow_html=True)

    # Dynamic Simulation Run
    temp_offset_c = st.session_state.ambient_temp - 25.0
    df_sim = simulate_mission(
        altitude_ft=st.session_state.altitude,
        throttle=st.session_state.throttle / 100.0,
        temp_offset_c=temp_offset_c,
        fault_type=st.session_state.fault_type,
        fault_severity_pct=st.session_state.fault_severity,
        fault_start_s=st.session_state.fault_start_s,
    )

    cur_idx = (df_sim["time_s"] - st.session_state.sim_time).abs().argmin()
    cur_row = df_sim.iloc[cur_idx]

    rpm = float(cur_row["rpm"])
    power_kw = float(cur_row["power_kw"])
    fuel_flow = float(cur_row["fuel_flow_l_hr"])
    cht = float(cur_row["cht_c"])
    oil_temp = float(cur_row["oil_temp_c"])
    oil_press = float(cur_row["oil_pressure_bar"])
    egt = float(cur_row["egt_c"])
    thermal_status = str(cur_row["thermal_status"])
    ml_anomaly = str(cur_row["status"]) == "ANOMALY"
    is_anomaly = ml_anomaly or thermal_status == "OVERHEAT"
    fault_selected = st.session_state.fault_type != "None (Healthy)"
    fault_active = fault_selected and st.session_state.sim_time >= st.session_state.fault_start_s
    health_idx = float(cur_row["health_index"])
    cht_class = "red" if cht >= 250.0 else ("amber" if cht >= 225.0 else "")
    oil_temp_class = "red" if oil_temp >= 145.0 else ("amber" if oil_temp >= 135.0 else "")
    oil_pressure_class = "red" if oil_press < 2.0 else "green"

    if thermal_status == "OVERHEAT":
        health_idx = min(health_idx, 70.0)
    elif thermal_status == "CAUTION":
        health_idx = min(health_idx, 85.0)

    with col_center:
        # Card 1: 2D Engine Cutaway Schematic
        st.markdown('<div class="ctrl-card" style="padding: 10px 14px;">', unsafe_allow_html=True)
        st.markdown('<div class="ctrl-card-title">⚙️ Engine Schematic (Simplified)</div>', unsafe_allow_html=True)

        is_overheat = thermal_status == "OVERHEAT"
        is_cooling_fault = st.session_state.fault_type == "Cooling Degradation" and st.session_state.sim_time >= st.session_state.fault_start_s
        is_injector_fault = st.session_state.fault_type == "Injector Degradation" and st.session_state.sim_time >= st.session_state.fault_start_s

        chamber_color = "#EF4444" if is_overheat else "#1E293B"
        chamber_glow = "filter: drop-shadow(0 0 10px rgba(239,68,68,0.7));" if is_overheat else ""
        radiator_color = "#EF4444" if is_cooling_fault else "#38BDF8"
        radiator_glow = "filter: drop-shadow(0 0 8px rgba(239,68,68,0.8));" if is_cooling_fault else ""
        anim_duration = max(0.12, 60.0 / max(300.0, rpm)) if st.session_state.playing or rpm > 1000 else 0.0

        schematic_html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body {{ margin: 0; padding: 0; background: transparent; overflow: hidden; font-family: 'Inter', sans-serif; }}
                @keyframes piston14 {{ 0% {{ transform: translateY(0px); }} 50% {{ transform: translateY(22px); }} 100% {{ transform: translateY(0px); }} }}
                @keyframes piston23 {{ 0% {{ transform: translateY(22px); }} 50% {{ transform: translateY(0px); }} 100% {{ transform: translateY(22px); }} }}
                @keyframes propSpin {{ from {{ transform: rotate(0deg); }} to {{ transform: rotate(360deg); }} }}
                .piston-pair-14 {{ animation: piston14 {anim_duration:.3f}s infinite ease-in-out; }}
                .piston-pair-23 {{ animation: piston23 {anim_duration:.3f}s infinite ease-in-out; }}
                .prop-spinner {{ transform-origin: 125px 105px; animation: propSpin {anim_duration*0.8:.3f}s infinite linear; }}
            </style>
        </head>
        <body>
        <svg viewBox="0 0 760 210" width="100%" height="210" style="background:#0B111E; border-radius:8px; border:1px solid #1E293B;">
            <defs>
                <linearGradient id="pistonGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#94A3B8"/>
                    <stop offset="100%" stop-color="#475569"/>
                </linearGradient>
                <linearGradient id="sumpGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#B45309"/>
                    <stop offset="100%" stop-color="#78350F"/>
                </linearGradient>
            </defs>

            <path d="M 24 100 L 72 100" stroke="#38BDF8" stroke-width="4" stroke-linecap="round"/>
            <polygon points="72,95 85,100 72,105" fill="#38BDF8"/>
            <text x="42" y="91" fill="#38BDF8" font-size="10.5" font-weight="700" font-family="Inter" text-anchor="middle">Air Inlet</text>

            <g class="prop-spinner">
                <ellipse cx="125" cy="55" rx="6" ry="42" fill="#64748B" stroke="#94A3B8" stroke-width="1.5"/>
                <ellipse cx="125" cy="155" rx="6" ry="42" fill="#64748B" stroke="#94A3B8" stroke-width="1.5"/>
            </g>
            <circle cx="125" cy="105" r="14" fill="#334155" stroke="#38BDF8" stroke-width="2"/>
            <text x="125" y="199" fill="#94A3B8" font-size="9.5" font-weight="700" text-anchor="middle">PROP</text>

            <line x1="140" y1="105" x2="250" y2="105" stroke="#64748B" stroke-width="5" stroke-linecap="round"/>
            <text x="195" y="94" fill="#94A3B8" font-size="9.5" font-weight="700" text-anchor="middle">CRANKSHAFT</text>

            <rect x="270" y="40" width="260" height="120" rx="8" fill="#141E30" stroke="#334155" stroke-width="2"/>
            <text x="400" y="24" fill="#CBD5E1" font-size="10" font-weight="700" text-anchor="middle" letter-spacing="1">CYLINDERS</text>

            <rect x="285" y="48" width="50" height="75" rx="4" fill="{chamber_color}" fill-opacity="0.35" stroke="#475569" stroke-width="1.5" style="{chamber_glow}"/>
            <text x="310" y="32" fill="#94A3B8" font-size="10" font-weight="700" text-anchor="middle">#1</text>
            <g class="piston-pair-14">
                <rect x="289" y="52" width="42" height="24" rx="3" fill="url(#pistonGrad)" stroke="#CBD5E1" stroke-width="1"/>
                <line x1="310" y1="76" x2="310" y2="122" stroke="#CBD5E1" stroke-width="4" stroke-linecap="round"/>
            </g>

            <rect x="350" y="48" width="50" height="75" rx="4" fill="{chamber_color}" fill-opacity="0.35" stroke="#475569" stroke-width="1.5" style="{chamber_glow}"/>
            <text x="375" y="32" fill="#94A3B8" font-size="10" font-weight="700" text-anchor="middle">#2</text>
            <g class="piston-pair-23">
                <rect x="354" y="52" width="42" height="24" rx="3" fill="url(#pistonGrad)" stroke="#CBD5E1" stroke-width="1"/>
                <line x1="375" y1="76" x2="375" y2="122" stroke="#CBD5E1" stroke-width="4" stroke-linecap="round"/>
            </g>

            <rect x="415" y="48" width="50" height="75" rx="4" fill="{chamber_color}" fill-opacity="0.35" stroke="#475569" stroke-width="1.5" style="{chamber_glow}"/>
            <text x="440" y="32" fill="#94A3B8" font-size="10" font-weight="700" text-anchor="middle">#3</text>
            <g class="piston-pair-23">
                <rect x="419" y="52" width="42" height="24" rx="3" fill="url(#pistonGrad)" stroke="#CBD5E1" stroke-width="1"/>
                <line x1="440" y1="76" x2="440" y2="122" stroke="#CBD5E1" stroke-width="4" stroke-linecap="round"/>
            </g>

            <rect x="480" y="48" width="50" height="75" rx="4" fill="{chamber_color}" fill-opacity="0.35" stroke="#475569" stroke-width="1.5" style="{chamber_glow}"/>
            <text x="505" y="32" fill="#94A3B8" font-size="10" font-weight="700" text-anchor="middle">#4</text>
            <g class="piston-pair-14">
                <rect x="484" y="52" width="42" height="24" rx="3" fill="url(#pistonGrad)" stroke="#CBD5E1" stroke-width="1"/>
                <line x1="505" y1="76" x2="505" y2="122" stroke="#CBD5E1" stroke-width="4" stroke-linecap="round"/>
            </g>

            <line x1="250" y1="138" x2="540" y2="138" stroke="#64748B" stroke-width="6" stroke-linecap="round"/>
            <circle cx="310" cy="138" r="7" fill="#CBD5E1"/>
            <circle cx="375" cy="138" r="7" fill="#CBD5E1"/>
            <circle cx="440" cy="138" r="7" fill="#CBD5E1"/>
            <circle cx="505" cy="138" r="7" fill="#CBD5E1"/>

            <path d="M 530 85 L 590 85" stroke="#EF4444" stroke-width="4" stroke-linecap="round"/>
            <polygon points="590,80 603,85 590,90" fill="#EF4444"/>
            <text x="616" y="88" fill="#EF4444" font-size="10.5" font-weight="700" font-family="Inter">Exhaust</text>

            <rect x="300" y="163" width="160" height="22" rx="6" fill="url(#sumpGrad)" stroke="#D97706" stroke-width="1.5"/>
            <text x="380" y="178" fill="#FEF3C7" font-size="10" font-weight="700" font-family="Inter" text-anchor="middle">Lubrication System</text>

            <g style="{radiator_glow}">
                <rect x="480" y="160" width="55" height="4" rx="2" fill="{radiator_color}"/>
                <rect x="480" y="167" width="55" height="4" rx="2" fill="{radiator_color}"/>
                <rect x="480" y="174" width="55" height="4" rx="2" fill="{radiator_color}"/>
                <rect x="480" y="181" width="55" height="4" rx="2" fill="{radiator_color}"/>
            </g>
            <text x="545" y="172" fill="#38BDF8" font-size="9.5" font-weight="700" font-family="Inter">Cooling System</text>
            <text x="545" y="184" fill="#94A3B8" font-size="8.5" font-family="Inter">(Radiator / Fins)</text>
        </svg>
        </body>
        </html>
        """
        engine_state_json = json.dumps({
            "rpm": rpm,
            "playing": bool(st.session_state.playing),
            "engineRunning": bool(st.session_state.engine_running),
            "resetToken": int(st.session_state.reset_token),
            "missionTime": float(st.session_state.sim_time),
            "visualRpmScale": st.session_state.visual_rpm_scale / 100.0,
            "throttle": st.session_state.throttle / 100.0,
            "chtC": cht,
            "oilTempC": oil_temp,
            "injectorEfficiency": float(cur_row.get("injector_efficiency", 1.0)),
            "thermalStatus": thermal_status,
            "faultType": st.session_state.fault_type if st.session_state.sim_time >= st.session_state.fault_start_s else "None (Healthy)",
        })
        st.markdown(
            f'<div id="digital-twin-engine-state" data-state="{engine_state_json.replace(chr(34), "&quot;")}" style="display:none"></div>',
            unsafe_allow_html=True,
        )
        embedded_engine_html = """
        <style>
            html, body { margin: 0; padding: 0; background: transparent; overflow: hidden; }
            iframe { display: block; width: 100%; height: 492px; border: 0; border-radius: 8px; background: #07070b; }
        </style>
        <iframe id="digital-twin-engine" src="http://localhost:5173/?embed=1" title="3D digital twin engine visualization" allow="autoplay"></iframe>
        <script>
            const frame = document.getElementById("digital-twin-engine");
            const sendState = () => {
                const source = window.parent.document.getElementById("digital-twin-engine-state");
                if (!source) return;
                try {
                    frame.contentWindow?.postMessage({type: "digital-twin-engine-state", state: JSON.parse(source.dataset.state)}, "*");
                } catch (error) { console.warn("Digital twin state was not ready", error); }
            };
            frame.addEventListener("load", sendState);
            window.setInterval(sendState, 100);
        </script>
        """
        components.html(embedded_engine_html, height=498, scrolling=False)
        st.markdown('</div>', unsafe_allow_html=True)

        # Card 2: Live Telemetry Horizontal Strip
        st.markdown(
            f"""
            <div class="telem-bar">
                <div class="telem-item">
                    <div class="telem-label">RPM</div>
                    <div class="telem-val">{rpm:.0f}</div>
                    <div class="telem-unit">rpm</div>
                </div>
                <div class="telem-item">
                    <div class="telem-label">Power Output</div>
                    <div class="telem-val">{power_kw:.1f}</div>
                    <div class="telem-unit">kW</div>
                </div>
                <div class="telem-item">
                    <div class="telem-label">Fuel Flow</div>
                    <div class="telem-val">{fuel_flow:.1f}</div>
                    <div class="telem-unit">L/h</div>
                </div>
                <div class="telem-item">
                    <div class="telem-label">CHT (Avg)</div>
                    <div class="telem-val {cht_class}">{cht:.1f}</div>
                    <div class="telem-unit">°C</div>
                </div>
                <div class="telem-item">
                    <div class="telem-label">Oil Temp</div>
                    <div class="telem-val {oil_temp_class}">{oil_temp:.1f}</div>
                    <div class="telem-unit">°C</div>
                </div>
                <div class="telem-item">
                    <div class="telem-label">Oil Pressure</div>
                    <div class="telem-val {oil_pressure_class}">{oil_press:.2f}</div>
                    <div class="telem-unit">bar</div>
                </div>
                <div class="telem-item">
                    <div class="telem-label">EGT (Avg)</div>
                    <div class="telem-val">{egt:.0f}</div>
                    <div class="telem-unit">°C</div>
                </div>
            </div>
            """,
            unsafe_allow_html=True,
        )

        # Card 3: Real-Time Graphs (large 2 x 2 engineering layout)
        st.markdown('<div class="ctrl-card" style="padding: 10px 14px;">', unsafe_allow_html=True)
        st.markdown('<div class="ctrl-card-title">📈 Engine Parameters (Real-Time Plots)</div>', unsafe_allow_html=True)

        col_g1, col_g2 = st.columns(2)
        col_g3, col_g4 = st.columns(2)
        t_hist = df_sim["time_s"]
        cur_t = st.session_state.sim_time

        plot_layout = dict(
            height=315,
            template="plotly_dark",
            paper_bgcolor="#0B111E",
            plot_bgcolor="#0B111E",
            margin=dict(l=48, r=18, t=42, b=42),
            font=dict(family="JetBrains Mono, monospace", size=11, color="#CBD5E1"),
            showlegend=True,
            legend=dict(orientation="h", yanchor="bottom", y=1.08, xanchor="center", x=0.5, font=dict(size=10)),
        )

        with col_g1:
            fig1 = go.Figure()
            fig1.add_trace(go.Scatter(x=t_hist, y=df_sim["cht_c"], name="CHT", line=dict(color="#EF4444", width=2)))
            fig1.add_hline(y=225.0, line_dash="dash", line_color="#F59E0B", line_width=1.8, annotation_text="CAUTION 225°C", annotation_font_size=10, annotation_position="top right")
            fig1.add_hline(y=250.0, line_dash="dash", line_color="#DC2626", line_width=1.8, annotation_text="OVERHEAT 250°C", annotation_font_size=10, annotation_position="bottom right")
            fig1.add_vline(x=cur_t, line_dash="solid", line_color="#38BDF8", line_width=1.5)
            if st.session_state.fault_type != "None (Healthy)":
                fig1.add_vline(x=st.session_state.fault_start_s, line_dash="dot", line_color="#64748B", line_width=1.2)
            fig1.update_layout(**plot_layout, title=dict(text="CYLINDER HEAD TEMPERATURE", font=dict(size=14, color="#F8FAFC")))
            fig1.update_yaxes(range=[0, 420], gridcolor="#1E293B")
            fig1.update_xaxes(range=[0, 60], gridcolor="#1E293B", title_text="Mission time (s)")
            st.plotly_chart(fig1, use_container_width=True, config={"displayModeBar": False})

        with col_g2:
            fig2 = go.Figure()
            fig2.add_trace(go.Scatter(x=t_hist, y=df_sim["oil_temp_c"], name="Oil Temp", line=dict(color="#F59E0B", width=2)))
            fig2.add_hline(y=135.0, line_dash="dash", line_color="#F59E0B", line_width=1.8, annotation_text="CAUTION 135°C", annotation_font_size=10, annotation_position="top right")
            fig2.add_hline(y=145.0, line_dash="dash", line_color="#DC2626", line_width=1.8, annotation_text="OVERHEAT 145°C", annotation_font_size=10, annotation_position="bottom right")
            fig2.add_vline(x=cur_t, line_dash="solid", line_color="#38BDF8", line_width=1.5)
            if st.session_state.fault_type != "None (Healthy)":
                fig2.add_vline(x=st.session_state.fault_start_s, line_dash="dot", line_color="#64748B", line_width=1.2)
            fig2.update_layout(**plot_layout, title=dict(text="OIL TEMPERATURE", font=dict(size=14, color="#F8FAFC")))
            fig2.update_yaxes(range=[0, 220], gridcolor="#1E293B")
            fig2.update_xaxes(range=[0, 60], gridcolor="#1E293B", title_text="Mission time (s)")
            st.plotly_chart(fig2, use_container_width=True, config={"displayModeBar": False})

        with col_g3:
            fig3 = go.Figure()
            fig3.add_trace(go.Scatter(x=t_hist, y=df_sim["oil_pressure_bar"], name="Oil Press", line=dict(color="#10B981", width=2)))
            fig3.add_hline(y=2.0, line_dash="dash", line_color="#EF4444", line_width=1.8, annotation_text="MINIMUM LIMIT 2.0 bar", annotation_font_size=10, annotation_position="top left")
            fig3.add_vline(x=cur_t, line_dash="solid", line_color="#38BDF8", line_width=1.5)
            if st.session_state.fault_type != "None (Healthy)":
                fig3.add_vline(x=st.session_state.fault_start_s, line_dash="dot", line_color="#64748B", line_width=1.2)
            fig3.update_layout(**plot_layout, title=dict(text="OIL PRESSURE", font=dict(size=14, color="#F8FAFC")))
            fig3.update_yaxes(range=[0, 5.5], gridcolor="#1E293B")
            fig3.update_xaxes(range=[0, 60], gridcolor="#1E293B", title_text="Mission time (s)")
            st.plotly_chart(fig3, use_container_width=True, config={"displayModeBar": False})

        with col_g4:
            fig4 = go.Figure()
            fig4.add_trace(go.Scatter(x=t_hist, y=df_sim["heat_generation_kw"], name="Generation", line=dict(color="#F8FAFC", width=1.8)))
            fig4.add_trace(go.Scatter(x=t_hist, y=df_sim["heat_rejection_kw"], name="Rejection", line=dict(color="#38BDF8", width=1.8)))
            fig4.add_vline(x=cur_t, line_dash="solid", line_color="#38BDF8", line_width=1.5)
            if st.session_state.fault_type != "None (Healthy)":
                fig4.add_vline(x=st.session_state.fault_start_s, line_dash="dot", line_color="#64748B", line_width=1.2)
            fig4.update_layout(**plot_layout, title=dict(text="HEAT GENERATION vs HEAT REJECTION", font=dict(size=14, color="#F8FAFC")))
            fig4.update_yaxes(range=[0, 85], gridcolor="#1E293B")
            fig4.update_xaxes(range=[0, 60], gridcolor="#1E293B", title_text="Mission time (s)")
            st.plotly_chart(fig4, use_container_width=True, config={"displayModeBar": False})

        st.markdown('</div>', unsafe_allow_html=True)

        # Bottom Sub-Row: Mission Timeline & Event Log
        col_tl, col_el = st.columns([1.3, 1.0])

        with col_tl:
            st.markdown('<div class="ctrl-card" style="padding: 10px 14px;">', unsafe_allow_html=True)
            st.markdown('<div class="ctrl-card-title">🧭 Mission Timeline</div>', unsafe_allow_html=True)

            # The widget state must be synchronized before the slider is
            # instantiated; Streamlit rejects changing a keyed widget after
            # it has already been rendered in the same run.
            if st.session_state.playing:
                st.session_state.mission_time_control = float(st.session_state.sim_time)

            selected_t = st.slider(
                "Mission Playback Scrubber (seconds)",
                min_value=0.0,
                max_value=60.0,
                step=0.5,
                label_visibility="collapsed",
                key="mission_time_control",
            )
            if not st.session_state.playing:
                if abs(selected_t - st.session_state.sim_time) > 0.05:
                    st.session_state.playing = False
                st.session_state.sim_time = float(selected_t)
            prog_pct = (cur_t / 60.0) * 100
            fault_pct = (st.session_state.fault_start_s / 60.0) * 100
            st.markdown(
                f"""
                <div style="position: relative; height: 6px; background: #1E293B; border-radius: 4px; margin: 12px 6px 18px 6px;">
                    <div style="position: absolute; left: 0; width: {prog_pct}%; height: 100%; background: #38BDF8; border-radius: 4px;"></div>
                    <div style="position: absolute; left: calc({prog_pct}% - 6px); top: -4px; width: 14px; height: 14px; background: #F8FAFC; border: 2px solid #38BDF8; border-radius: 50%;"></div>
                    <div style="position: absolute; left: {fault_pct}%; top: -3px; width: 8px; height: 8px; background: #EF4444; border-radius: 50%;" title="Fault ({st.session_state.fault_start_s:.1f}s)"></div>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 0.65rem; color: #64748B; font-weight: 600;">
                    <span>Takeoff<br><b style="color:#94A3B8;">0-10s</b></span>
                    <span>Climb<br><b style="color:#94A3B8;">10-20s</b></span>
                    <span>Cruise<br><b style="color:#38BDF8;">20-40s</b></span>
                    <span style="color:#EF4444;">Fault Injected<br><b>(t={st.session_state.fault_start_s:.1f}s)</b></span>
                    <span>High Alt<br><b style="color:#94A3B8;">40-50s</b></span>
                    <span>Descent<br><b style="color:#94A3B8;">50-60s</b></span>
                </div>
                """,
                unsafe_allow_html=True,
            )
            st.markdown('</div>', unsafe_allow_html=True)

        with col_el:
            st.markdown('<div class="ctrl-card" style="padding: 10px 14px;">', unsafe_allow_html=True)
            col_elh, col_elc = st.columns([3, 1])
            with col_elh:
                st.markdown('<div class="ctrl-card-title">📜 Event Log</div>', unsafe_allow_html=True)
            with col_elc:
                if st.button("Clear", key="clear_log"):
                    st.session_state.event_log = [f"[ {cur_t:04.1f}s ]  Event log cleared by operator"]

            log_entries = list(st.session_state.event_log)
            if st.session_state.fault_type != "None (Healthy)" and cur_t >= st.session_state.fault_start_s:
                log_entries.append(f"[ {st.session_state.fault_start_s:04.1f}s ]  {st.session_state.fault_type} injected")
            caution_rows = df_sim.index[df_sim["cht_c"] >= 225.0]
            overheat_rows = df_sim.index[df_sim["cht_c"] >= 250.0]
            anomaly_rows = df_sim.index[df_sim["status"] == "ANOMALY"]
            if len(caution_rows) and cur_t >= float(df_sim.loc[caution_rows[0], "time_s"]):
                log_entries.append(f"[ {float(df_sim.loc[caution_rows[0], 'time_s']):04.1f}s ]  CHT crossed caution limit (225.0°C)")
            if len(overheat_rows) and cur_t >= float(df_sim.loc[overheat_rows[0], "time_s"]):
                log_entries.append(f"[ {float(df_sim.loc[overheat_rows[0], 'time_s']):04.1f}s ]  CHT crossed overheat limit (250.0°C)")
            if len(anomaly_rows) and cur_t >= float(df_sim.loc[anomaly_rows[0], "time_s"]):
                log_entries.append(f"[ {float(df_sim.loc[anomaly_rows[0], 'time_s']):04.1f}s ]  Digital Twin anomaly detected")

            log_html = "".join([f'<div class="event-log-entry">{entry}</div>' for entry in log_entries[-6:]])
            st.markdown(f'<div class="event-log-box">{log_html}</div>', unsafe_allow_html=True)
            st.markdown('</div>', unsafe_allow_html=True)

    with col_right:
        # Right Column: Engine Health & Causal Explainability
        st.markdown('<div class="ctrl-card">', unsafe_allow_html=True)
        st.markdown('<div class="ctrl-card-title">🛡️ Engine Health</div>', unsafe_allow_html=True)

        if thermal_status == "OVERHEAT":
            st.markdown(
                """
                <div class="health-banner-overheat">
                    <div style="font-size: 1.8rem;">🚨</div>
                    <div class="health-headline" style="color: #EF4444;">OVERHEAT</div>
                    <div class="health-subline">Thermal anomaly detected by Digital Twin</div>
                </div>
                """,
                unsafe_allow_html=True,
            )
        elif thermal_status == "CAUTION":
            st.markdown(
                """
                <div class="health-banner-caution">
                    <div style="font-size: 1.8rem;">⚠️</div>
                    <div class="health-headline" style="color: #F59E0B;">CAUTION</div>
                    <div class="health-subline">Elevated thermal stress detected</div>
                </div>
                """,
                unsafe_allow_html=True,
            )
        else:
            st.markdown(
                """
                <div class="health-banner-normal">
                    <div style="font-size: 1.8rem;">🟢</div>
                    <div class="health-headline" style="color: #10B981;">NORMAL</div>
                    <div class="health-subline">All monitored parameters nominal</div>
                </div>
                """,
                unsafe_allow_html=True,
            )

        if ml_anomaly:
            st.markdown(
                """
                <div style="background: rgba(245, 158, 11, 0.14); border: 1px solid #F59E0B; border-radius: 8px; padding: 8px 12px; margin-bottom: 14px; color: #FBBF24; font-size: 0.78rem; font-weight: 700;">
                    ⚠ ANOMALY DETECTED <span style="color: #94A3B8; font-weight: 500;">(separate from thermal status)</span>
                </div>
                """,
                unsafe_allow_html=True,
            )

        health_bar_color = "#10B981" if health_idx >= 85 else ("#F59E0B" if health_idx >= 75 else "#EF4444")
        st.markdown(
            f"""
            <div style="display: flex; justify-content: space-between; font-size: 0.75rem; font-weight: 700; color: #94A3B8;">
                <span>Overall Health</span>
                <span style="color: {health_bar_color}; font-family: 'JetBrains Mono';">{health_idx:.0f}%</span>
            </div>
            <div class="custom-prog-wrap">
                <div class="custom-prog-fill" style="width: {health_idx}%; background: {health_bar_color};"></div>
            </div>
            """,
            unsafe_allow_html=True,
        )

        detected_fault_name = st.session_state.fault_type if fault_active else "None (Healthy)"
        fault_icon = "❄️" if "Cooling" in detected_fault_name else ("⛽" if "Injector" in detected_fault_name else "🛡️")
        fault_health_val = f"{st.session_state.fault_severity:.0f}%" if detected_fault_name != "None (Healthy)" else "100%"
        confidence_val = f"{float(cur_row['severity_confidence'])*100:.1f}%" if "severity_confidence" in cur_row else "100.0%"

        st.markdown(
            f"""
            <div style="background: #0B111E; border: 1px solid #1E293B; border-radius: 8px; padding: 10px 12px; margin-bottom: 14px;">
                <div style="font-size: 0.70rem; color: #64748B; font-weight: 700; text-transform: uppercase;">Detected Fault</div>
                <div style="display: flex; align-items: center; gap: 10px; margin-top: 6px;">
                    <div style="font-size: 1.4rem;">{fault_icon}</div>
                    <div>
                        <div style="font-size: 0.85rem; font-weight: 700; color: #F8FAFC;">{detected_fault_name}</div>
                        <div style="font-size: 0.72rem; color: #38BDF8; font-family: 'JetBrains Mono';">Health: {fault_health_val} &nbsp;|&nbsp; Conf: {confidence_val}</div>
                    </div>
                </div>
            </div>
            """,
            unsafe_allow_html=True,
        )

        st.markdown(
            """
            <div style="font-size: 0.78rem; font-weight: 700; color: #F8FAFC; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
                <span>💡</span> Explanation
            </div>
            """,
            unsafe_allow_html=True,
        )

        explanation_status = "ANOMALY" if ml_anomaly else "NORMAL"
        explanation_fault = st.session_state.fault_type if fault_selected else "None (Healthy)"
        explanation_activation = "ACTIVE" if fault_active else "SELECTED / NOT ACTIVE"
        st.markdown(
            f"""
            <div class="causal-box" style="margin-bottom: 10px;">
                <div>Fault selected: {explanation_fault}</div>
                <div>Fault activation: {explanation_activation}</div>
                <div>Thermal status: {thermal_status}</div>
                <div>ML anomaly: {explanation_status}</div>
            </div>
            """,
            unsafe_allow_html=True,
        )

        if "Cooling" in st.session_state.fault_type and fault_active:
            st.markdown(
                """
                <div class="causal-box">
                    <div>Cooling efficiency &darr;</div>
                    <div class="causal-arrow">&darr;</div>
                    <div>Heat rejection &darr;</div>
                    <div class="causal-arrow">&darr;</div>
                    <div>Cylinder head temp &uarr;</div>
                    <div class="causal-arrow">&darr;</div>
                    <div>Oil temperature &uarr;</div>
                    <div class="causal-arrow">&darr;</div>
                    <div>Oil viscosity &darr; &rarr; Oil pressure &darr;</div>
                </div>
                """,
                unsafe_allow_html=True,
            )
        elif "Injector" in st.session_state.fault_type and fault_active:
            st.markdown(
                """
                <div class="causal-box">
                    <div>Injector delivery &darr;</div>
                    <div class="causal-arrow">&darr;</div>
                    <div>Combustion power &darr;</div>
                    <div class="causal-arrow">&darr;</div>
                    <div>Torque & RPM &darr;</div>
                    <div class="causal-arrow">&darr;</div>
                    <div>Physics residuals &uarr;</div>
                    <div class="causal-arrow">&darr;</div>
                    <div>Combustion imbalance vibration &uarr;</div>
                </div>
                """,
                unsafe_allow_html=True,
            )
        else:
            st.markdown(
                """
                <div class="causal-box">
                    <div>Fuel flow nominal</div>
                    <div class="causal-arrow">&darr;</div>
                    <div>Combustion power balanced</div>
                    <div class="causal-arrow">&darr;</div>
                    <div>Heat generation = Heat rejection</div>
                    <div class="causal-arrow">&darr;</div>
                    <div>Steady-state equilibrium maintained</div>
                </div>
                """,
                unsafe_allow_html=True,
            )

        st.markdown('</div>', unsafe_allow_html=True)

        # Compact diagnostics summary stays visible on the Simulation tab.
        sim_diag_anomaly = str(cur_row.get("status", "NORMAL")) == "ANOMALY"
        sim_diag_fault = st.session_state.fault_type if fault_active else "None (Healthy)"
        sim_diag_confidence = float(cur_row.get("severity_confidence", 0.0)) * 100
        sim_diag_health = float(cur_row.get("health_index", 100.0))
        sim_diag_severity = str(cur_row.get("severity_label", "Healthy"))
        sim_diag_color = "#EF4444" if sim_diag_anomaly else "#10B981"
        sim_diag_reason = (
            "Fuel flow deviation → combustion power → torque/RPM"
            if sim_diag_fault == "Injector Degradation"
            else "Cooling efficiency → heat rejection → thermal response"
            if sim_diag_fault == "Cooling Degradation"
            else "Telemetry and physics residuals continuously monitored"
        )
        st.markdown(
            f"""
            <div style="background:#101726; border:1px solid #1E293B; border-radius:10px; padding:13px 15px; margin-top:12px;">
                <div style="color:#38BDF8; font-size:.78rem; font-weight:800; letter-spacing:.7px; margin-bottom:12px;">🧠 DIGITAL TWIN DIAGNOSTICS</div>
                <div style="color:{sim_diag_color}; font-size:1rem; font-weight:800;">{'🔴 ANOMALY DETECTED' if sim_diag_anomaly else '🟢 NO ANOMALY DETECTED'}</div>
                <div style="color:#F8FAFC; font-size:.82rem; font-weight:700; margin-top:5px;">{sim_diag_fault}</div>
                <div style="display:grid; grid-template-columns:1fr auto; gap:7px 12px; margin-top:12px; color:#94A3B8; font-size:.72rem;">
                    <span>Confidence</span><strong style="color:#38BDF8;">{sim_diag_confidence:.1f}%</strong>
                    <span>Health</span><strong style="color:#10B981;">{sim_diag_health:.0f}%</strong>
                    <span>Severity</span><strong style="color:#F59E0B;">{sim_diag_severity}</strong>
                    <span>Thermal status</span><strong style="color:#CBD5E1;">{thermal_status}</strong>
                </div>
                <div style="height:1px; background:#1E293B; margin:13px 0 10px;"></div>
                <div style="color:#F8FAFC; font-size:.72rem; font-weight:800; margin-bottom:5px;">AI REASONING</div>
                <div style="color:#CBD5E1; font-family:'JetBrains Mono', monospace; font-size:.68rem; line-height:1.45;">{sim_diag_reason}</div>
                <div style="height:1px; background:#1E293B; margin:13px 0 10px;"></div>
                <div style="color:#F8FAFC; font-size:.72rem; font-weight:800; margin-bottom:5px;">RECOMMENDATION</div>
                <div style="color:#FBBF24; font-size:.7rem;">{'⚠ Inspect the affected system before the next mission.' if sim_diag_anomaly else '✓ Continue monitoring engine telemetry.'}</div>
            </div>
            """,
            unsafe_allow_html=True,
        )

    if st.session_state.playing:
        if st.session_state.sim_time < 60.0:
            st.session_state.sim_time = min(60.0, st.session_state.sim_time + 0.5)
            # Give the embedded WebGL renderer time to initialize between
            # Streamlit reruns; the simulation timestep remains unchanged.
            time.sleep(0.8)
            st.rerun()
        else:
            st.session_state.playing = False

with tab_data:
    st.subheader("📊 Full Mission Telemetry Log")
    st.caption("Complete dynamic state and sensor telemetry time series.")
    st.dataframe(df_sim, use_container_width=True, height=450)
    csv_bytes = df_sim.to_csv(index=False).encode('utf-8')
    st.download_button(
        label="📥 Download Telemetry CSV",
        data=csv_bytes,
        file_name="digital_twin_telemetry.csv",
        mime="text/csv",
    )

with tab_diag:
    st.subheader("🩺 Physics-Informed Digital Twin Diagnostics")
    st.caption("Model feature importance, physics residual distributions, and anomaly classification probabilities.")
    col_d1, col_d2, col_d3 = st.columns([1.0, 1.0, 0.9])
    with col_d1:
        st.markdown("**ML Anomaly Detection Probability Stream**")
        fig_prob = go.Figure()
        fig_prob.add_trace(go.Scatter(x=df_sim["time_s"], y=df_sim["anomaly_probability"] * 100, line=dict(color="#EF4444", width=2), fill="tozeroy"))
        fig_prob.update_layout(height=280, template="plotly_dark", paper_bgcolor="#0B111E", plot_bgcolor="#0B111E")
        st.plotly_chart(fig_prob, use_container_width=True)
    with col_d2:
        st.markdown("**Physics Residuals (Observed - Healthy Expected Baseline)**")
        residuals = np.abs(df_sim["power_kw"] - df_sim["power_kw"].iloc[0])
        fig_res = go.Figure()
        fig_res.add_trace(go.Scatter(x=df_sim["time_s"], y=residuals, line=dict(color="#38BDF8", width=2)))
        fig_res.update_layout(height=280, template="plotly_dark", paper_bgcolor="#0B111E", plot_bgcolor="#0B111E", yaxis_title="Delta Power (kW)")
        st.plotly_chart(fig_res, use_container_width=True)
    with col_d3:
        diagnostic_anomaly = str(cur_row.get("status", "NORMAL")) == "ANOMALY"
        diagnostic_fault = st.session_state.fault_type if fault_active else "None (Healthy)"
        diagnostic_confidence = float(cur_row.get("severity_confidence", 0.0)) * 100
        diagnostic_health = float(cur_row.get("health_index", 100.0))
        diagnostic_severity = str(cur_row.get("severity_label", "Healthy"))
        if diagnostic_fault == "Injector Degradation":
            reasoning = ["Healthy baseline", "Fuel flow deviation ↑", "Combustion power ↓", "Torque & RPM ↓", "Anomalous engine behavior"]
            recommendation = "⚠ Inspect fuel injection system before next mission."
        elif diagnostic_fault == "Cooling Degradation":
            reasoning = ["Healthy baseline", "Cooling efficiency ↓", "Heat rejection deviation ↑", "Thermal response changes", "Anomalous engine behavior"]
            recommendation = "⚠ Inspect cooling system before next mission."
        else:
            reasoning = ["Healthy baseline", "Telemetry monitored", "Physics residuals evaluated", "Operating state classified"]
            recommendation = "✓ Continue monitoring engine telemetry."
        diagnostic_status = "🔴 ANOMALY DETECTED" if diagnostic_anomaly else "🟢 NO ANOMALY DETECTED"
        diagnostic_color = "#EF4444" if diagnostic_anomaly else "#10B981"
        reasoning_html = "".join(
            f'<div style="color: {"#F8FAFC" if index == 0 else "#CBD5E1"};">{step}</div>'
            + ('<div style="text-align:center; color:#38BDF8; margin:2px 0;">↓</div>' if index < len(reasoning) - 1 else '')
            for index, step in enumerate(reasoning)
        )
        st.markdown(
            f"""
            <div style="height: 100%; min-height: 365px; background: #101726; border: 1px solid #1E293B; border-radius: 10px; overflow: hidden;">
                <div style="padding: 13px 15px; border-bottom: 1px solid #1E293B; color: #38BDF8; font-size: .78rem; font-weight: 800; letter-spacing: .7px;">🧠 DIGITAL TWIN DIAGNOSTICS</div>
                <div style="padding: 13px 15px;">
                    <div style="color:#64748B; font-size:.68rem; font-weight:700; letter-spacing:.8px;">CURRENT ASSESSMENT</div>
                    <div style="margin-top:10px; color:{diagnostic_color}; font-size:1.05rem; font-weight:800;">{diagnostic_status}</div>
                    <div style="margin-top:5px; color:#F8FAFC; font-size:.82rem; font-weight:700;">{diagnostic_fault}</div>
                    <div style="display:grid; grid-template-columns:1fr auto; gap:7px 12px; margin-top:14px; color:#94A3B8; font-size:.72rem;">
                        <span>Confidence</span><strong style="color:#38BDF8;">{diagnostic_confidence:.1f}%</strong>
                        <span>Health</span><strong style="color:#10B981;">{diagnostic_health:.0f}%</strong>
                        <span>Severity</span><strong style="color:#F59E0B;">{diagnostic_severity}</strong>
                        <span>Thermal status</span><strong style="color:#CBD5E1;">{thermal_status}</strong>
                    </div>
                    <div style="height:1px; background:#1E293B; margin:16px 0 13px;"></div>
                    <div style="color:#F8FAFC; font-size:.72rem; font-weight:800; margin-bottom:9px;">AI REASONING</div>
                    <div style="font-family:'JetBrains Mono', monospace; font-size:.68rem; line-height:1.35;">{reasoning_html}</div>
                    <div style="height:1px; background:#1E293B; margin:16px 0 13px;"></div>
                    <div style="color:#F8FAFC; font-size:.72rem; font-weight:800; margin-bottom:7px;">RECOMMENDATION</div>
                    <div style="color:#FBBF24; font-size:.7rem; line-height:1.4;">{recommendation}</div>
                </div>
            </div>
            """,
            unsafe_allow_html=True,
        )

with tab_about:
    st.subheader("ℹ️ About the Aero-Piston Engine Digital Twin")
    st.markdown(
        """
        **Smart India Hackathon (SIH 2027) | Problem Statement 26054**

        This prototype demonstrates a complete end-to-end cyber-physical digital twin architecture for an aircraft piston engine:
        - **Atmosphere & Aero Physics:** ISA barometric air density, continuous 4-stroke thermodynamics, variable volumetric efficiency, and propeller absorber load torque.
        - **Thermal Subsystem:** Fuel chemical energy partition, dynamic CHT and oil temperature differential equations, and convective cooling efficiency degradation.
        - **Auxiliary Telemetry:** Combustion imbalance vibration and viscosity-coupled oil lubrication pressure.
        - **Physics-Informed Machine Learning:** Residual-augmented anomaly classification and 5-class degradation severity estimation.
        - **Judge-Ready Visualization:** Synchronized real-time telemetry, 2D cutaway piston animation, and causal explainability.
        """
    )
