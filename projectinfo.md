# Aero-Piston Engine Digital Twin
## Simple Project Guide for Teammates and Hackathon Judges

> **One-line explanation:** This project is a software-based digital twin that simulates a four-cylinder aero-piston engine, creates sensor telemetry, injects an injector fault, and uses physics-informed machine learning to detect and estimate the severity of that fault.

---

## 1. What is this project?

An aircraft engine produces many signals while it is operating: engine speed, power, fuel flow, temperatures, oil pressure, and vibration. If one component begins to fail, these signals change.

This project creates a virtual copy of an aero-piston engine in software. The virtual engine is called a **digital twin**. It behaves like a simplified real engine:

1. The atmosphere changes with altitude and temperature.
2. The engine receives throttle and fuel.
3. The engine produces torque and power.
4. The crankshaft speed changes over time.
5. Engine temperatures and vibration change over time.
6. A simulated injector fault changes the engine response.
7. Machine learning compares the observed response with the expected healthy response.
8. The system reports whether the engine is normal, the probability of an anomaly, the estimated injector health, and a health index.

The main demonstration is:

```text
Healthy engine
      ↓
Injector efficiency drops at about 30 seconds
      ↓
Fuel delivery and combustion power decrease
      ↓
Torque, RPM, and brake power change
      ↓
Thermal and vibration telemetry changes
      ↓
Physics residuals increase
      ↓
ML detects an anomaly
      ↓
The system estimates fault severity and engine health
```

---

## 2. Why is this useful?

Aircraft engines must be monitored continuously because an unnoticed fault can reduce performance or create a safety risk. A real aircraft system may use sensors and maintenance software to identify abnormal behavior.

This project demonstrates the basic idea before connecting to real hardware:

- **Early fault detection:** identify abnormal engine behavior before complete failure.
- **Condition monitoring:** observe the engine continuously through telemetry.
- **Predictive maintenance foundation:** understand engine health from trends instead of waiting for a breakdown.
- **Reduced false alarms:** account for normal environmental changes such as altitude and throttle.
- **Explainable AI:** show which physical signals changed and why the model raised an alert.
- **Safe testing:** test fault scenarios in software without damaging a real engine.
- **Clear decision support:** convert many sensor readings into a simple health status and severity level.

This is especially valuable for UAVs and aircraft where an engine may operate far from a maintenance team.

---

## 3. Project purpose

The purpose of this hackathon MVP is to prove a complete end-to-end workflow:

```text
Engine physics
   +
Environmental model
   +
Fault injection
   +
Synthetic telemetry
   +
Machine learning
   +
Interactive visualization
   =
Presentation-ready digital twin prototype
```

The project is not intended to replace a certified aircraft engine controller. It is a focused demonstration of how physics simulation and ML can work together for engine health monitoring.

---

## 4. What fault is being demonstrated?

The current fault is **injector degradation**.

The injector controls fuel delivery to the engine. In the main mission demonstration:

- From **0 to 30 seconds**, injector efficiency is 100%.
- At approximately **30 seconds**, injector efficiency changes to 80%.
- From **30 to 60 seconds**, the engine operates with 20% fuel starvation.

The expected cause-and-effect chain is:

```text
Injector efficiency decreases
      ↓
Less fuel reaches combustion
      ↓
Less chemical and useful power is produced
      ↓
Net torque decreases
      ↓
Crankshaft RPM falls against propeller load
      ↓
Brake power and fuel flow change
      ↓
CHT and oil temperature targets change
      ↓
Combustion imbalance increases vibration
      ↓
Telemetry differs from the healthy baseline
```

The dataset also contains steady degraded scenarios at five injector health levels:

| Injector efficiency | Meaning |
|---:|---|
| 100% | Healthy |
| 95% | Mild degradation |
| 90% | Moderate degradation |
| 85% | Serious degradation |
| 80% | Severe degradation |

> **Important distinction:** the main mission CSV injects the fault at 30 seconds. The large training dataset uses each injector health level for an entire 60-second run so the ML models can learn the different conditions.

---

## 5. How the engine simulation was made

### 5.1 Atmospheric model

