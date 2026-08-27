# PS 26054 — Aero-Piston Engine Digital Twin
## Internal Hackathon MVP

A physics-informed Digital Twin simulation of a 4-stroke aero-piston UAV engine, modeling dynamic engine response, thermal behaviors, auxiliary telemetry, fault injection (injector degradation), multi-scenario dataset generation, serialized ML anomaly detection, severity classification, and real-time mission telemetry stream replay.

---

## 📌 Project Overview

This project implements a **physics-informed dynamic simulator** for aircraft piston engines. Rather than treating engine telemetry as static algebraic values, the twin models true transient behavior using **crankshaft rotational differential equations ($I \frac{d\omega}{dt} = T_{net} - T_{load}$)** combined with thermal dynamics ($\text{CHT}$, $T_{oil}$) integrated over time via a 4th-Order Runge-Kutta (RK4) solver.

---

## 🚀 Accomplished Milestones

### ✅ Milestone 0: Atmospheric Model ([Engine/atmosphere.py](file:///c:/SIH2027/Engine/atmosphere.py))
- **International Standard Atmosphere (ISA)** model.
- Maps `Altitude (ft)` + `Temperature Offset (°C)` $\rightarrow$ `Pressure (Pa)`, `Temperature (°C)`, and `Air Density (kg/m³)`.
- Validated across sea level ($0\text{ ft}$), $10,000\text{ ft}$, and $20,000\text{ ft}$.

### ✅ Milestone 1: Engine Physics & Dynamic Solver ([Engine/engine.py](file:///c:/SIH2027/Engine/engine.py), [Engine/simulation.py](file:///c:/SIH2027/Engine/simulation.py))
- **Engine Configuration**: Generic ~150 kW, 4-cylinder, 3.0 L 4-stroke aero-piston engine.
- **Air & Fuel Flow**: Calculated from displacement, speed ($\omega$), throttle ($\theta$), volumetric efficiency ($\eta_v$), and stoichiometric AFR ($14.0$).
- **Torque & Power**: Indicated combustion power, friction torque, and propeller absorber load ($T_{load} = k_{prop} \cdot \omega^2$).
- **ODE Integrator**: RK4 continuous-time dynamic simulation solver.

### ✅ Milestone 2: Thermal & Auxiliary Models ([Engine/engine.py](file:///c:/SIH2027/Engine/engine.py))
- **Cylinder Head Temperature (CHT °C)**: First-order thermal inertia model ($\tau_{cht} = 8\text{ s}$).
- **Oil Temperature ($T_{oil}$ °C)**: Slow thermal inertia model ($\tau_{oil} = 20\text{ s}$).
- **Oil Pressure ($P_{oil}$ bar)**: RPM pump speed model with temperature viscosity penalty.
- **Vibration (g)**: Harmonic engine vibration + combustion cycle power imbalance.

### ✅ Milestone 3: Fault Injection Engine ([Engine/engine.py](file:///c:/SIH2027/Engine/engine.py), [main.py](file:///c:/SIH2027/main.py))
- **Injector Degradation Fault**: Simulates fuel starvation ($\eta_{inj} = 1.0 \rightarrow 0.80$ at $t = 30\text{ s}$).
- **Fault Propagation**: Fuel starvation $\rightarrow$ torque loss $\rightarrow$ RPM deceleration $\rightarrow$ power drop $\rightarrow$ thermal cooling $\rightarrow$ vibration increase.

### ✅ Dataset Generation Engine ([generate_dataset.py](file:///c:/SIH2027/generate_dataset.py), [ml/explore_dataset.py](file:///c:/SIH2027/ml/explore_dataset.py))
- **450 Full Simulation Runs** ($270,450$ telemetry samples) spanning 5 altitudes, 6 throttles, 3 temperature offsets, and 5 injector health levels ($100\%, 95\%, 90\%, 85\%, 80\%$).
- Automated verification: 0 nulls, 0 infs, physical range upper/lower bound enforcement.

### ✅ Milestone 4: Serialized Anomaly & Severity Engine ([ml/train_anomaly_models.py](file:///c:/SIH2027/ml/train_anomaly_models.py), [ml/severity_inference.py](file:///c:/SIH2027/ml/severity_inference.py))
- **Physics-Informed Digital Twin Residual Classifier**:
  - Leverages physics baseline $M_{healthy}(\text{Alt}, \text{Throttle}, \text{AirDensity})$ to eliminate environmental false alarms.
  - 5-Class Severity Classifier (`severity_classifier.joblib`) classifying Healthy, 95%, 90%, 85%, 80% injector health.
  - Achieves **ROC-AUC = 1.0000**, **F1-Score = 0.9582**, and **100% Fault Detection Recall** across all degradation levels.

### ✅ Milestone 5: Unified Diagnostic Engine & Mission Replay ([ml/digital_twin_inference.py](file:///c:/SIH2027/ml/digital_twin_inference.py), [ml/verify_severity_mission.py](file:///c:/SIH2027/ml/verify_severity_mission.py), [run_digital_twin.py](file:///c:/SIH2027/run_digital_twin.py))
- Unified `DigitalTwinInferenceEngine` combining physics estimator, anomaly detector, and severity classifier.
- Streams real-time flight mission with temporal 3-consecutive sample fault confirmation filter.
- Real-time CLI terminal display (`run_digital_twin.py`).

