# PS 26054 — Interactive 2D Digital Twin Simulation
## Pygame Visualization & Mission Control Implementation

> **Goal:** Upgrade the existing Aero-Piston Engine Digital Twin Pygame visualization from a passive CSV replay into an **interactive simulation interface** without changing the existing physics, ML, telemetry, or diagnostic core logic.

---

# 1. Objective

The current project already has:

- Physics-informed engine simulation
- Atmospheric/environment model
- Dynamic RPM response
- Thermal and auxiliary telemetry
- Injector degradation fault injection
- Telemetry dataset generation
- Physics-informed anomaly detection
- Injector health severity classification
- Serialized ML models
- Web/dashboard visualization
- Pygame 2D engine visualization

The next implementation step is to make the **Pygame simulation interactive**.

The Pygame layer should become a **visualization and control layer**, not a replacement for the existing Digital Twin.

### Critical rule

```text
DO NOT MODIFY THE CORE ENGINE LOGIC
DO NOT MODIFY THE ML MODELS
DO NOT RETRAIN THE MODELS
DO NOT CHANGE THE EXISTING TELEMETRY DEFINITIONS
```

Pygame should consume the existing simulation/telemetry/inference outputs.

---

# 2. Target Architecture

The architecture should remain simple:

```text
                 EXISTING CORE
┌─────────────────────────────────────────────┐
│ Atmosphere Model                             │
│ Engine Physics                               │
│ RK4 Simulation                               │
│ Thermal Models                               │
│ Fault Injection                              │
└──────────────────────┬──────────────────────┘
                       │
                       ▼
              Mission Telemetry
                       │
                       ▼
┌─────────────────────────────────────────────┐
│ Existing ML Inference                       │
│                                             │
│ Physics Estimator                           │
│ Anomaly Classifier                          │
│ Severity Classifier                         │
└──────────────────────┬──────────────────────┘
                       │
                       ▼
              Diagnostic State
                       │
                       ▼
┌─────────────────────────────────────────────┐
│              PYGAME UI LAYER                │
│                                             │
│ Controls                                    │
│ Engine Animation                            │
│ Telemetry                                   │
│ Timeline                                    │
│ Graphs                                      │
│ Fault visualization                         │
└─────────────────────────────────────────────┘
```

The important principle is:

> **Pygame visualizes the Digital Twin. It does not become the Digital Twin.**

---

# 3. Current Pygame Prototype

The current prototype already demonstrates:

```text
AERO-PISTON ENGINE DIGITAL TWIN

        Propeller
           │
           ▼
   ┌───────────────────┐
   │ P1 │ P2 │ P3 │ P4 │
   │    CYLINDERS      │
   └───────────────────┘
           │
        Crankshaft
           │
           ▼
       Telemetry
```

It already shows:

- 4 cylinders
- Piston movement
- Combustion animation
- Crankshaft rotation
- Propeller rotation
- RPM
- Brake power
- Injector efficiency
- Mission timeline
- 30-second injector fault marker

The next step is to add **user interaction and richer visual feedback**.

---

# 4. Installation

From the project root:

```bash
pip install pygame
```

If the project uses a requirements file, add:

```text
pygame
```

Do not remove existing dependencies.

---

# 5. Recommended File Structure

Use a dedicated visualization directory.

```text
SIH2027/
│
├── Engine/
│   ├── atmosphere.py
│   ├── engine.py
│   └── simulation.py
│
├── ml/
│   ├── models/
│   │   ├── physics_estimator.joblib
│   │   ├── anomaly_classifier.joblib
│   │   ├── severity_classifier.joblib
│   │   └── scaler.joblib
│   │
│   ├── digital_twin_inference.py
│   └── ...
│
├── data/
│   ├── engine_telemetry_dataset.csv
│   ├── healthy_telemetry.csv
│   └── degraded_injector_telemetry.csv
│
├── plots/
│
├── visualization/
│   ├── __init__.py
│   ├── pygame_engine.py
│   ├── pygame_ui.py
│   ├── pygame_controls.py
│   ├── pygame_graphs.py
│   └── pygame_theme.py
│
├── run_digital_twin.py
├── ...
│
└── README.md
```

If the current Pygame implementation is already in another file, do not rewrite it immediately. Refactor only when necessary.

---

# 6. Phase 1 — Preserve Existing Replay

Before adding interaction, make sure the current replay still works.

Run:

```bash
python <current_pygame_file>.py
```

Verify:

- Window opens
- Engine renders
- Pistons animate
- Propeller rotates
- Mission time advances
- Telemetry updates
- Injector value changes
- 30-second fault marker is visible
- 60-second mission completes

### Acceptance criteria

The old behavior must remain unchanged.

If something breaks here, stop and fix it before adding controls.

---

# 7. Phase 2 — Separate Simulation State From UI State

Create a small state object for the visualization.

Example:

```python
class SimulationState:
    time_s = 0.0
    duration_s = 60.0

    rpm = 0.0
    power_kw = 0.0
    injector_efficiency = 1.0

    anomaly_probability = 0.0
    health_index = 100
    severity = "Healthy"
    severity_confidence = 0.0

    playing = True
    speed_multiplier = 1.0
```

This is **visualization state**.

Do not duplicate the engine physics inside this class.

---

# 8. Phase 3 — Add Playback Controls

The first interactive feature should be playback.

Required controls:

```text
┌───────────────────────────────────┐
│ PLAY      PAUSE      RESET        │
└───────────────────────────────────┘
```

Keyboard shortcuts:

```text
SPACE  → Play / Pause
R      → Reset mission
ESC    → Exit
```

Optional:

```text
1 → 0.5× speed
2 → 1× speed
3 → 2× speed
```

The simulation should use delta time rather than tying animation to the computer's frame rate.

Conceptually:

```python
simulation_time += dt * speed_multiplier
```

Do not replace the underlying simulation time with frame count.

---

# 9. Phase 4 — Add Interactive Mission Timeline

Add a timeline at the bottom:

```text
0 s ─────────────────────────────── 60 s
                  ▲
                30 s
          INJECTOR FAULT
```

The user should be able to click/drag the timeline.

Example:

```text
User drags slider
       ↓
Selected mission time
       ↓
Corresponding telemetry row
       ↓
Pygame visualization updates
```

This is extremely useful for the hackathon demonstration because the judge can immediately move between:

```text
15 s → Healthy
30 s → Fault onset
45 s → Degraded
60 s → Final state
```

---

# 10. Phase 5 — Mission Scrubbing

Implement a function such as:

```python
set_mission_time(time_s)
```

It should:

1. Clamp time between 0 and mission duration.
2. Find the corresponding telemetry sample.
3. Update displayed telemetry.
4. Update engine animation.
5. Update diagnostic state.
6. Update graphs.
7. Update fault indicator.

Example:

```python
time_s = max(0.0, min(time_s, duration_s))
```

Do not calculate new ML predictions inside the rendering loop if the telemetry already contains the required inference result.

---

# 11. Phase 6 — Add Live Telemetry Cards

Display important values clearly.

Recommended layout:

```text
┌──────────────┐ ┌──────────────┐
│ RPM          │ │ BRAKE POWER  │
│ 2907         │ │ 31.5 kW      │
└──────────────┘ └──────────────┘

┌──────────────┐ ┌──────────────┐
│ EGT          │ │ CHT          │
│ 777.7 °C     │ │ 189.4 °C     │
└──────────────┘ └──────────────┘

┌──────────────┐ ┌──────────────┐
│ OIL TEMP     │ │ OIL PRESSURE │
│ 100.9 °C     │ │ 3.62 bar     │
└──────────────┘ └──────────────┘

┌──────────────┐ ┌──────────────┐
│ VIBRATION    │ │ INJECTOR     │
│ 2.02 g       │ │ 100 %        │
└──────────────┘ └──────────────┘
```

Prioritize:

1. RPM
2. Brake power
3. Injector efficiency
4. EGT
5. CHT
6. Oil temperature
7. Oil pressure
8. Vibration

---

# 12. Phase 7 — Interactive Engine Animation

The existing engine animation should become telemetry-driven.

## Piston movement

Piston position can be represented using a normalized crank angle.

Conceptually:

```text
Crankshaft angle
       ↓
Piston position
       ↓
Piston animation
```

Do not introduce a second engine model.

The animation should only visualize the existing rotational state.

---

# 13. Propeller Animation

The propeller should rotate according to RPM.

Conceptually:

```python
propeller_angle += rpm_to_visual_speed(rpm) * dt
```

Higher RPM:

```text
Healthy
████████████████
```

Lower RPM:

```text
Degraded
████████████
```

The visual rotation should change smoothly.

Do not attempt to model real propeller aerodynamics.