`Engine/atmosphere.py` implements a simplified International Standard Atmosphere model. It receives:

- Altitude in feet
- Temperature offset from standard atmosphere

It calculates:

- Atmospheric temperature
- Pressure
- Air density

Air density is important because an engine at high altitude receives less air mass than at sea level.

### 5.2 Engine model

`Engine/engine.py` contains the `PistonEngine` class. Its default configuration represents a conceptual:

- Four-cylinder, four-stroke aero-piston engine
- 3.0 litre displacement
- 5,000 RPM rated speed
- 0.20 kg·m² rotational inertia
- 30% baseline thermal efficiency
- 14:1 target air-fuel ratio
- 44 MJ/kg fuel heating value

The model calculates:

- Volumetric efficiency
- Air mass flow
- Fuel mass flow
- Chemical combustion power
- Gross combustion torque
- Mechanical friction torque
- Net torque
- Propeller absorber load
- Brake power
- Fuel consumption
- Exhaust gas temperature (EGT)
- Cylinder head temperature (CHT)
- Oil temperature
- Oil pressure
- Vibration

The propeller load is represented by a speed-dependent load:

$$T_{load}=k_{prop}\omega^2$$

The crankshaft dynamics are represented by:

$$I\frac{d\omega}{dt}=T_{net}-T_{load}$$

In simple words, the engine speeds up when produced torque is greater than the propeller load, and slows down when the load is greater.

### 5.3 Thermal dynamics

Temperature does not change instantly in a real engine. The project models this using first-order response equations:

$$\frac{dT}{dt}=\frac{T_{target}-T}{\tau}$$

The configured thermal time constants are:

- CHT time constant: 8 seconds
- Oil temperature time constant: 20 seconds

This gives the telemetry a realistic time response instead of changing every value immediately.

### 5.4 RK4 solver

`Engine/simulation.py` uses a fourth-order Runge-Kutta (RK4) integration method. The simulated state is:

```text
[crankshaft angular speed, cylinder head temperature, oil temperature]
```

At every time step, the simulator:

1. Applies any scheduled fault.
2. Calculates the current telemetry.
3. Evaluates the engine derivatives four times.
4. Advances the state using RK4.
5. Stores the telemetry row.

This makes the engine response dynamic and continuous rather than a collection of unrelated static values.

---

## 6. How the dataset was created

`generate_dataset.py` runs the simulator across a grid of operating conditions:

- 5 altitudes: 0, 5,000, 10,000, 15,000, and 20,000 ft
- 6 throttle settings: 40%, 50%, 60%, 70%, 80%, and 90%
- 3 temperature offsets: −10°C, 0°C, and +10°C
- 5 injector efficiencies: 100%, 95%, 90%, 85%, and 80%

This produces:

```text
5 × 6 × 3 × 5 = 450 simulation runs
```

Each run lasts 60 seconds and uses a 0.1-second time step:

```text
601 samples per run
450 × 601 = 270,450 telemetry rows
```

The stored dataset was checked for:

- Missing values
- Infinite numeric values
- Negative RPM
- Negative power
- Negative fuel flow
- Equal sample counts for every run
- Condition and injector-health distribution

The main dataset file is:

```text
data/engine_telemetry_dataset.csv
```

The repository currently contains 270,450 rows and 28 columns in this dataset.

---

## 7. How the machine learning works

The project uses a **physics-informed** ML approach. It does not rely only on raw sensor readings.

### Step 1: Learn the healthy reference

`ml/train_anomaly_models.py` trains a `RandomForestRegressor` using healthy samples only.

Inputs to the healthy reference model:

- Altitude
- Throttle
- Air density

Outputs predicted by the model:

- RPM
- Net torque
- Brake power
- Fuel flow
- EGT
- CHT
- Oil temperature
- Oil pressure
- Vibration

This model answers:

> “For this altitude, throttle, and air density, what should a healthy engine normally look like?”

### Step 2: Calculate physics residuals

For every telemetry row, the project compares actual sensor values with healthy predicted values:

$$R=|y_{actual}-y_{healthy\ prediction}|$$