---

## 📁 Project Directory Structure

```text
SIH2027/
│
├── Engine/
│   ├── atmosphere.py                    # ISA Atmospheric model (M0)
│   ├── engine.py                        # 4-stroke engine physics & thermal models (M1-M3)
│   └── simulation.py                    # 3D RK4 ODE solver & fault scheduler (M1-M3)
│
├── ml/
│   ├── explore_dataset.py               # Dataset exploration & quality audit (M4)
│   ├── train_anomaly_models.py          # ML model training, benchmark & serialization (M4)
│   ├── severity_inference.py            # Standalone 5-class severity inference (M4)
│   ├── digital_twin_inference.py        # Unified Digital Twin diagnostic engine (M5)
│   ├── verify_severity_mission.py       # Mission stream severity replay & temporal filter (M5)
│   └── models/
│       ├── physics_estimator.joblib     # Serialized physics baseline model
│       ├── anomaly_classifier.joblib    # Serialized anomaly classifier model
│       ├── severity_classifier.joblib   # Serialized 5-class severity classifier model
│       └── scaler.joblib                # Serialized feature scaler
│
├── data/
│   ├── engine_telemetry_dataset.csv     # 450-run multi-scenario dataset (270,450 samples)
│   ├── healthy_telemetry.csv            # Baseline healthy engine dataset
│   └── degraded_injector_telemetry.csv  # Injector degraded engine dataset
│
├── plots/
│   ├── m5_mission_severity_timeline.png # M5 real-time mission severity timeline
│   ├── m4_anomaly_detection_results.png # M4 anomaly detection ROC & evaluation graphs
│   ├── m2_m3_fault_comparison.png       # M2/M3 fault comparison plots
│   └── m1_healthy_simulation.png        # M1 telemetry plots
│
├── run_digital_twin.py                  # Primary terminal CLI demonstration
├── main.py                              # Simulation runner & experiment script
├── generate_dataset.py                  # Multi-scenario dataset generator
└── README.md                            # Project documentation
```

---

## ⚡ How to Run

### Prerequisites
```bash
pip install numpy scipy pandas matplotlib scikit-learn joblib pygame
```

### 3. PyGame 2D Mission Replay Prototype
```bash
python simulation_2d/main.py
```

The prototype replays `data/degraded_injector_telemetry.csv`, drives the
shared crankshaft animation from the recorded RPM, and displays mission time,
RPM, brake power, and injector efficiency. Close the window to exit.

Interactive controls include `Space` (play/pause), `R` (reset), `Left/Right`
(sample scrubbing), `Home`/`End` (mission bounds), `1`/`2`/`3` (0.5×/1×/2×),
`H` (15-second healthy preset), `F` (45-second fault preset), `E` (explainability),
and `G` (graphs). The timeline can also be clicked and dragged.

### 1. Primary Terminal CLI Demonstration
```bash
python run_digital_twin.py
```

### 2. Execute Mission Severity Replay
```bash
python ml/verify_severity_mission.py
```

### 3. Generate 450-Run Dataset & Train Models
```bash
python generate_dataset.py
python ml/explore_dataset.py
python ml/train_anomaly_models.py
```

---

## 📊 Terminal CLI Demonstration Output

```text
=================================================================
  AERO-PISTON ENGINE DIGITAL TWIN - INJECTOR DEGRADED STATE (T = 45.0 S)
=================================================================
  Flight Mission Time : 45.0 s
  Altitude           : 10,000 ft
  Throttle           : 70 %
-----------------------------------------------------------------
  ENGINE SENSOR TELEMETRY
-----------------------------------------------------------------
  Engine Speed (RPM) : 2537 RPM
  Net Brake Power    : 20.9 kW
  Fuel Consumption   : 10.01 L/h
  Exhaust Gas Temp   : 624.9 deg C
  Cylinder Head Temp : 150.4 deg C
  Oil Temperature    : 106.1 deg C
  Oil Pressure       : 3.30 bar
  Vibration Level    : 2.31 g
-----------------------------------------------------------------
  DIGITAL TWIN DIAGNOSTIC HEALTH MONITOR
-----------------------------------------------------------------
  Engine Health Status: ANOMALY
  Anomaly Probability : 100.0 %
  Health Index Score  : 80 / 100
  Fault Severity      : 80% Injector Health
  Severity Confidence : 100.0 %
=================================================================
```

---

## 🗺️ Next Steps Roadmap

- [x] **M0**: Atmospheric Environment Model
- [x] **M1**: Basic Dynamic Engine Physics & Solver
- [x] **M2**: Thermal & Auxiliary Telemetry (CHT, Oil Temp, Oil Pressure, Vibration)
- [x] **M3**: Injector Degradation Fault Injection & Propagation
- [x] **Dataset**: Multi-Scenario 450-Run Telemetry Generator & Quality Audit
- [x] **M4**: Anomaly & 5-Class Severity Engine (`severity_classifier.joblib`)
- [x] **M5**: Unified Inference Pipeline (`digital_twin_inference.py`), Mission Severity Replay & CLI Runner (`run_digital_twin.py`)
- [ ] **M6**: Digital Twin Interactive Dashboard


#   S I H 2 0 2 7 
 
 