This is a visualization.

---

# 14. Phase 8 — Visualize Injector Degradation

The injector is the fault being demonstrated in the current MVP.

Healthy:

```text
INJECTOR
100%
🟢
```

Degraded:

```text
INJECTOR
80%
🔴
```

The engine visualization can show fuel injection pulses.

Healthy:

```text
P1  ● ● ● ●
P2  ● ● ● ●
P3  ● ● ● ●
P4  ● ● ● ●
```

Degraded:

```text
P1  ● ●
P2  ● ●
P3  ●
P4  ● ●
```

This is only a visual representation.

Do not change the underlying injector model.

---

# 15. Phase 9 — Fault Onset Visualization

At approximately:

```text
t = 30 s
```

trigger a clear visual event.

Recommended:

```text
⚡ INJECTOR DEGRADATION
```

Then transition:

```text
NORMAL
   ↓
FAULT ONSET
   ↓
ANOMALY DETECTED
```

Avoid instantly flashing the entire screen red.

Use a controlled transition:

```text
30 s
│
├── Injector degradation begins
│
├── RPM begins falling
│
├── Brake power falls
│
├── EGT changes
│
├── Vibration changes
│
└── ML anomaly status activates
```

This makes the cause-and-effect story visible.

---

# 16. Phase 10 — Diagnostic Status Panel

Add a dedicated health panel.

Healthy:

```text
┌─────────────────────────────┐
│ 🟢 ENGINE HEALTH            │
│                             │
│ NORMAL OPERATING STATE      │
│                             │
│ Anomaly Probability: 0.0%   │
│ Health Index: 100 / 100     │
│ Severity: Healthy           │
└─────────────────────────────┘
```

Fault:

```text
┌─────────────────────────────┐
│ 🚨 ENGINE HEALTH            │
│                             │
│ ANOMALY DETECTED            │
│                             │
│ Anomaly Probability: 100%   │
│ Health Index: 80 / 100      │
│ Severity: 80% Injector      │
│ Confidence: 100%            │
└─────────────────────────────┘
```

The diagnostic values must come from the existing inference pipeline.

---

# 17. Phase 11 — Add "Why?" Explainability Panel

This is one of the highest-value presentation features.

When an anomaly occurs:

```text
WHY WAS ANOMALY DETECTED?

RPM                 ↓
Brake Power         ↓
EGT                 ↓
Vibration           ↑

Primary deviation:
RPM residual

Supporting signals:
Power residual
EGT residual
Vibration residual
```

Then show:

```text
INJECTOR DEGRADATION
        ↓
Fuel delivery changes
        ↓
Combustion changes
        ↓
Torque changes
        ↓
RPM changes
        ↓
Telemetry deviation
        ↓
ANOMALY DETECTED
```

This makes the system explainable instead of looking like a black-box classifier.

---

# 18. Phase 12 — Add Live Graphs

Add compact graphs inside the Pygame window.

Recommended graphs:

### RPM

```text
RPM
│  ────────────╲
│               ╲
│                ─────────
└──────────────────────────
              30 s
```

### Brake Power

```text
Power
│  ────────────╲
│               ╲────────
│
└──────────────────────────
              30 s
```

### Vibration

```text
Vibration
│              ╱────────
│  ───────────╱
│
└──────────────────────────
              30 s
```

### Injector Efficiency

```text
100% ─────────────────┐
                      │
 80%                  └────────
     ──────────────────────────
              30 s
```

Do not create complicated scientific plots.

The goal is:

> **A judge should understand the graph in two seconds.**

---

# 19. Phase 13 — Add Fault Event Marker

On every graph, show:

```text
│
│
│        ⚡ FAULT
│        30 s
│        │
└────────┼────────────────────
         30s
```

This makes the correlation between fault injection and telemetry change immediately visible.

---

# 20. Phase 14 — Add Scenario Controls

Once basic interaction works, add optional controls.

### Mission

```text
MISSION

[ Healthy Mission       ▼ ]
[ Degraded Injector     ▼ ]
```

### Throttle

```text
THROTTLE

50% ─────●──────── 100%
         70%
```

### Altitude

```text
ALTITUDE

0 ft ───────●────── 20,000 ft
           10,000
```

### Important

These controls should only modify inputs if the underlying simulator already supports dynamic input changes.

If the current simulator only supports pre-generated CSV replay:

**do not fake a live physics simulation.**

