# ✈️ AeroTwin: The Simple Guide to Our SIH Project
## An Easy-to-Understand Project Overview for Teammates, Mentors & Judges

> **Official Problem Statement:**  
> *"AI-Enabled Real-Time Digital Twin System for Health Monitoring, Fault Prediction and Mission Reliability Enhancement of Aero Piston Engines used in MALE UAVs."*  
> **Problem Statement ID:** PS 26054  
> **Team Product Name:** **AeroTwin**

---

## 1. What is this project in 1 minute?

Imagine a long-distance military or surveillance drone flying high up in the sky for 24 hours. There is no human pilot inside it. 

If a fuel nozzle gets clogged or the engine starts overheating in mid-air:
- Right now, people on the ground only find out **after the engine dies and the drone crashes**.
- Regular AI alert systems don't work well because when a drone climbs to high altitude (where the air is thin), the engine naturally runs slower, and normal AI panics and sounds **false alarms**.

**Our Solution (AeroTwin):**  
We built a **Digital Twin** (a live virtual copy of the engine running on a computer). It understands real-world physics, calculates how the engine *should* behave at any altitude, spots hidden mechanical damage early, and tells the pilot on the ground:
> *"Warning: Fuel injector is clogged and operating at 80% health. Here is why it happened and what you should do."*

---

## 2. Why is this a Big Deal? (The Core Innovation)

### The "Altitude Problem" (Why Other AI Fails):
1. When a drone flies at **15,000 feet**, the air has less oxygen.
2. Less oxygen means the engine produces less power, and engine speed (RPM) naturally drops from **2900 RPM down to 2600 RPM**.
3. A normal "black-box" AI sees the speed drop and thinks:  
   ❌ *"RPM dropped! The engine must be broken! Sound the emergency alarm!"* $\rightarrow$ **False Alarm!**

### How AeroTwin Solves This ("Physics Before AI"):
1. Our software first checks the altitude ($15,000\text{ ft}$) and calculates thin air using real atmospheric science.
2. It says: *"At 15,000 ft, a healthy engine is supposed to run at 2600 RPM."*
3. It checks the real drone: It is running at 2600 RPM.
4. **The Difference (Residual) = 0.**
5. ✅ **Result: NORMAL.** No false alarm is raised!

### What Happens When an Engine ACTUALLY Breaks?
1. The drone is at $10,000\text{ ft}$. A healthy engine should run at **2907 RPM**.
2. A fuel injector gets clogged, and the real engine drops to **2537 RPM**.
3. The software compares: $|2537 - 2907| = \mathbf{370\text{ RPM difference}}$.
4. The software knows thin air cannot explain a 370 RPM drop at 10,000 ft.
5. 🚨 **Result: ANOMALY DETECTED $\rightarrow$ 80% Injector Health.**

---

## 3. What Faults Can Our System Detect?

Our project simulates and detects the two most common engine problems:

### 🔴 Fault 1: Clogged Fuel Injector (Fuel Starvation)
- **What happens:** The fuel nozzle gets dirty and sprays 20% less fuel.
- **The chain reaction:** Less fuel $\rightarrow$ less power produced $\rightarrow$ engine slows down (RPM drops) $\rightarrow$ engine cools down $\rightarrow$ uneven cylinder firing makes the engine **vibrate**.
- **What our AI does:** Catches the power loss and vibration spike, reports an exact **80% Injector Health score**.

### 🔴 Fault 2: Broken Cooling System (Overheating)
- **What happens:** Radiator or cooling fins get damaged and lose 30% cooling power.
- **The chain reaction:** Heat cannot escape $\rightarrow$ Cylinder Head Temp (CHT) shoots past the danger line ($250^\circ\text{C}$) $\rightarrow$ engine oil overheats $\rightarrow$ oil gets watery-thin $\rightarrow$ **oil pressure collapses**.
- **What our AI does:** Warns the pilot before the engine melts from extreme heat.

---