A small residual means the measured engine is close to the expected healthy state. A large residual means the engine is behaving differently.

### Step 3: Detect an anomaly

The anomaly classifier receives:

- Environment inputs
- Raw sensor telemetry
- Physics residuals

It is a scaled `RandomForestClassifier` that predicts:

- `NORMAL`
- `ANOMALY`

An anomaly probability of 50% or more is treated as an anomaly by the inference engine.

### Step 4: Estimate severity

The separate serialized severity classifier predicts five classes:

```text
Healthy (100%)
95% Injector Health
90% Injector Health
85% Injector Health
80% Injector Health
```

It uses operating conditions and residual features such as RPM residual, power residual, CHT residual, oil-pressure residual, and vibration residual.

### Step 5: Create a simple health result

`ml/digital_twin_inference.py` combines the three model stages and returns:

- Engine status
- Anomaly probability
- Severity class and label
- Severity confidence
- Health index from 0 to 100
- Selected residual values for explanation

If the anomaly classifier says the engine is normal, the displayed health index is 100. If it detects an anomaly, the health index is mapped to the estimated injector health level.

### Step 6: Confirm alarms over time

The mission verification and Pygame replay use a three-sample confirmation rule:

```text
First anomalous sample  → WARNING
Three consecutive ones  → CONFIRMED FAULT
```

This helps prevent a single noisy or unusual sample from immediately becoming a confirmed alarm.

---

## 8. User interfaces and demonstrations

The same digital-twin results can be shown in three ways.

### 8.1 Command-line demonstration

`run_digital_twin.py` prints two snapshots from the degraded mission:

- Around 15 seconds: healthy state
- Around 45 seconds: injector-degraded state

This is useful for a quick technical demonstration in a terminal.

### 8.2 Streamlit dashboard

`dashboard.py` provides the polished web dashboard. It includes:

- Healthy and degraded mission selection
- Playback controls
- Mission-time slider
- Auto-play replay
- Engine health status
- Anomaly probability
- Health index
- Severity and confidence
- RPM, power, fuel, EGT, CHT, oil, vibration, throttle, and altitude cards
- Interactive Plotly charts
- Fault-onset marker at 30 seconds
- Digital-twin pipeline explanation
- Mission-story view for judges

The dashboard loads the telemetry and models once using Streamlit caching so they are not repeatedly reloaded during normal interaction.

### 8.3 Pygame interactive replay

`simulation_2d/main.py` provides a visual engine replay. It reads recorded telemetry rather than creating a second physics engine.

It shows:

- Four-cylinder engine illustration
- Piston movement
- Crankshaft rotation
- RPM-driven propeller animation
- Telemetry cards
- Diagnostic status panel
- Live telemetry graphs
- Mission timeline
- Fault marker
- Explainability panel

Controls include:

| Key | Action |
|---|---|
| Space | Play or pause |
| R | Reset |
| Left / Right | Move one telemetry sample |
| Home / End | Go to mission start or end |
| 1 / 2 / 3 | Set speed to 0.5×, 1×, or 2× |
| H | Jump to healthy preset at 15 seconds |
| F | Jump to fault preset at 45 seconds |
| E | Toggle explainability |
| G | Toggle graphs |
| ? | Toggle help |
| Esc | Exit |

The visualization layer is intentionally separate from the physics and ML layers. It reads the existing telemetry and diagnostic results and displays them.

---

## 9. Technology used

### Programming language

- Python

### Numerical and data tools

- **NumPy:** arrays, numeric calculations, and state integration support
- **pandas:** CSV loading, DataFrames, dataset preparation, and batch inference
- **Matplotlib:** evaluation and mission plots

### Machine learning

- **scikit-learn:** Random Forest regression/classification, Isolation Forest, scaling, and evaluation metrics
- **joblib:** saving and loading trained model files

### Visualization

- **Streamlit:** web dashboard
- **Plotly:** interactive dashboard charts
- **Pygame:** interactive 2D engine visualization and mission replay

### Supporting tool

- **SciPy:** listed as a project dependency for scientific-computing extensibility; the current inspected simulation uses its own NumPy-based RK4 implementation.

