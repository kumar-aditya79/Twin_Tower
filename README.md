# AeroTwin: AI-Enabled Real-Time Digital Twin for Aero-Piston Engines in MALE UAVs

**Smart India Hackathon (SIH) 2026 | Problem Statement PS 26054**

![Python](https://img.shields.io/badge/Python-3.10%2B-blue) ![License](https://img.shields.io/badge/License-MIT-green) ![SIH](https://img.shields.io/badge/SIH-PS%2026054-orange)

> **Problem statement:** *AI-Enabled Real-Time Digital Twin System for Health Monitoring, Fault Prediction and Mission Reliability Enhancement of Aero Piston Engines used in MALE UAVs.*

<!-- TODO: add a dashboard screenshot here, e.g. ![Dashboard](plots/dashboard.png) -->

---

## Table of Contents

1. [Overview](#1-overview)
2. [Key Idea: Physics Before AI](#2-key-idea-physics-before-ai)
3. [System Architecture](#3-system-architecture)
4. [Physics Engine](#4-physics-engine)
5. [Fault Injection](#5-fault-injection)
6. [Dataset Generation](#6-dataset-generation)
7. [Physics-Informed ML Pipeline](#7-physics-informed-ml-pipeline)
8. [User Interfaces](#8-user-interfaces)
9. [Project Structure](#9-project-structure)
10. [Installation and Usage](#10-installation-and-usage)
11. [Results](#11-results)
12. [Limitations](#12-limitations)
13. [Roadmap](#13-roadmap)
14. [Team](#14-team)

---

## 1. Overview

AeroTwin is a software digital twin of a 4-stroke aero-piston engine of the type used in Medium Altitude Long Endurance (MALE) Unmanned Aerial Vehicles (UAVs).

Common monitoring approaches have two weaknesses:

- **Static threshold alarms** miss early degradation.
- **Black-box machine learning** can mistake natural altitude and weather effects for engine faults.

AeroTwin combines:

- **Continuous physics simulation** of torque, speed and thermal inertia, integrated with a 4th-order Runge-Kutta (RK4) solver.
- **Atmospheric awareness** through the International Standard Atmosphere (ISA) model, 0 to 20,000 ft.
- **Physics residuals**, the difference between measured and expected healthy sensor values, so that environmental effects are separated from real faults.
- **Severity classification** of injector health into 5 levels (100%, 95%, 90%, 85%, 80%).
- **Explainable diagnostics** with a causal failure chain, shown in interactive dashboards.

---

## 2. Key Idea: Physics Before AI

### The altitude false-alarm problem

When a UAV climbs to 15,000 ft, the air is thinner (about 0.77 kg/m³), so engine speed and power drop naturally.

- **Pure black-box ML** sees the RPM drop and raises a false engine-failure alarm.
- **AeroTwin** first computes air density from the ISA model, then predicts the expected *healthy* RPM for those conditions.

| Case | Expected healthy RPM | Measured RPM | Residual | Result |
|---|---|---|---|---|
| Healthy engine at 15,000 ft | 2600 | 2600 | 0 | NORMAL (no alarm) |
| 80% injector health at 10,000 ft | 2907 | 2537 | 370 | CONFIRMED ANOMALY |

The residual is:

$$r = \left| y_{\text{measured}} - y_{\text{healthy expected}} \right|$$

---

## 3. System Architecture

```text
┌──────────────────────────────────────────────────────────────────────────┐
│                        FLIGHT & ENVIRONMENT INPUTS                       │
│          Altitude (0-20,000 ft) · Throttle (0-100%) · Temp offset        │
└───────────────────────────────────┬──────────────────────────────────────┘
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                       CONTINUOUS PHYSICS SIMULATION                      │
│  • ISA atmosphere: altitude → air density and pressure                   │
│  • Engine dynamics (RK4): I · dω/dt = T_net − T_load                     │
│  • Thermal inertia ODEs for cylinder head temp (CHT) and oil temp        │
│  • Oil pressure (viscosity-coupled) and vibration models                 │
│  • Fault injection: injector starvation, cooling degradation             │
└───────────────────────────────────┬──────────────────────────────────────┘
                                    ▼  Telemetry: RPM, Power, CHT, Oil, Vib, EGT
┌──────────────────────────────────────────────────────────────────────────┐
│                  PHYSICS-INFORMED ML DIAGNOSTIC ENGINE                   │
│  • Physics baseline (RandomForest): expected healthy sensor values       │
│  • Residual engine: |actual − expected healthy|                          │
│  • Anomaly classifier: Normal vs Anomaly                                 │
│  • Severity classifier: 100 / 95 / 90 / 85 / 80 % injector health        │
│  • Temporal filter: 3 consecutive samples → Normal → Warning → Confirmed │
└───────────────────────────────────┬──────────────────────────────────────┘
                 ┌──────────────────┼──────────────────┐
                 ▼                  ▼                  ▼
        Streamlit Cockpit     3D WebGL Engine     Pygame 2D Replay
         (dashboard.py)      (torque-zero-main)   (simulation_2d/)
```

---

## 4. Physics Engine

### 4.1 Atmosphere model (ISA)

File: `Engine/atmosphere.py`

$$T(h) = T_0 - L\,h + \Delta T_{\text{offset}}$$

$$P(h) = P_0 \left(\frac{T(h)}{T_0}\right)^{\frac{g}{R_{\text{air}}\,L}}, \qquad \rho(h) = \frac{P(h)}{R_{\text{air}}\,T(h)}$$

with lapse rate $L = 0.0065$ K/m, $g = 9.80665$ m/s², $R_{\text{air}} = 287.05$ J/(kg·K).

### 4.2 Engine dynamics and RK4 solver

Files: `Engine/engine.py`, `Engine/simulation.py`

Engine configuration: 4-cylinder, 4-stroke, 3.0 L displacement, rotational inertia $I = 0.20$ kg·m², rated at 5,000 RPM.

Air and fuel flow:

$$\dot{m}_{\text{air}} = \rho \, V_{\text{disp}} \left(\frac{\omega}{4\pi}\right) \eta_v(\theta,\omega), \qquad \dot{m}_{\text{fuel}} = \frac{\dot{m}_{\text{air}}}{\text{AFR}_{\text{target}}}\,\eta_{\text{inj}}$$

Torque balance:

$$I\,\frac{d\omega}{dt} = T_{\text{net}} - T_{\text{load}}$$

$$T_{\text{net}} = T_{\text{gross}} - (c_{f0} + c_{f1}\,\omega), \qquad T_{\text{load}} = k_{\text{prop}}\,\omega^{2}$$

The state vector $x(t) = [\omega,\ \text{CHT},\ T_{\text{oil}}]^T$ is advanced with a 4th-order Runge-Kutta solver.

### 4.3 Thermal management

File: `Engine/thermal_management.py`

Energy partition:

$$\dot{Q}_{\text{fuel}} = P_{\text{brake}} + \dot{Q}_{\text{exhaust}} + \dot{Q}_{\text{structure}} + \dot{Q}_{\text{friction}}$$

Thermal inertia:

$$\frac{d\,\text{CHT}}{dt} = \frac{\text{CHT}_{\text{target}} - \text{CHT}}{\tau_{\text{cht}}}, \quad \tau_{\text{cht}} = 8\ \text{s}$$

$$\frac{d\,T_{\text{oil}}}{dt} = \frac{T_{\text{oil,target}} - T_{\text{oil}}}{\tau_{\text{oil}}}, \quad \tau_{\text{oil}} = 20\ \text{s}$$

| Status | Condition |
|---|---|
| NOMINAL | CHT < 225 °C and oil temp < 135 °C |
| CAUTION | 225 °C ≤ CHT < 250 °C, or 135 °C ≤ oil temp < 145 °C |
| OVERHEAT | CHT ≥ 250 °C, or oil temp ≥ 145 °C |

### 4.4 Oil pressure and vibration

Oil pressure (pump speed with viscosity loss at higher temperature):

$$P_{\text{oil}} = (1.5 + 0.0008\,\text{RPM})\,\left[1 - 0.0025\,(T_{\text{oil}} - 80)\right]$$

Vibration (harmonic crankshaft term plus combustion imbalance):

$$\text{Vib} = 1.0 + 0.0003\,\text{RPM} + 0.15\sin(2\omega t) + 4.0\,(1 - \eta_{\text{inj}})\left(\frac{\text{RPM}}{3000}\right)$$

---

## 5. Fault Injection

| Fault | Trigger | Propagation chain | Main symptoms |
|---|---|---|---|
| Fuel injector degradation | Injector efficiency $\eta_{\text{inj}}$ drops (100% → 80%) | Fuel starvation → power loss → lower net torque → RPM drops → CHT falls → cylinder imbalance raises vibration | RPM ↓, Power ↓, Fuel ↓, CHT ↓, Vibration ↑ |
| Cooling degradation | Cooling efficiency $\eta_{\text{cool}}$ drops | Less heat rejection → heat builds up → thermal runaway → oil viscosity collapses | CHT ↑ (> 250 °C), Oil temp ↑ (> 145 °C), Oil pressure ↓ (< 2.0 bar) |

---

## 6. Dataset Generation

Files: `generate_dataset.py`, `ml/explore_dataset.py`

The training data comes from a full-factorial simulation matrix:

| Parameter | Levels |
|---|---|
| Altitude (5) | 0, 5,000, 10,000, 15,000, 20,000 ft |
| Throttle (6) | 40, 50, 60, 70, 80, 90 % |
| Temperature offset (3) | −10 °C, 0 °C, +10 °C |
| Injector health (5) | 100 (healthy), 95, 90, 85, 80 % |

5 × 6 × 3 × 5 = **450 runs** × 601 time steps = **270,450 samples**.

Quality checks: 0 null values, 0 infinite values, and physical lower/upper bounds enforced. Saved to `data/engine_telemetry_dataset.csv`.

---

## 7. Physics-Informed ML Pipeline

Files: `ml/train_anomaly_models.py`, `ml/digital_twin_inference.py`, `ml/severity_inference.py`

```text
Operating conditions (altitude, throttle, air density)
        │
        ▼
Physics estimator (RandomForestRegressor) ──► expected healthy sensor values
        │                                              │
        ▼                                              ▼
Actual sensor telemetry ─────────────────────► residuals |actual − expected|
                                                       │
                                                       ▼
                                      StandardScaler + anomaly classifier
                                                       │
                                                       ▼
                                           NORMAL vs ANOMALY
                                                       │
                                                       ▼
                                        5-class severity classifier
                                                       │
                                                       ▼
                                  Temporal filter (3 consecutive samples)
                                  NORMAL → WARNING → CONFIRMED
```

Saved model files in `ml/models/`:

| File | Purpose |
|---|---|
| `physics_estimator.joblib` | Predicts expected healthy sensor values |
| `scaler.joblib` | Scales residual-augmented feature vectors |
| `anomaly_classifier.joblib` | Normal vs Anomaly |
| `severity_classifier.joblib` | 5-level injector health estimate |

---

## 8. User Interfaces

**Streamlit cockpit dashboard** (`dashboard.py`, http://localhost:8501): sliders for altitude, throttle, ambient temperature and fault level; live readouts of RPM, brake power, fuel flow, CHT, oil temperature, oil pressure and EGT; four Plotly charts with caution/overheat thresholds; a health card with a 0-100 health index, the detected fault and a step-by-step causal chain.

**3D WebGL engine visualizer** (`torque-zero-main/`, http://localhost:5173): a Three.js / React cutaway with a rotating crankshaft, moving pistons, valves and propeller, synchronized with the simulation.
<!-- TODO: if this folder is based on someone else's open-source project, name it and link it here, or remove this section. -->

**Pygame 2D replay** (`simulation_2d/main.py`): animated 2D cutaway with timeline scrubbing, healthy (t = 15 s) and fault (t = 45 s) presets, and fuel-spray and combustion animations.

**Terminal demo** (`run_digital_twin.py`): prints pre-fault and post-fault snapshots with the health index and severity confidence.

---

## 9. Project Structure

```text
SIH/
├── Engine/
│   ├── atmosphere.py              # ISA atmosphere model
│   ├── engine.py                  # Engine physics, torque and thermal model
│   ├── simulation.py              # RK4 ODE solver
│   └── thermal_management.py      # Heat balance, CHT and oil temperature
├── ml/
│   ├── explore_dataset.py         # Dataset quality audit
│   ├── train_anomaly_models.py    # Baseline and classifier training
│   ├── severity_inference.py      # 5-class severity wrapper
│   ├── digital_twin_inference.py  # Unified diagnostic pipeline
│   ├── verify_mission_fault.py    # Mission telemetry verification
│   ├── verify_severity_mission.py # Severity timeline with 3-sample filter
│   └── models/                    # Saved .joblib models
├── data/
│   ├── engine_telemetry_dataset.csv     # 450 runs, 270,450 rows
│   ├── healthy_telemetry.csv            # 60 s healthy mission
│   └── degraded_injector_telemetry.csv  # 60 s degraded-injector mission
├── simulation_2d/                 # Pygame desktop app
├── torque-zero-main/              # Three.js / React 3D visualizer
├── plots/                         # ROC, confusion matrix, timeline plots
├── dashboard.py                   # Streamlit dashboard
├── run_digital_twin.py            # Terminal demo
├── test_thermal_cooling.py        # Thermal cooling tests (4 scenarios)
├── main.py                        # Baseline mission simulator
├── generate_dataset.py            # Dataset generator
├── requirements.txt
└── README.md
```

---

## 10. Installation and Usage

**Prerequisites:** Python 3.10+, and Node.js 18+ with npm (only for the 3D visualizer).

```bash
# 1. Install Python dependencies
pip install -r requirements.txt
pip install streamlit plotly matplotlib

# 2a. Start the 3D visualizer (Terminal 1)
cd torque-zero-main
npm install
npm run dev

# 2b. Start the dashboard (Terminal 2)
streamlit run dashboard.py
# open http://localhost:8501

# 3. Pygame 2D visualizer
python simulation_2d/main.py

# 4. Terminal demo
python run_digital_twin.py

# 5. (Optional) Regenerate data and retrain models
python generate_dataset.py
python ml/explore_dataset.py
python ml/train_anomaly_models.py
python ml/verify_severity_mission.py
```

**Pygame controls:** Space = play/pause, R = reset, Left/Right = scrub, H = healthy preset (15 s), F = fault preset (45 s), E = explainability, G = graphs, 1/2/3 = speed.

---

## 11. Results

All results below are on **simulated** data generated by the physics engine in this repository.

<!-- TODO: re-run the evaluation with a split by whole runs (for example GroupKFold grouped by run, or holding out entire altitude/throttle combinations), because rows from the same run are almost identical. Then update the numbers below with the held-out results. Also confirm the baseline numbers come from code in this repo. -->

| Metric | Baseline (IsolationForest) | AeroTwin (Physics-ML) |
|---|---|---|
| Precision | 0.8120 | 0.9610 |
| Recall | 0.8350 | 1.0000 |
| F1-score | 0.8233 | 0.9582 |
| ROC-AUC | 0.8841 | 1.0000 |

Detection rate by injector health:

| Injector health | Baseline | AeroTwin |
|---|---|---|
| 95% | 78.4% | 100.0% |
| 90% | 84.2% | 100.0% |
| 85% | 91.1% | 100.0% |
| 80% | 98.0% | 100.0% |

Evaluation plots are in `plots/`.

---

## 12. Limitations

- All data is **synthetic**. Results on a real engine will differ, and sensor noise, wear and manufacturing variation are only partly modelled.
- Severity classification covers **injector degradation** only. Cooling degradation is simulated and detectable by thresholds, but is not part of the 5-class severity model.
- Very high scores on simulated data can reflect the model learning the simulator's own equations. Real-world validation is needed.
- No hardware-in-the-loop testing has been done yet.

---

## 13. Roadmap

- [x] ISA atmosphere model (0 to 20,000 ft)
- [x] 4-stroke engine physics with RK4 solver
- [x] Thermal model, oil pressure and vibration
- [x] Injector and cooling fault injection
- [x] 450-run dataset and physics-ML anomaly engine
- [x] Diagnostic engine with 3-sample confirmation filter
- [x] Streamlit dashboard, 3D visualizer and Pygame replay
- [ ] Hardware-in-the-loop: CAN-bus / OBD-II telemetry from a physical test bench
- [ ] More fault modes: ignition misfire, piston ring wear, intake manifold leak
- [ ] Remaining Useful Life (RUL) prediction with LSTM/GRU
- [ ] Edge deployment on a UAV companion computer (NVIDIA Jetson / Raspberry Pi)

---

## 14. Team

Developed for Smart India Hackathon (SIH) 2026, Problem Statement PS 26054.

| Name | Role |
|---|---|
| Kumar Aditya Singh | <!-- TODO: your contribution, e.g. ML pipeline, physics model --> |
| <!-- teammate --> | <!-- role --> |

---

*Predict early. Fly further.*

**License:** MIT