Instead, implement mission selection/replay first.

---

# 21. Phase 15 — Add Mission Presets

For presentations, add presets:

```text
┌─────────────────────────────┐
│ DEMO SCENARIOS              │
│                             │
│ 1. Healthy Cruise           │
│ 2. Injector 95%             │
│ 3. Injector 90%             │
│ 4. Injector 85%             │
│ 5. Injector 80%             │
└─────────────────────────────┘
```

This allows the team to quickly demonstrate multiple severity levels.

---

# 22. Phase 16 — Healthy vs Fault Comparison Mode

Add a presentation mode:

```text
HEALTHY                    DEGRADED

RPM                         RPM
2907                        2537

POWER                       POWER
31.5 kW                     20.9 kW

VIBRATION                   VIBRATION
2.02 g                      2.31 g

INJECTOR                    INJECTOR
100%                        80%
```

At the bottom:

```text
FAULT EFFECT

RPM          ↓
POWER        ↓
EGT          ↓
VIBRATION    ↑
```

This should become one of the strongest visual elements of the demo.

---

# 23. Phase 17 — Keyboard Shortcuts

Recommended shortcuts:

```text
SPACE      Play / Pause
R          Reset
LEFT       Previous sample / rewind
RIGHT      Next sample / forward
HOME       Mission start
END        Mission end

1          0.5× playback
2          1× playback
3          2× playback

H          Healthy preset
F          Fault preset

E          Explainability panel
G          Graph view

ESC        Exit
```

Display shortcuts inside a small help panel:

```text
[?] Controls
SPACE Play/Pause
R Reset
← → Scrub
H Healthy
F Fault
```

---

# 24. Phase 18 — Animation Quality

The Pygame UI should look like a professional engineering demonstrator.

Use:

- Dark background
- Consistent typography
- Clear hierarchy
- Rounded panels
- Thin borders
- Limited accent colors
- Smooth animation
- Consistent spacing
- Large important numbers
- Small technical labels

Suggested semantic colors:

```text
NORMAL      → Green
WARNING     → Amber
ANOMALY     → Red
INFORMATION → Cyan/Blue
TELEMETRY   → Light/neutral
```

Do not overuse red.

Red should mean something.

---

# 25. Phase 19 — Smooth State Transitions

Avoid abrupt UI changes where possible.

For example:

```text
100% → 80%
```

can visually transition.

Likewise:

```text
NORMAL → ANOMALY
```

can use:

```text
NORMAL
  ↓
WARNING
  ↓
ANOMALY
```

However, the actual diagnostic state must remain exactly what the ML pipeline reports.

Only the visual transition is animated.

---

# 26. Phase 20 — Performance

Target:

```text
60 FPS
```

The rendering loop should not repeatedly:

- Load CSV files
- Load joblib models
- Train ML models
- Recalculate the entire dataset
- Run expensive filesystem operations

Load data/models once during initialization.

Recommended flow:

```python
initialize()
    ↓
load telemetry
    ↓
load models if required
    ↓
initialize UI
    ↓
game loop
```

Game loop:

```python
handle_events()
update_simulation_state()
update_animation()
draw_ui()
draw_engine()
draw_graphs()
pygame.display.flip()
```

---

# 27. Do Not Put ML Training Inside Pygame

This is extremely important.

Never do:

```python
RandomForestClassifier(...)
model.fit(...)
```

inside the Pygame loop.

Training happens beforehand.

The Pygame application should only perform:

```text
LOAD
 ↓
INFER / READ
 ↓
DISPLAY
```

---

# 28. Recommended Data Flow

For CSV replay:

```text
CSV
 ↓
pandas.read_csv()
 ↓
Telemetry dataframe
 ↓
current_time index
 ↓
current telemetry row
 ↓
diagnostic state
 ↓
Pygame rendering
```

For serialized inference:

```text
Telemetry
 ↓
DigitalTwinInferenceEngine
 ↓
anomaly probability
 ↓
severity
 ↓
health index
 ↓
Pygame UI
```

Use the existing `DigitalTwinInferenceEngine`.

Do not recreate the ML pipeline inside the visualization code.

---

# 29. Handling Mission Time

The mission is currently approximately:

```text
0–60 seconds
```

Recommended mapping:

```text
CSV time → mission time
```

When playing:

```python
mission_time += dt * playback_speed
```

When scrubbing:

```python
mission_time = slider_position
```

Then locate the nearest telemetry sample.