## 4. How the Whole Project Works (Step-by-Step)

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│ 1. Flight Inputs│       │ 2. Virtual Copy │       │ 3. Compare Both │       │ 4. Pilot Screen │
│                 │       │                 │       │                 │       │                 │
│ Altitude,       │ ────► │ Calculates how  │ ────► │ Measures the gap│ ────► │ Live 3D engine, │
│ Throttle, &     │       │ a healthy engine│       │ (Residuals) and │       │ gauges, health  │
│ Sensor Readings │       │ SHOULD perform  │       │ detects damage  │       │ score & alerts  │
└─────────────────┘       └─────────────────┘       └─────────────────┘       └─────────────────┘
```

1. **Input Layer:** Takes the drone's altitude, throttle, and sensor data (RPM, temperatures, oil pressure, vibration).
2. **Physics Engine:** Simulates real 4-stroke engine mechanics and thermodynamics in real time.
3. **AI Diagnostics:** Compares real engine readings against the healthy virtual engine. If there is an unexplained gap, our machine learning model classifies the exact fault.
4. **Interactive Dashboard:** Shows everything on a clean web cockpit screen with an animated 3D engine and pilot explanations.

---

## 5. What is on the User's Screen? (The Dashboard)

When you open the web dashboard (`http://localhost:8501`), you see:

1. **Controls on the Left:**
   - Sliders to change Altitude (0 to 20,000 ft), Throttle (0 to 100%), and Temperature.
   - Buttons to test faults (e.g., click *"Injector Fault 80%"* or *"Cooling Fault 70%"*).
2. **Live 3D Engine in the Center:**
   - A fully animated 3D engine cutaway showing moving pistons, spinning crankshaft, and spinning propeller.
3. **Sensor Gauges along the Bottom:**
   - Shows live digital readouts: **RPM, Power (kW), Fuel Flow (L/h), Cylinder Temp (CHT), Oil Temp, Oil Pressure, and Exhaust Temp (EGT)**.
4. **AI Health Card on the Right:**
   - **Health Bar:** Shows overall score (e.g., $100\%$ Healthy vs $70\%$ Degraded).
   - **Status Badge:** 🟢 `NORMAL` vs 🚨 `ANOMALY DETECTED`.
   - **AI Explanation Box:** Explains the physical cause step-by-step so the pilot understands what went wrong.

---

## 6. How Good is the System? (The Results)

We tested our system on **450 full flight simulations** totaling **270,450 sensor readings**:

| Metric | What it Means | Our Score |
|:---|:---|:---:|
| **Detection Accuracy (ROC-AUC)** | How accurately it separates healthy engines from faulty ones | **1.0000 (100%)** |
| **Fault Recall** | Did it catch all real faults without missing any? | **100% (Never misses a fault)** |
| **False Alarm Rate** | Did it sound false alarms when altitude changed? | **0% (Zero false alarms)** |
| **Severity Levels** | Can it tell *how badly* the part is damaged? | **5 Levels (100%, 95%, 90%, 85%, 80%)** |

---

## 7. How to Run this Project on Any Computer

### Step 1: Install requirements
Open your terminal in the project folder and run:
```bash
pip install -r requirements.txt
pip install streamlit plotly matplotlib
```

### Step 2: Start the 3D Engine Server
```bash
cd torque-zero-main
npm install
npm run dev
```

### Step 3: Start the Web Dashboard
In another terminal window:
```bash
streamlit run dashboard.py
```
👉 Open your browser at **`http://localhost:8501`** and play with the live dashboard!

---

## 8. Common Questions & Simple Answers (FAQ)

### Q1: Is this just another generic AI model?
**Answer:** No. Generic AI models fail in aviation because they don't understand that climbing into thin air changes engine speed. Our system combines **real atmospheric physics with AI** so it never sounds false alarms.

### Q2: Why is this useful for defense and UAV companies?
**Answer:** UAVs fly far away where humans cannot inspect them. This software gives pilots early warning before an engine dies in mid-air, saving millions of dollars in drone crashes.

### Q3: Does this need internet or cloud servers?
**Answer:** No. The entire system runs locally on the computer, making it secure and ready for defense/military use.

### Q4: Can it connect to a real engine in the future?
**Answer:** Yes! The software is built to take live telemetry from standard aircraft CAN bus or sensor wires.

---

## 9. Summary for Presentations & Pitches

> **"AeroTwin is a smart virtual co-pilot for drone engines. By combining real flight physics with machine learning, it catches hidden engine damage early, ignores normal altitude changes, and explains exactly what is wrong so drones never crash unexpectedly."**

---
*Created for Smart India Hackathon (SIH 2027) | Problem Statement PS 26054*