The declared dependencies are in `requirements.txt`. `dashboard.py` also imports Streamlit and Plotly, so those packages must be installed for the dashboard even though they are not currently listed in that file.

---

## 10. Important files and folders

```text
SIH2027/
│
├── Engine/
│   ├── atmosphere.py             Atmosphere and air-density model
│   ├── engine.py                 Engine physics, thermal model, and telemetry
│   └── simulation.py             RK4 dynamic simulator
│
├── ml/
│   ├── explore_dataset.py        Dataset quality and statistics audit
│   ├── train_anomaly_models.py   Healthy baseline and anomaly model training
│   ├── severity_inference.py     Severity model wrapper and self-test
│   ├── digital_twin_inference.py Unified inference pipeline
│   ├── verify_mission_fault.py   Mission anomaly replay and verification
│   ├── verify_severity_mission.py Severity replay and alarm confirmation
│   └── models/                   Serialized ML model files
│
├── simulation_2d/
│   ├── main.py                   Pygame application entry point
│   ├── state.py                  Replay state and playback control
│   ├── telemetry.py              CSV telemetry access helper
│   ├── diagnostics.py            Cached inference and alarm status
│   ├── engine_visual.py          Visualization-only engine drawing
│   ├── graphs.py                 Lightweight telemetry graph renderer
│   └── ui.py                     Pygame cards, controls, and timeline
│
├── data/                         Generated mission and training telemetry
├── plots/                        Generated evaluation and mission plots
├── main.py                       Healthy/degraded mission generator
├── generate_dataset.py           Large multi-scenario dataset generator
├── dashboard.py                  Streamlit dashboard
├── run_digital_twin.py           Terminal demonstration
└── requirements.txt              Python dependencies
```

The four required serialized inference artifacts currently present are:

```text
ml/models/physics_estimator.joblib
ml/models/anomaly_classifier.joblib
ml/models/scaler.joblib
ml/models/severity_classifier.joblib
```

---

## 11. How to install and run

Run these steps from the project root, `c:\SIH2027`.

### Install dependencies

Install the packages from `requirements.txt`, and also install the dashboard packages because the dashboard imports them directly.

### Create mission telemetry and plots

Run `main.py` to generate:

- `data/healthy_telemetry.csv`
- `data/degraded_injector_telemetry.csv`
- `plots/m2_m3_fault_comparison.png`

### Run the terminal demonstration

Run `run_digital_twin.py` to print healthy and degraded diagnostic snapshots.

### Run the Streamlit dashboard

Start `dashboard.py` with Streamlit. Then open the local address shown by Streamlit in a browser.

### Run the Pygame replay

Run `simulation_2d/main.py` to open the interactive 2D mission-control window.

### Generate the full training dataset

Run `generate_dataset.py` to recreate the 450-run dataset.

### Audit the dataset

Run `ml/explore_dataset.py` to check row counts, columns, nulls, infinite values, duplicates, distributions, and feature ranges.

### Train the anomaly models

Run `ml/train_anomaly_models.py` to recreate:

- `physics_estimator.joblib`
- `anomaly_classifier.joblib`
- `scaler.joblib`
- `plots/m4_anomaly_detection_results.png`

The current training script does not create `severity_classifier.joblib`; that artifact is already stored in `ml/models/` and is required by the unified inference engine.

### Verify the mission diagnosis

Run `ml/verify_severity_mission.py` to see the mission progression and create:

```text
plots/m5_mission_severity_timeline.png
```

---

## 12. Suggested judge presentation flow

A simple 60–90 second presentation can follow this sequence:

### Step 1: Start in the healthy state

Move to approximately **15 seconds**.

Say:

> “This is the normal operating state. The digital twin knows the engine’s expected behavior for the current altitude and throttle.”

### Step 2: Explain the planned fault

Move toward **30 seconds**.

Say:

> “At 30 seconds, we intentionally reduce injector efficiency from 100% to 80% to simulate fuel-delivery degradation.”

### Step 3: Show the physical response

Continue to approximately **45 seconds** and point out:

- RPM decreases
- Brake power decreases
- Fuel flow changes
- EGT and CHT respond over time
- Vibration increases because of combustion imbalance

### Step 4: Show the AI diagnosis

Point to:

- Anomaly probability
- Health index
- Injector severity label
- Severity confidence

### Step 5: Explain why it was detected

Open the explainability view and describe:

```text
Injector degradation
      → fuel-delivery change
      → combustion change
      → torque change
      → RPM and power deviation
      → physics residual increase
      → anomaly alert
```

### Strong judge-facing explanation

> “We combine a simplified physics model with machine learning. The model first estimates what a healthy engine should look like under the same environmental conditions. The ML classifier then learns from the difference between expected and measured behavior. This makes the detection more explainable and helps separate a real fault from a normal change caused by altitude or throttle.”

---

## 13. What makes the approach different?

### Physics before AI

Raw ML can mistake a normal high-altitude or low-throttle condition for a fault. This project first creates a healthy reference and uses physics residuals as additional evidence.

### Multiple sensor channels

The diagnosis does not depend on one value. It combines:

- RPM
- Torque
- Brake power
- Fuel flow
- EGT
- CHT
- Oil temperature
- Oil pressure
- Vibration

### Time-aware alarm confirmation

The system can show a warning first and confirm a fault after three consecutive anomalous samples.

### Clear visualization

The same data can be explained through a terminal, a web dashboard, or an interactive engine animation.

### Complete prototype loop

The project covers the full path from model creation to fault response to user-facing diagnosis:

```text
Model → Simulation → Telemetry → Dataset → ML → Inference → Alert → Visualization
```

---

## 14. Current scope and limitations

This is a focused MVP, so it has deliberate limits:

- The telemetry is synthetic, not collected from a real aircraft engine.
- The engine model is simplified; it is not a CFD, combustion-chemistry, or certified aircraft model.
- Only injector degradation is currently implemented.
- Other faults such as ignition, cooling, lubrication, sensor, mechanical, or propeller faults are not included.
- The ML healthy baseline is a Random Forest approximation trained on healthy simulation data; it is not the mechanistic engine equation itself.
- The training operating range is limited to the defined altitude, throttle, and temperature grid.
- The current model does not include real sensor noise, uncertainty calibration, confidence intervals, or out-of-distribution detection.
- Time samples from a run are correlated, so the reported evaluation is a simulation benchmark rather than proof of real-world aircraft performance.
- The severity classifier is loaded from a serialized model artifact and is maintained separately from the current anomaly-training script.
- There is currently no automated unit-test suite in the repository.
- Hardware integration, cloud deployment, remaining-useful-life prediction, and fleet monitoring are future extensions.

These limitations do not reduce the value of the demonstration; they define the next engineering steps needed before real deployment.

---

## 15. Possible future improvements

The project can be extended with:

1. Real engine or test-stand telemetry.
2. Sensor-noise and sensor-bias simulation.
3. More fault types, including ignition, cooling, oil-pressure, and mechanical faults.
4. A separate, reproducible training script for the severity classifier.
5. Better model validation using independent mission profiles and real-world data.
6. Uncertainty estimates and out-of-distribution warnings.
7. Automated unit and integration tests.
8. Live sensor or CAN-bus input.
9. Remaining-useful-life prediction.
10. Higher-fidelity engine, combustion, and aircraft models.
11. Deployment to an edge computer on a UAV.
12. Multi-engine or fleet-level monitoring.

---

## 16. Final summary

This project is a **physics-informed aero-piston engine digital twin** made for engine health monitoring.

It simulates how an engine behaves, creates realistic telemetry, introduces injector degradation, detects the resulting abnormal behavior, estimates the severity, and presents the result through multiple interfaces.

The most important message for teammates and judges is:

> **The project does not use AI as a black box. It combines engine physics, environmental context, telemetry residuals, and machine learning to make engine-fault detection understandable.**

```text
Virtual engine
   +
Fault simulation
   +
Sensor telemetry
   +
Healthy physics reference
   +
ML anomaly and severity detection
   +
Interactive dashboard
   =
An explainable engine-health digital twin MVP
```