For example:

```python
idx = np.abs(time_array - mission_time).argmin()
row = telemetry.iloc[idx]
```

---

# 30. Fault State Logic

The visualization should not independently decide that the engine is faulty based only on:

```python
if time > 30:
    anomaly = True
```

That would undermine the ML demonstration.

The timeline can show:

```text
30 s = known simulated fault injection point
```

But the displayed diagnostic status should come from the existing anomaly inference.

This lets you demonstrate:

```text
KNOWN SIMULATION EVENT
        ↓
Physical telemetry response
        ↓
ML detects deviation
        ↓
Diagnostic alarm
```

That distinction is important.

---

# 31. Fault Injection Visualization

At fault onset:

```text
t = 30.0 s

⚡ INJECTOR DEGRADATION
```

Then allow the telemetry to evolve naturally.

Example:

```text
Healthy
RPM = 2907
Power = 31.5 kW
Injector = 100%

        ↓

Injector degradation

        ↓

RPM = 2550+
Power = ~21 kW
Injector = 80%

        ↓

ML

ANOMALY DETECTED
```

Do not artificially modify RPM or power in the Pygame layer.

Those values must come from the telemetry/simulation.

---

# 32. Testing Checklist

## Basic startup

- [ ] Pygame opens
- [ ] No exceptions
- [ ] Engine renders
- [ ] UI renders
- [ ] CSV loads

## Playback

- [ ] Start works
- [ ] Pause works
- [ ] Reset works
- [ ] Playback speed works
- [ ] Mission reaches 60 s

## Timeline

- [ ] Slider moves
- [ ] Mission time updates
- [ ] Telemetry changes
- [ ] Engine animation changes
- [ ] Graph position changes

## Healthy state

At approximately:

```text
t = 15 s
```

verify:

```text
Injector ≈ 100%
Status = NORMAL
```

## Fault state

At approximately:

```text
t = 45 s
```

verify:

```text
Injector ≈ 80%
Status = ANOMALY
```

The exact telemetry values should come from the existing dataset.

## Diagnostic

- [ ] Anomaly probability displayed
- [ ] Health index displayed
- [ ] Severity displayed
- [ ] Confidence displayed
- [ ] Explainability panel updates

---

# 33. Presentation Test

Before the hackathon, perform this exact sequence.

### Step 1

Start application.

### Step 2

Show:

```text
Healthy Engine
```

At:

```text
t ≈ 15 s
```

Explain:

> "This is the normal operating state of the digital twin."

### Step 3

Start playback.

### Step 4

Approach:

```text
30 s
```

Say:

> "At this point, we intentionally inject an injector degradation fault."

### Step 5

Let the engine continue.

Show:

```text
RPM ↓
Power ↓
EGT ↓
Vibration ↑
```

### Step 6

Show:

```text
ANOMALY DETECTED
```

### Step 7

Show:

```text
80% Injector Health
100% Confidence
```

### Step 8

Open explainability:

```text
Injector degradation
        ↓
Fuel delivery
        ↓
Combustion
        ↓
Torque
        ↓
RPM / Power
        ↓
Telemetry residual
        ↓
Anomaly
```

This should take approximately:

```text
60–90 seconds
```

---

# 34. What NOT To Implement

For this stage, do not build:

- CFD
- Full combustion chemistry
- Real propeller aerodynamics
- 3D CAD engine
- Full aircraft flight dynamics
- Hardware CAN integration
- Deep-learning architecture
- New ML models
- RUL prediction
- Fleet management
- Cloud infrastructure
- Multiplayer visualization

The existing MVP should remain focused.

---

# 35. Definition of Done

The interactive Pygame simulation is complete when:

```text
[✓] Existing simulation still works

[✓] Mission can be played/paused

[✓] Mission can be reset

[✓] Mission can be scrubbed

[✓] Engine animation responds to telemetry

[✓] Propeller responds to RPM

[✓] Injector state is visually represented

[✓] Fault onset is clearly marked

[✓] Telemetry updates in real time

[✓] Diagnostic status updates

[✓] Anomaly probability displayed

[✓] Health index displayed

[✓] Severity displayed

[✓] Severity confidence displayed

[✓] Healthy vs degraded behavior visible

[✓] Graphs show telemetry trends

[✓] Explainability panel shows cause → effect

[✓] No core physics logic modified

[✓] No ML model modified

[✓] Demo can be operated without editing code
```

