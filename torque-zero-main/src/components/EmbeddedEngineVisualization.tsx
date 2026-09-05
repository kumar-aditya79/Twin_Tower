import { useEffect, useMemo, useState } from "react"
import { EngineCanvas } from "@/components/EngineWorkbench"
import type { EngineQualities } from "@/audio/engineAudio"
import type { EngineSoundTuning } from "@/game/useCarTuning"

type DashboardEngineState = {
  rpm: number
  playing: boolean
  engineRunning: boolean
  resetToken: number
  missionTime?: number
  visualRpmScale?: number
  throttle: number
  chtC: number
  oilTempC: number
  injectorEfficiency: number
  thermalStatus: string
  faultType: string
}

const DEFAULT_STATE: DashboardEngineState = {
  rpm: 2500,
  playing: false,
  engineRunning: false,
  resetToken: 0,
  missionTime: 32,
  visualRpmScale: 0.12,
  throttle: 0.7,
  chtC: 75,
  oilTempC: 65,
  injectorEfficiency: 1,
  thermalStatus: "NORMAL",
  faultType: "None (Healthy)",
}

const EMBEDDED_TUNING: EngineSoundTuning = {
  cylinders: 6,
  displacementCuIn: 183,
  compressionRatio: 8.8,
  exhaustLengthIn: 32,
  pulseWidthDegrees: 26,
  exhaustResonance: 0.42,
  mechanicalNoise: 0.08,
  masterGain: 0,
  ignitionTimingDegrees: 18,
  volumetricEfficiency: 0.88,
  bankAngleDegrees: 0,
}

const finite = (value: unknown, fallback: number) => {
  const number = typeof value === "number" ? value : Number(value)
  return Number.isFinite(number) ? number : fallback
}

function normalizeState(value: unknown): DashboardEngineState {
  const incoming = value && typeof value === "object" ? value as Partial<DashboardEngineState> : {}
  return {
    rpm: Math.max(0, finite(incoming.rpm, DEFAULT_STATE.rpm)),
    playing: incoming.playing === true,
    engineRunning: incoming.engineRunning === true,
    resetToken: Math.max(0, Math.round(finite(incoming.resetToken, DEFAULT_STATE.resetToken))),
    missionTime: Math.max(0, finite(incoming.missionTime, DEFAULT_STATE.missionTime ?? 0)),
    visualRpmScale: Math.max(0.05, Math.min(1, finite(incoming.visualRpmScale, DEFAULT_STATE.visualRpmScale ?? 0.12))),
    throttle: Math.max(0, Math.min(1, finite(incoming.throttle, DEFAULT_STATE.throttle))),
    chtC: finite(incoming.chtC, DEFAULT_STATE.chtC),
    oilTempC: finite(incoming.oilTempC, DEFAULT_STATE.oilTempC),
    injectorEfficiency: Math.max(0, Math.min(1, finite(incoming.injectorEfficiency, DEFAULT_STATE.injectorEfficiency))),
    thermalStatus: typeof incoming.thermalStatus === "string" ? incoming.thermalStatus : DEFAULT_STATE.thermalStatus,
    faultType: typeof incoming.faultType === "string" ? incoming.faultType : DEFAULT_STATE.faultType,
  }
}

function qualitiesFor(state: DashboardEngineState): EngineQualities {
  const thermalStress = Math.max(0, (state.chtC - 75) / 175)
  const combustion = Math.max(0, Math.min(1, state.throttle * state.injectorEfficiency))
  const pressurePsi = 14.7 + combustion * 360 + thermalStress * 120
  const temperatureF = state.chtC * 9 / 5 + 32
  return {
    firingFrequencyHz: state.rpm * 6 / 120,
    exhaustFlow: combustion,
    torqueRipple: (1 - state.injectorEfficiency) * 0.35,
    crankAngleDegrees: ((state.missionTime ?? 0) * state.rpm * 12) % 720,
    airFlowCfm: state.rpm * combustion * 0.03,
    airFuelRatio: 14.7 - (1 - state.injectorEfficiency) * 3,
    intakePressurePsi: 4 + state.throttle * 10,
    exhaustTemperatureF: temperatureF + combustion * 900,
    cylinders: Array.from({ length: 6 }, (_, index) => ({
      phase: index / 6,
      pressurePsi,
      temperatureF,
      combustion,
      intakeValveLift: 0.5,
      exhaustValveLift: 0.5,
    })),
  }
}

export function EmbeddedEngineVisualization() {
  const [state, setState] = useState(DEFAULT_STATE)

  useEffect(() => {
    const receiveDashboardState = (event: MessageEvent) => {
      if (event.data?.type !== "digital-twin-engine-state") return
      setState(normalizeState(event.data.state))
    }
    window.addEventListener("message", receiveDashboardState)
    return () => window.removeEventListener("message", receiveDashboardState)
  }, [])

  const qualities = useMemo(() => qualitiesFor(state), [state])
  const statusColor = state.thermalStatus === "OVERHEAT" ? "#ef4444" : state.thermalStatus === "CAUTION" ? "#f59e0b" : "#10b981"

  return (
    <main className="min-h-screen bg-[#07070b] p-2 text-zinc-100">
      <div className="relative h-[430px] min-h-[300px] overflow-hidden rounded-lg">
        <EngineCanvas qualities={qualities} tuning={EMBEDDED_TUNING} rpm={state.rpm} rpmScale={state.visualRpmScale} isRunning={state.playing || state.engineRunning} resetToken={state.resetToken} />
        <div className="pointer-events-none absolute left-3 top-28 rounded bg-black/75 px-2 py-1 font-mono text-[10px] text-zinc-400 ring-1 ring-white/10">
          <span>{state.faultType === "None (Healthy)" ? "DIGITAL TWIN · HEALTHY" : `DIGITAL TWIN · ${state.faultType.toUpperCase()}`}</span>
          <span className="ml-3" style={{ color: statusColor }}>● {state.thermalStatus}</span>
          <span className="ml-3 text-zinc-400">{Math.round(state.rpm).toLocaleString()} RPM</span>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 rounded-lg bg-[#0b111e] p-2 font-mono text-[10px] ring-1 ring-white/10">
        <div className="rounded bg-white/5 p-2"><span className="text-zinc-500">THROTTLE</span><br /><strong className="text-cyan-300">{Math.round(state.throttle * 100)}%</strong></div>
        <div className="rounded bg-white/5 p-2"><span className="text-zinc-500">CHT</span><br /><strong className={state.chtC >= 250 ? "text-red-400" : "text-orange-300"}>{state.chtC.toFixed(1)}°C</strong></div>
        <div className="rounded bg-white/5 p-2"><span className="text-zinc-500">OIL TEMP</span><br /><strong className={state.oilTempC >= 145 ? "text-red-400" : "text-orange-300"}>{state.oilTempC.toFixed(1)}°C</strong></div>
      </div>
    </main>
  )
}