---

# 36. Final Target UI

The final Pygame application should roughly communicate:

```text
┌───────────────────────────────────────────────────────────────┐
│              AERO-PISTON ENGINE DIGITAL TWIN                 │
│       REAL-TIME MISSION SIMULATION & DIAGNOSTICS             │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│   ENGINE VISUALIZATION             DIAGNOSTIC STATUS          │
│                                                               │
│      P1   P2   P3   P4             🟢 NORMAL                  │
│      │    │    │    │                                         │
│      ▼    ▼    ▼    ▼             Anomaly: 0.0%              │
│     ┌──────────────┐               Health: 100/100            │
│     │  CYLINDERS   │               Severity: Healthy          │
│     └──────────────┘               Confidence: 75.5%          │
│                                                               │
├───────────────────────────────────────────────────────────────┤
│ RPM       POWER       EGT       CHT       OIL       VIBRATION │
│ 2907      31.5kW      777°C     189°C     3.62bar   2.02g    │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│                 LIVE TELEMETRY GRAPHS                        │
│                                                               │
│ RPM ────────────────╲                                        │
│                      ╲────                                     │
│ POWER ───────────────╲                                        │
│                                                               │
├───────────────────────────────────────────────────────────────┤
│ 0s ────────────────⚡──────────────────────────────────── 60s │
│                     30s                                      │
│                INJECTOR FAULT                                │
├───────────────────────────────────────────────────────────────┤
│ [▶ PLAY] [Ⅱ PAUSE] [↻ RESET]       Speed: 1×       [? HELP] │
└───────────────────────────────────────────────────────────────┘
```

---

# 37. Implementation Order

Implement strictly in this order:

```text
PHASE 1
Current replay
      ↓
PHASE 2
State management
      ↓
PHASE 3
Play / Pause / Reset
      ↓
PHASE 4
Timeline slider
      ↓
PHASE 5
Mission scrubbing
      ↓
PHASE 6
Telemetry cards
      ↓
PHASE 7
Engine animation driven by telemetry
      ↓
PHASE 8
Injector visualization
      ↓
PHASE 9
Fault onset indicator
      ↓
PHASE 10
Diagnostic status
      ↓
PHASE 11
Explainability
      ↓
PHASE 12
Live graphs
      ↓
PHASE 13
Healthy vs degraded comparison
      ↓
PHASE 14
Scenario presets
      ↓
PHASE 15
Presentation polish
```

---

# 38. Most Important Engineering Rule

Keep this boundary clear:

```text
              CORE LOGIC
                   │
                   │
                   ▼
          ┌─────────────────┐
          │ Telemetry State │
          └────────┬────────┘
                   │
                   ▼
          ┌─────────────────┐
          │ Pygame Renderer │
          └─────────────────┘
```

The renderer can read the Digital Twin.

The renderer can control replay.

The renderer can select mission time.

The renderer can display diagnostics.

But:

> **The renderer must never secretly become another physics engine or another ML system.**

---

# 39. Hackathon Objective

The purpose of this implementation is not to create a mechanically accurate 3D engine.

The purpose is to make the existing Digital Twin **immediately understandable to a judge**.

A successful demonstration should visually communicate:

```text
ENGINE OPERATING NORMALLY
          ↓
FAULT IS INTRODUCED
          ↓
ENGINE RESPONSE CHANGES
          ↓
TELEMETRY DEVIATES
          ↓
AI DETECTS ANOMALY
          ↓
AI ESTIMATES SEVERITY
          ↓
SYSTEM EXPLAINS THE FAULT
```

If a judge can understand that chain without reading the source code, the visualization layer has done its job.

---

# 40. Next Immediate Task

Do **not** implement everything at once.

Start with:

```text
1. Play / Pause
2. Reset
3. Timeline slider
4. Mission scrubbing
5. Telemetry synchronization
```

Test these completely.

Then add:

```text
6. Graphs
7. Diagnostic panel
8. Explainability
9. Healthy/Fault comparison
10. Presentation polish
```

This keeps the implementation incremental and makes debugging much easier.

---

## Final Principle

The original Digital Twin remains the source of truth.

Pygame is the **interactive visual window into that Digital Twin**.

```text
PHYSICS
   +
TELEMETRY
   +
ML DIAGNOSTICS
   +
INTERACTIVE VISUALIZATION
   =
A PRESENTATION-READY DIGITAL TWIN
```
