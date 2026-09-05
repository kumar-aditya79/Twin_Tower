import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { CarFront, Gauge, LoaderCircle, RotateCcw, Volume2, VolumeX, Wrench } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DynoChart } from "@/components/DynoChart"
import { InstrumentCluster } from "@/components/InstrumentCluster"
import { EngineWorkbench } from "@/components/EngineWorkbench"
import { MobileDriveControls } from "@/components/MobileDriveControls"
import { TrackScene } from "@/components/TrackScene"
import { EngineAudioController } from "@/audio/engineAudio"
import { CARS, peakStats, type CarSpec } from "@/game/cars"
import { fetchCommunityEngine, type CommunityEngineProfile } from "@/game/communityEngine"
import { modelAssetFromFile, modelAssetFromSketchfabDownload, validateSketchfabDownload, type ImportedModelAsset, type ModelImportProgress } from "@/game/modelImports"
import { initialTelemetry, stepPhysics, type DriveDirection, type DriverInput, type PhysicsInput, type Telemetry, type TransmissionMode } from "@/game/physics"
import { requestSketchfabDownload, warmSketchfabSession } from "@/game/sketchfabImporter"
import { useCarTuning } from "@/game/useCarTuning"
import { useImportControls } from "@/game/useImportControls"
import { accelerationBenchmark, displayDistance, displaySpeed, displayTorque } from "@/game/units"
import { cn } from "@/lib/utils"

const emptyInput: DriverInput = {
  throttle: false,
  reverse: false,
  brake: false,
  left: false,
  right: false,
  clutch: false,
  smooth: false,
  steeringAxis: 0,
  throttleAxis: 0,
  brakeAxis: 0,
}

const VEHICLE_PHYSICS_FREQUENCY = 120
const COMMUNITY_ENGINES_STORAGE_KEY = "torque-zero:community-engines"

type ClutchMode = "manual" | "automatic"
type DigitalInputKey = Exclude<keyof DriverInput, "steeringAxis" | "throttleAxis" | "brakeAxis">
type ShiftAction =
  | { kind: "gear"; direction: -1 | 1 }
  | { kind: "range"; driveDirection: DriveDirection }
type PendingShift = {
  mode: ClutchMode
  action: ShiftAction
  phase: "disengaging" | "matching" | "engaging"
  targetRpm?: number
}
type ModelImportState = { label: string; percent?: number }
type BenchmarkAppWindow = Window & { __torqueZeroApp?: { inputRef: React.MutableRefObject<DriverInput>; telemetryRef: React.MutableRefObject<Telemetry> } }

const CLUTCH_OPEN_THRESHOLD = 0.1
const CLUTCH_LOCKED_THRESHOLD = 0.98

const progressRatio = (loadedBytes?: number, totalBytes?: number) => totalBytes && loadedBytes !== undefined
  ? Math.max(0, Math.min(1, loadedBytes / totalBytes))
  : undefined

function withShiftedGear(telemetry: Telemetry, direction: -1 | 1, gearCount: number) {
  const gear = Math.max(0, Math.min(gearCount - 1, telemetry.gear + direction))
  return gear === telemetry.gear ? telemetry : { ...telemetry, gear }
}

function withAppliedShift(telemetry: Telemetry, action: ShiftAction, gearCount: number) {
  return action.kind === "gear"
    ? withShiftedGear(telemetry, action.direction, gearCount)
    : { ...telemetry, gear: 0, driveDirection: action.driveDirection }
}

function rpmForGear(telemetry: Telemetry, gear: number, car: CarSpec, wheelRadiusMeters: number) {
  const rangeAlignedSpeedMps = Math.max(0, telemetry.signedForwardSpeedMps * telemetry.driveDirection)
  const wheelRpm = (rangeAlignedSpeedMps / (2 * Math.PI * Math.max(0.01, wheelRadiusMeters))) * 60
  const gearRatio = telemetry.driveDirection === -1 ? car.reverseGear : car.gears[gear]
  return Math.max(car.idleRpm, Math.min(car.redline, wheelRpm * gearRatio * car.finalDrive))
}

const loadCommunityEngines = () => {
  try {
    return JSON.parse(localStorage.getItem(COMMUNITY_ENGINES_STORAGE_KEY) ?? "{}") as Record<string, CommunityEngineProfile>
  } catch {
    return {}
  }
}

const keyMap: Record<string, DigitalInputKey> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  a: "throttle",
  s: "brake",
  Shift: "clutch",
  " ": "smooth",
}

function Metric({ label, value, suffix, accent }: { label: string; value: string; suffix?: string; accent?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="truncate font-mono text-base text-zinc-500 sm:text-sm">{label}</p>
      <p className={cn("truncate font-display text-2xl font-semibold tabular-nums tracking-tight text-white", accent && "text-cyan-300")}>
        {value}{suffix && <span className="font-mono text-zinc-500"> {suffix}</span>}
      </p>
    </div>
  )
}

function CarSelector({ active, onSelect }: { active: CarSpec; onSelect: (car: CarSpec) => void }) {
  return (
    <section aria-labelledby="garage-title">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-base tracking-wide text-zinc-500 sm:text-sm">INSTANT GARAGE</p>
          <h2 id="garage-title" className="text-balance font-display text-xl font-semibold text-white">Choose an engine character</h2>
        </div>
        <p className="shrink-0 font-mono text-base text-zinc-500 max-sm:hidden sm:text-sm">1 / 2 / 3</p>
      </div>
      <div className="@container mt-3">
        <div className="grid gap-2 @lg:grid-cols-3" role="list">
          {CARS.map((car, index) => {
            const peaks = peakStats(car)
            const selected = active.id === car.id
            return (
              <button
                type="button"
                key={car.id}
                onClick={() => onSelect(car)}
                aria-pressed={selected}
                className={cn(
                  "relative min-w-0 rounded-md bg-white/3 p-3 text-left ring-1 ring-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400",
                  "hover:bg-white/7",
                  selected && "bg-white/9 ring-2 ring-(--car-color)",
                )}
                style={{ "--car-color": car.color } as React.CSSProperties}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-display text-lg font-semibold text-white">{car.name}</p>
                    <p className="truncate font-mono text-base text-zinc-500 sm:text-sm">{car.className}</p>
                  </div>
                  <p className="shrink-0 font-mono text-base text-zinc-600 sm:text-sm">0{index + 1}</p>
                </div>
                <div className="mt-3 flex gap-4 font-mono text-base tabular-nums sm:text-sm">
                  <p className="text-pink-400">{Math.round(displayTorque(peaks.torque))} lb-ft</p>
                  <p className="text-cyan-300">{peaks.hp} hp</p>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}

export function App() {
  const [view, setView] = useState<"drive" | "workbench">("drive")
  const [car, setCar] = useState(CARS[1])
  const {
    tunedCar,
    physics,
    vehicleDynamics,
    bodyMotion,
    engineSound,
    tachInnerArc,
    tachOuterArcDelta,
    tachLowBarWidth,
    tachHighBarWidth,
    tachBarGap,
    applyEngineProfile,
    resetEngine,
    resetCurrentVersion: resetCurrentTuningVersion,
  } = useCarTuning(car)
  const [transmission, setTransmission] = useState<TransmissionMode>("manual")
  const [clutchMode, setClutchMode] = useState<ClutchMode>("manual")
  const [shiftFeedback, setShiftFeedback] = useState<string | null>(null)
  const [simulationFrequency, setSimulationFrequency] = useState<number>(() => loadCommunityEngines()[CARS[1].id]?.simulationFrequency ?? 10000)
  const [engineAudio] = useState(() => new EngineAudioController())
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [soundLoading, setSoundLoading] = useState(false)
  const defaultSoundStartedRef = useRef(false)
  const [engineQualities, setEngineQualities] = useState(() => engineAudio.getEngineQualities())
  const telemetryRef = useRef<Telemetry>(initialTelemetry(tunedCar))
  const physicsRef = useRef(physics)
  const vehicleDynamicsRef = useRef(vehicleDynamics)
  const bodyMotionRef = useRef(bodyMotion)
  const inputRef = useRef<DriverInput>({ ...emptyInput })
  const [telemetry, setTelemetry] = useState(() => initialTelemetry(tunedCar))
  const [engineProfiles, setEngineProfiles] = useState<Record<string, CommunityEngineProfile>>(loadCommunityEngines)
  const [customModels, setCustomModels] = useState<Record<string, ImportedModelAsset>>({})
  const [modelImport, setModelImport] = useState<ModelImportState | null>(null)
  const [resetVersion, setResetVersion] = useState(0)
  const customModelsRef = useRef(customModels)
  const modelFileInputRef = useRef<HTMLInputElement>(null)
  const setImportStatusRef = useRef<(status: string) => void>(() => undefined)
  const pendingShiftRef = useRef<PendingShift | null>(null)
  const shiftFeedbackTimerRef = useRef<number | null>(null)
  const modelImportTimerRef = useRef<number | null>(null)
  const engineImportVersionRef = useRef(0)
  const modelImportVersionRef = useRef(0)

  const updateModelImportProgress = useCallback((progress: ModelImportProgress) => {
    const ratio = progressRatio(progress.loadedBytes, progress.totalBytes)
    if (progress.phase === "reading") {
      setModelImport({ label: "READING MODEL FILE", percent: ratio === undefined ? undefined : 5 + ratio * 25 })
    } else if (progress.phase === "downloading") {
      setModelImport({ label: "DOWNLOADING MODEL", percent: ratio === undefined ? undefined : 25 + ratio * 55 })
    } else if (progress.phase === "unpacking") {
      setModelImport({ label: "UNPACKING MODEL", percent: 86 })
    } else {
      setModelImport({ label: "PREPARING MATERIALS", percent: 92 })
    }
  }, [])

  const finishModelImport = useCallback(() => {
    if (modelImportTimerRef.current !== null) window.clearTimeout(modelImportTimerRef.current)
    setModelImport({ label: "MODEL READY", percent: 100 })
    modelImportTimerRef.current = window.setTimeout(() => {
      modelImportTimerRef.current = null
      setModelImport(null)
    }, 900)
  }, [])

  const failModelRender = useCallback(() => {
    if (modelImportTimerRef.current !== null) window.clearTimeout(modelImportTimerRef.current)
    modelImportTimerRef.current = null
    setModelImport(null)
    setImportStatusRef.current("Model downloaded, but its glTF scene could not be rendered")
  }, [])

  const clearShiftFeedback = useCallback(() => {
    if (shiftFeedbackTimerRef.current !== null) window.clearTimeout(shiftFeedbackTimerRef.current)
    shiftFeedbackTimerRef.current = null
    setShiftFeedback(null)
  }, [])

  const showShiftFeedback = useCallback((message: string, duration = 900) => {
    if (shiftFeedbackTimerRef.current !== null) window.clearTimeout(shiftFeedbackTimerRef.current)
    setShiftFeedback(message)
    shiftFeedbackTimerRef.current = window.setTimeout(() => {
      shiftFeedbackTimerRef.current = null
      setShiftFeedback(null)
    }, duration)
  }, [])

  const replaceCustomModel = useCallback((carId: string, asset: ImportedModelAsset) => {
    customModelsRef.current[carId]?.revoke()
    customModelsRef.current = { ...customModelsRef.current, [carId]: asset }
    setCustomModels(customModelsRef.current)
  }, [])

  const resetDefaultModel = useCallback(() => {
    modelImportVersionRef.current += 1
    if (modelImportTimerRef.current !== null) window.clearTimeout(modelImportTimerRef.current)
    modelImportTimerRef.current = null
    customModelsRef.current[car.id]?.revoke()
    const nextModels = { ...customModelsRef.current }
    delete nextModels[car.id]
    customModelsRef.current = nextModels
    setCustomModels(nextModels)
    setModelImport(null)
    setImportStatusRef.current(`Restored ${car.name}'s default model`)
  }, [car.id, car.name])

  const applyCommunityEngine = useCallback(async (url: string) => {
    const importVersion = ++engineImportVersionRef.current
    setImportStatusRef.current("Loading community engine…")
    try {
      const profile = await fetchCommunityEngine(url)
      if (engineImportVersionRef.current !== importVersion) return
      applyEngineProfile(profile)
      if (profile.simulationFrequency) setSimulationFrequency(profile.simulationFrequency)
      setEngineProfiles((current) => ({ ...current, [car.id]: profile }))
      setImportStatusRef.current(`Applied ${profile.name} by ${profile.creator}`)
    } catch (error) {
      if (engineImportVersionRef.current !== importVersion) return
      setImportStatusRef.current(error instanceof Error ? error.message : "Community engine import failed")
    }
  }, [applyEngineProfile, car.id])

  const resetDefaultEngine = useCallback(() => {
    engineImportVersionRef.current += 1
    resetEngine()
    setEngineProfiles((current) => {
      const nextProfiles = { ...current }
      delete nextProfiles[car.id]
      return nextProfiles
    })
    setSimulationFrequency(10000)
    setImportStatusRef.current(`Restored ${car.name}'s default engine`)
  }, [car.id, car.name, resetEngine])

  const applySketchfabModel = useCallback(async (url: string) => {
    const importVersion = ++modelImportVersionRef.current
    setModelImport({ label: "CHECKING MODEL", percent: 5 })
    setImportStatusRef.current("Opening Sketchfab sign-in…")
    try {
      const uid = await validateSketchfabDownload(url)
      if (modelImportVersionRef.current !== importVersion) return
      setModelImport({ label: "WAITING FOR SKETCHFAB", percent: 15 })
      const download = await requestSketchfabDownload(uid)
      if (modelImportVersionRef.current !== importVersion) return
      setImportStatusRef.current("Downloading authorized Sketchfab model…")
      const asset = await modelAssetFromSketchfabDownload(url, download, (progress) => {
        if (modelImportVersionRef.current === importVersion) updateModelImportProgress(progress)
      })
      if (modelImportVersionRef.current !== importVersion) {
        asset.revoke()
        return
      }
      setModelImport({ label: "LOADING 3D SCENE", percent: 96 })
      replaceCustomModel(car.id, asset)
      setImportStatusRef.current(`Applied ${asset.attribution.modelName} by ${asset.attribution.creatorName}`)
    } catch (error) {
      if (modelImportVersionRef.current !== importVersion) return
      setModelImport(null)
      setImportStatusRef.current(error instanceof Error ? error.message : "Sketchfab import failed")
    }
  }, [car.id, replaceCustomModel, updateModelImportProgress])

  const openModelUpload = useCallback(() => modelFileInputRef.current?.click(), [])
  const importHandlers = useMemo(() => ({
    applyCommunityEngine,
    resetDefaultEngine,
    uploadModel: openModelUpload,
    applySketchfabModel,
    resetDefaultModel,
  }), [applyCommunityEngine, applySketchfabModel, openModelUpload, resetDefaultEngine, resetDefaultModel])
  const importControls = useImportControls(importHandlers)
  const resetImportControlsVersion = importControls.resetCurrentVersion

  useEffect(() => {
    setImportStatusRef.current = importControls.setStatus
  }, [importControls.setStatus])

  const uploadModel = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    const importVersion = ++modelImportVersionRef.current
    setModelImport({ label: "READING MODEL FILE", percent: 5 })
    setImportStatusRef.current(`Loading ${file.name}…`)
    try {
      const asset = await modelAssetFromFile(file, (progress) => {
        if (modelImportVersionRef.current === importVersion) updateModelImportProgress(progress)
      })
      if (modelImportVersionRef.current !== importVersion) {
        asset.revoke()
        return
      }
      setModelImport({ label: "LOADING 3D SCENE", percent: 96 })
      replaceCustomModel(car.id, asset)
      setImportStatusRef.current(`Applied local model ${file.name}`)
    } catch (error) {
      if (modelImportVersionRef.current !== importVersion) return
      setModelImport(null)
      setImportStatusRef.current(error instanceof Error ? error.message : "Model upload failed")
    }
  }, [car.id, replaceCustomModel, updateModelImportProgress])

  useEffect(() => {
    bodyMotionRef.current = bodyMotion
  }, [bodyMotion])

  useEffect(() => {
    physicsRef.current = physics
  }, [physics])

  useEffect(() => {
    vehicleDynamicsRef.current = vehicleDynamics
  }, [vehicleDynamics])

  const reset = useCallback(() => {
    pendingShiftRef.current = null
    clearShiftFeedback()
    telemetryRef.current = initialTelemetry(tunedCar)
    setTelemetry(telemetryRef.current)
    setResetVersion((current) => current + 1)
  }, [clearShiftFeedback, tunedCar])

  const resetEntireApp = useCallback(() => {
    inputRef.current = { ...emptyInput }
    pendingShiftRef.current = null
    clearShiftFeedback()
    resetDefaultEngine()
    resetDefaultModel()
    resetCurrentTuningVersion()
    resetImportControlsVersion()
    setTransmission("manual")
    setClutchMode("manual")
    setView("drive")
    telemetryRef.current = initialTelemetry(car)
    setTelemetry(telemetryRef.current)
    setResetVersion((current) => current + 1)
  }, [car, clearShiftFeedback, resetCurrentTuningVersion, resetDefaultEngine, resetDefaultModel, resetImportControlsVersion])

  const selectCar = useCallback((nextCar: CarSpec) => {
    setCar(nextCar)
    setSimulationFrequency(engineProfiles[nextCar.id]?.simulationFrequency ?? 10000)
  }, [engineProfiles])

  const cycleCar = useCallback(() => {
    const currentIndex = CARS.findIndex((candidate) => candidate.id === car.id)
    selectCar(CARS[(currentIndex + 1) % CARS.length])
  }, [car.id, selectCar])

  const setInput = useCallback((key: DigitalInputKey, active: boolean) => {
    inputRef.current[key] = active
    if (key === "reverse" && !active) {
      telemetryRef.current = { ...telemetryRef.current, gear: 0 }
    }
  }, [])

  const setDrivePadInput = useCallback((nextInput: Pick<DriverInput, "steeringAxis" | "throttleAxis" | "brakeAxis">) => {
    inputRef.current.steeringAxis = nextInput.steeringAxis
    inputRef.current.throttleAxis = nextInput.throttleAxis
    inputRef.current.brakeAxis = nextInput.brakeAxis
  }, [])

  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("benchmark")) return
    const benchmarkWindow = window as BenchmarkAppWindow
    benchmarkWindow.__torqueZeroApp = { inputRef, telemetryRef }
    return () => { delete benchmarkWindow.__torqueZeroApp }
  }, [])

  const requestShift = useCallback((direction: -1 | 1) => {
    const current = telemetryRef.current
    if (current.driveDirection === -1) {
      showShiftFeedback("SELECT DRIVE FIRST")
      return
    }
    const nextGear = Math.max(0, Math.min(tunedCar.gears.length - 1, current.gear + direction))
    if (nextGear === current.gear || pendingShiftRef.current) return

    if (clutchMode === "manual" && !inputRef.current.clutch) {
      showShiftFeedback("CLUTCH REQUIRED")
      return
    }

    pendingShiftRef.current = {
      mode: clutchMode,
      action: { kind: "gear", direction },
      phase: "disengaging",
    }
    if (clutchMode === "automatic") {
      clearShiftFeedback()
      setShiftFeedback("AUTO CLUTCH")
    }
  }, [clearShiftFeedback, clutchMode, showShiftFeedback, tunedCar.gears.length])

  const changeTransmission = useCallback((mode: TransmissionMode) => {
    inputRef.current.right = false
    pendingShiftRef.current = null
    clearShiftFeedback()
    setTransmission(mode)
  }, [clearShiftFeedback])

  const toggleClutchMode = useCallback(() => {
    pendingShiftRef.current = null
    clearShiftFeedback()
    setClutchMode((current) => current === "manual" ? "automatic" : "manual")
  }, [clearShiftFeedback])

  const changeView = useCallback((nextView: "drive" | "workbench") => {
    setView(nextView)
    void engineAudio.setWorkbenchActive(nextView === "workbench").catch((error) => {
      console.error("Engine workbench telemetry could not start", error)
    })
  }, [engineAudio])

  const toggleSound = useCallback(async () => {
    if (soundEnabled) {
      engineAudio.disable()
      setSoundEnabled(false)
      return
    }
    setSoundLoading(true)
    try {
      await engineAudio.enable(car.id, engineSound)
      setSoundEnabled(true)
    } catch (error) {
      engineAudio.disable()
      console.error("Engine audio could not start", error)
    } finally {
      setSoundLoading(false)
    }
  }, [car.id, engineAudio, engineSound, soundEnabled])

  useEffect(() => {
    if (soundEnabled) void engineAudio.selectCar(car.id, engineSound)
  }, [car.id, engineAudio, engineSound, soundEnabled])

  useEffect(() => {
    engineAudio.setTuning(engineSound)
  }, [engineAudio, engineSound])

  useEffect(() => {
    engineAudio.setSimulationFrequency(simulationFrequency)
  }, [engineAudio, simulationFrequency])

  useEffect(() => {
    const syncPageAudio = () => {
      engineAudio.setPageActive(document.visibilityState === "visible" && document.hasFocus())
    }
    syncPageAudio()
    window.addEventListener("focus", syncPageAudio)
    window.addEventListener("blur", syncPageAudio)
    document.addEventListener("visibilitychange", syncPageAudio)
    return () => {
      window.removeEventListener("focus", syncPageAudio)
      window.removeEventListener("blur", syncPageAudio)
      document.removeEventListener("visibilitychange", syncPageAudio)
    }
  }, [engineAudio])

  useEffect(() => {
    if (!soundEnabled || defaultSoundStartedRef.current) return
    const startDefaultSound = (event: Event) => {
      const target = event.target
      if (target instanceof Element && target.closest("[data-sound-toggle]")) return
      defaultSoundStartedRef.current = true
      window.removeEventListener("pointerdown", startDefaultSound)
      window.removeEventListener("keydown", startDefaultSound)
      void engineAudio.enable(car.id, engineSound).catch((error) => {
        setSoundEnabled(false)
        console.error("Default engine audio could not start", error)
      })
    }
    window.addEventListener("pointerdown", startDefaultSound)
    window.addEventListener("keydown", startDefaultSound)
    return () => {
      window.removeEventListener("pointerdown", startDefaultSound)
      window.removeEventListener("keydown", startDefaultSound)
    }
  }, [car.id, engineAudio, engineSound, soundEnabled])

  useEffect(() => () => engineAudio.dispose(), [engineAudio])

  useEffect(() => warmSketchfabSession(), [])

  useEffect(() => () => {
    if (shiftFeedbackTimerRef.current !== null) window.clearTimeout(shiftFeedbackTimerRef.current)
    if (modelImportTimerRef.current !== null) window.clearTimeout(modelImportTimerRef.current)
  }, [])

  useEffect(() => {
    try {
      if (Object.keys(engineProfiles).length === 0) localStorage.removeItem(COMMUNITY_ENGINES_STORAGE_KEY)
      else localStorage.setItem(COMMUNITY_ENGINES_STORAGE_KEY, JSON.stringify(engineProfiles))
    } catch {
      // Storage can be disabled; the live import still remains active.
    }
  }, [engineProfiles])

  useEffect(() => () => {
    Object.values(customModelsRef.current).forEach((asset) => asset.revoke())
  }, [])

  useEffect(() => {
    const handleKey = (active: boolean) => (event: KeyboardEvent) => {
      if (event.metaKey && event.shiftKey && event.code === "KeyR") {
        event.preventDefault()
        if (active && !event.repeat) resetEntireApp()
        return
      }
      const target = event.target
      if (active && target instanceof Element && target.closest(".dialkit-root, input, textarea, [contenteditable='true']")) return
      const key = event.key.toLowerCase()
      if (transmission === "manual" && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
        event.preventDefault()
        if (active && !event.repeat) requestShift(event.key === "ArrowDown" ? -1 : 1)
        return
      }
      if (key === "r") {
        event.preventDefault()
        inputRef.current.reverse = active
        return
      }
      if (key === "m") {
        event.preventDefault()
        if (active && !event.repeat) void toggleSound()
        return
      }
      if (event.code === "Equal" || event.code === "Minus") {
        event.preventDefault()
        if (active && !event.repeat) {
          const direction = event.code === "Equal" ? 1 : -1
          setSimulationFrequency((current) => Math.max(400, Math.min(400000, Math.round(current * (direction > 0 ? 2 : 0.5)))))
        }
        return
      }
      const mappedKey = event.key in keyMap ? event.key : key
      if (mappedKey in keyMap) {
        event.preventDefault()
        inputRef.current[keyMap[mappedKey]] = active
      }
      if (active && ["1", "2", "3"].includes(event.key)) selectCar(CARS[Number(event.key) - 1])
    }
    const down = handleKey(true)
    const up = handleKey(false)
    window.addEventListener("keydown", down)
    window.addEventListener("keyup", up)
    const releaseInputs = () => { inputRef.current = { ...emptyInput } }
    const releaseHiddenInputs = () => {
      if (document.visibilityState !== "visible") releaseInputs()
    }
    window.addEventListener("blur", releaseInputs)
    window.addEventListener("pagehide", releaseInputs)
    window.addEventListener("orientationchange", releaseInputs)
    document.addEventListener("visibilitychange", releaseHiddenInputs)
    return () => {
      window.removeEventListener("keydown", down)
      window.removeEventListener("keyup", up)
      window.removeEventListener("blur", releaseInputs)
      window.removeEventListener("pagehide", releaseInputs)
      window.removeEventListener("orientationchange", releaseInputs)
      document.removeEventListener("visibilitychange", releaseHiddenInputs)
    }
  }, [requestShift, resetEntireApp, selectCar, toggleSound, transmission])

  useEffect(() => {
    let animationFrame = 0
    let lastTime = performance.now()
    let lastUiUpdate = lastTime
    let accumulator = 0
    const timestep = 1 / VEHICLE_PHYSICS_FREQUENCY
    const tick = (time: number) => {
      const delta = Math.min((time - lastTime) / 1000, 0.1)
      lastTime = time
      accumulator = Math.min(accumulator + delta, 0.1)
      while (accumulator >= timestep) {
        const rawInput = inputRef.current
        const desiredDriveDirection: DriveDirection = rawInput.reverse ? -1 : 1
        let pending = pendingShiftRef.current
        if (
          (pending?.action.kind === "range" && pending.action.driveDirection !== desiredDriveDirection)
          || (desiredDriveDirection === -1 && pending?.action.kind === "gear")
        ) {
          pendingShiftRef.current = null
          pending = null
        }
        if (
          !pending
          && telemetryRef.current.driveDirection !== desiredDriveDirection
        ) {
          pending = {
            mode: "automatic",
            action: { kind: "range", driveDirection: desiredDriveDirection },
            phase: "disengaging",
          }
          pendingShiftRef.current = pending
        }

        const waitingForRange = telemetryRef.current.driveDirection !== desiredDriveDirection
        const commandedThrottle = desiredDriveDirection === -1 ? rawInput.reverse : rawInput.throttle
        const commandedThrottleAxis = desiredDriveDirection === 1 ? rawInput.throttleAxis : 0
        const basePhysicsInput: PhysicsInput = {
          ...rawInput,
          throttle: !waitingForRange && commandedThrottle,
          throttleAxis: waitingForRange ? 0 : commandedThrottleAxis,
          brake: rawInput.brake,
        }
        let physicsInput = basePhysicsInput
        if (pending?.mode === "automatic") {
          const clutchShouldBeOpen = pending.phase !== "engaging"
          physicsInput = {
            ...basePhysicsInput,
            automaticClutch: true,
            clutch: clutchShouldBeOpen || basePhysicsInput.clutch,
            throttle: clutchShouldBeOpen ? false : basePhysicsInput.throttle,
            throttleAxis: clutchShouldBeOpen ? 0 : basePhysicsInput.throttleAxis,
            revMatchRpm: pending.targetRpm,
          }
        }

        telemetryRef.current = stepPhysics(telemetryRef.current, tunedCar, physicsInput, timestep, transmission, physics)

        const activeShift = pendingShiftRef.current
        if (activeShift?.mode === "manual") {
          if (!inputRef.current.clutch) {
            pendingShiftRef.current = null
          } else if (telemetryRef.current.clutch <= CLUTCH_OPEN_THRESHOLD) {
            telemetryRef.current = withAppliedShift(telemetryRef.current, activeShift.action, tunedCar.gears.length)
            pendingShiftRef.current = null
          }
        } else if (activeShift?.mode === "automatic") {
          if (activeShift.phase === "disengaging" && telemetryRef.current.clutch <= CLUTCH_OPEN_THRESHOLD) {
            telemetryRef.current = withAppliedShift(telemetryRef.current, activeShift.action, tunedCar.gears.length)
            activeShift.targetRpm = rpmForGear(telemetryRef.current, telemetryRef.current.gear, tunedCar, physics.wheelRadiusMeters)
            activeShift.phase = "matching"
          } else if (activeShift.phase === "matching" && activeShift.targetRpm !== undefined) {
            const tolerance = Math.max(100, activeShift.targetRpm * 0.015)
            if (Math.abs(telemetryRef.current.rpm - activeShift.targetRpm) <= tolerance) activeShift.phase = "engaging"
          } else if (activeShift.phase === "engaging" && telemetryRef.current.clutch >= CLUTCH_LOCKED_THRESHOLD) {
            pendingShiftRef.current = null
            setShiftFeedback(null)
          }
        }
        accumulator -= timestep
      }
      engineAudio.update({ rpm: telemetryRef.current.rpm, redline: tunedCar.redline, throttle: telemetryRef.current.throttle })
      if (time - lastUiUpdate > 50) {
        setTelemetry({ ...telemetryRef.current })
        setEngineQualities(engineAudio.getEngineQualities())
        lastUiUpdate = time
      }
      animationFrame = requestAnimationFrame(tick)
    }
    animationFrame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animationFrame)
  }, [engineAudio, physics, transmission, tunedCar])

  const displayedSpeed = displaySpeed(telemetry.speedMps)
  const benchmark = accelerationBenchmark()
  const customModel = customModels[car.id]
  const activeEngine = engineProfiles[car.id]
  const activeCustomModel = useMemo(() => customModel
    ? {
        url: customModel.url,
        yawDegrees: importControls.values.carModel.modelYawDegrees,
        scale: importControls.values.carModel.modelScale,
      }
    : undefined, [customModel, importControls.values.carModel.modelScale, importControls.values.carModel.modelYawDegrees])

  return (
    <main className="app-root isolate min-h-dvh bg-[#07070b] text-zinc-100">
      <input
        ref={modelFileInputRef}
        className="hidden"
        type="file"
        accept=".glb,.gltf,.zip,model/gltf-binary,model/gltf+json,application/zip"
        onChange={uploadModel}
      />
      <div className="app-shell mx-auto grid min-h-dvh max-w-[1800px] grid-rows-[auto_minmax(340px,54vh)_auto] gap-3 p-3 lg:h-dvh lg:grid-cols-[minmax(0,7fr)_minmax(380px,3fr)] lg:grid-rows-[auto_minmax(0,1fr)] lg:overflow-hidden lg:p-4">
        <header className="app-header flex min-w-0 items-center justify-between gap-4 lg:col-span-2">
          <div className="flex min-w-0 items-center gap-3">
            <div className="size-3 shrink-0 rotate-45 bg-cyan-300 shadow-[0_0_24px_rgba(24,215,255,0.9)]" />
            <div className="min-w-0">
              <h1 className="app-brand-title truncate font-display text-2xl font-semibold tracking-tight text-white">TORQUE ZERO</h1>
              <p className="app-brand-subtitle truncate font-mono text-base text-zinc-500 sm:text-sm">DYNAMOMETER DRIVING LAB // SECTOR 07</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="flex rounded-md bg-white/3 p-0.5 ring-1 ring-white/10" role="group" aria-label="Simulation view">
              <Button
                variant="ghost"
                size="sm"
                className={cn("h-7 gap-1.5 px-2 font-mono text-[10px]", view === "drive" && "bg-white/10 text-cyan-300")}
                onClick={() => changeView("drive")}
                aria-pressed={view === "drive"}
              >
                <CarFront className="size-3.5" /><span className="hidden sm:inline">DRIVE</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={cn("h-7 gap-1.5 px-2 font-mono text-[10px]", view === "workbench" && "bg-white/10 text-cyan-300")}
                onClick={() => changeView("workbench")}
                aria-pressed={view === "workbench"}
              >
                <Wrench className="size-3.5" /><span className="hidden sm:inline">WORKBENCH</span>
              </Button>
            </div>
            <div className="desktop-drive-status hidden items-center gap-2 font-mono text-sm md:flex">
              <span className="max-w-56 truncate text-zinc-400">{activeEngine ? `${car.name} · ${activeEngine.name}` : car.name}</span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 font-mono text-xs text-cyan-300"
                onClick={() => changeTransmission(transmission === "automatic" ? "manual" : "automatic")}
                aria-label={`Transmission: ${transmission}. Toggle transmission mode`}
              >
                {transmission === "manual" ? "MANUAL" : "AUTO"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 font-mono text-xs text-cyan-300"
                onClick={toggleClutchMode}
                aria-label={`Clutch control: ${clutchMode}. Toggle clutch control mode; this does not change transmission shifting mode`}
                aria-pressed={clutchMode === "automatic"}
              >
                CLUTCH {clutchMode === "automatic" ? "AUTO" : "MAN"}
              </Button>
              <span className="text-xs tabular-nums text-zinc-500">SIM {simulationFrequency.toLocaleString()}HZ</span>
              <span className="hidden text-zinc-500 2xl:inline">
                {transmission === "manual"
                  ? clutchMode === "manual"
                    ? "A FORWARD · HOLD R REVERSE · S BRAKE · SHIFT+↑/↓ SHIFT · SPACE SMOOTH · ←/→ STEER · −/= SIM · M SOUND · ⌘⇧R RESET"
                    : "A FORWARD · HOLD R REVERSE · S BRAKE · ↑/↓ SHIFT · AUTO CLUTCH · SPACE SMOOTH · ←/→ STEER · −/= SIM · M SOUND · ⌘⇧R RESET"
                  : "A FORWARD · HOLD R REVERSE · S BRAKE · SHIFT CLUTCH · SPACE SMOOTH · ←/→ STEER · −/= SIM · M SOUND · ⌘⇧R RESET"}
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              data-sound-toggle
              onClick={() => void toggleSound()}
              aria-label={soundEnabled ? "Mute engine sound" : "Enable engine sound"}
              aria-pressed={soundEnabled}
              disabled={soundLoading}
            >
              {soundLoading
                ? <LoaderCircle className="size-4 shrink-0 animate-spin stroke-cyan-300" />
                : soundEnabled
                  ? <Volume2 className="size-4 shrink-0 stroke-cyan-300" />
                  : <VolumeX className="size-4 shrink-0 stroke-zinc-400" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={reset} aria-label="Reset run"><RotateCcw className="size-4 shrink-0 stroke-zinc-300" /></Button>
          </div>
        </header>

        {view === "drive" ? <section className="drive-panel relative min-h-0 overflow-hidden rounded-[min(1vw,12px)] bg-[#0b0915] ring-1 ring-white/10" aria-label="Driving simulation">
          <TrackScene
            car={tunedCar}
            telemetryRef={telemetryRef}
            inputRef={inputRef}
            physicsRef={physicsRef}
            vehicleDynamicsRef={vehicleDynamicsRef}
            bodyMotionRef={bodyMotionRef}
            resetVersion={resetVersion}
            customModel={activeCustomModel}
            onCustomModelReady={finishModelImport}
            onCustomModelError={failModelRender}
          />
          {modelImport && <div
            className="pointer-events-none absolute left-1/2 top-3 z-20 w-[min(320px,calc(100%-24px))] -translate-x-1/2 rounded-md bg-black/85 px-3 py-2 font-mono shadow-[0_12px_36px_rgba(0,0,0,.45)] ring-1 ring-white/15 backdrop-blur-md"
            role="status"
            aria-live="polite"
          >
            <div className="flex items-center justify-between gap-4 text-[10px] tracking-[0.14em]">
              <span className="flex min-w-0 items-center gap-2 text-cyan-200">
                {modelImport.percent !== 100 && <LoaderCircle className="size-3.5 shrink-0 animate-spin" />}
                <span className="truncate">{modelImport.label}</span>
              </span>
              {modelImport.percent !== undefined && <span className="tabular-nums text-zinc-400">{Math.round(modelImport.percent)}%</span>}
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
              <div
                className={cn("h-full rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(24,215,255,.65)] transition-[width] duration-150", modelImport.percent === undefined && "w-1/3 animate-pulse")}
                style={modelImport.percent === undefined ? undefined : { width: `${modelImport.percent}%` }}
              />
            </div>
          </div>}
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,transparent_55%,rgba(7,7,11,0.72))]" />
          <div className="legacy-mobile-speed absolute right-3 top-3 text-right drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)] sm:hidden">
            <p className="font-display text-5xl font-semibold tabular-nums tracking-tight text-white">{Math.round(displayedSpeed)}</p>
            <p className="font-mono text-base tracking-wide text-cyan-300">MPH</p>
          </div>
          <div className="desktop-instrument-cluster absolute inset-x-4 bottom-3 hidden grid-cols-[minmax(64px,.45fr)_minmax(360px,3fr)_minmax(100px,.65fr)] items-end gap-4 sm:grid">
            <div className="pb-2">
              <Metric label="GEAR" value={telemetry.driveDirection === -1 ? "R" : `${telemetry.gear + 1}`} />
            </div>
            <InstrumentCluster
              rpm={telemetry.rpm}
              redline={tunedCar.redline}
              speedMph={displayedSpeed}
              innerArc={tachInnerArc}
              outerArcDelta={tachOuterArcDelta}
              lowBarWidth={tachLowBarWidth}
              highBarWidth={tachHighBarWidth}
              barGap={tachBarGap}
            />
            <div className="pb-2 text-right">
              <Metric label="LONGITUDINAL G" value={(telemetry.acceleration / 9.81).toFixed(2)} suffix="G" accent />
            </div>
          </div>
          <MobileDriveControls
            car={tunedCar}
            rpm={telemetry.rpm}
            speedMph={displayedSpeed}
            gear={telemetry.gear}
            driveDirection={telemetry.driveDirection}
            transmission={transmission}
            clutchMode={clutchMode}
            shiftFeedback={shiftFeedback}
            setInput={setInput}
            setDrivePadInput={setDrivePadInput}
            requestShift={requestShift}
            onToggleTransmission={() => changeTransmission(transmission === "automatic" ? "manual" : "automatic")}
            onToggleClutchMode={toggleClutchMode}
            onCycleCar={cycleCar}
          />
        </section> : (
          <div className="workbench-panel min-h-0 lg:col-span-2">
            <EngineWorkbench
              car={tunedCar}
              rpm={telemetry.rpm}
              throttle={telemetry.throttle}
              horsepower={telemetry.horsepower}
              torqueNm={telemetry.torqueNm}
              qualities={engineQualities}
              tuning={engineSound}
            />
          </div>
        )}

        {view === "drive" && <aside className="drive-sidebar grid min-h-0 content-start gap-4 lg:overflow-y-auto lg:pr-1">
          <div className="grid grid-cols-2 gap-3 rounded-lg bg-zinc-950/80 p-3 ring-1 ring-white/10">
            <Metric label="TORQUE NOW" value={Math.round(displayTorque(telemetry.torqueNm)).toString()} suffix="lb-ft" />
            <Metric label="POWER NOW" value={Math.round(telemetry.horsepower).toString()} suffix="hp" accent />
            <Metric label="FIRING RATE" value={Math.round(engineQualities.firingFrequencyHz).toString()} suffix="Hz" />
            <Metric label="TORQUE PULSE" value={(engineQualities.torqueRipple * 100).toFixed(1)} suffix="%" accent />
            <Metric label={benchmark.label} value={displayedSpeed < benchmark.target ? "RUNNING" : "COMPLETE"} />
            <Metric label="DISTANCE" value={displayDistance(telemetry.distance).toFixed(2)} suffix="mi" />
          </div>
          <DynoChart car={tunedCar} rpm={telemetry.rpm} />
          <CarSelector active={car} onSelect={selectCar} />
          <div className="flex items-start gap-2 border-t border-white/10 pt-3">
            <Gauge className="size-4 h-lh shrink-0 stroke-zinc-500" />
            <div className="grid gap-1">
              <p className="text-base text-pretty text-zinc-500 sm:text-sm">
                Wheel force uses live torque × gear ratio. Horsepower describes how long that force can be sustained as speed and RPM rise.
              </p>
              {activeEngine && <p className="text-base text-zinc-600 sm:text-sm">
                Engine: <a className="text-zinc-400 underline decoration-zinc-700 underline-offset-2 hover:text-zinc-200" href={activeEngine.sourceUrl} target="_blank" rel="noreferrer">{activeEngine.name}</a> by {activeEngine.creator} · Engine Simulator Parts Catalog
              </p>}
              <p className="text-base text-zinc-600 sm:text-sm">
                {customModel ? <>
                  Model: {customModel.attribution.sourceUrl
                    ? <a className="text-zinc-400 underline decoration-zinc-700 underline-offset-2 hover:text-zinc-200" href={customModel.attribution.sourceUrl} target="_blank" rel="noreferrer">{customModel.attribution.modelName}</a>
                    : customModel.attribution.modelName} by {customModel.attribution.creatorUrl
                    ? <a className="text-zinc-400 underline decoration-zinc-700 underline-offset-2 hover:text-zinc-200" href={customModel.attribution.creatorUrl} target="_blank" rel="noreferrer">{customModel.attribution.creatorName}</a>
                    : customModel.attribution.creatorName} · {customModel.attribution.licenseLabel}
                </> : <>
                  3D models by <a className="text-zinc-400 underline decoration-zinc-700 underline-offset-2 hover:text-zinc-200" href="https://sketchfab.com/4130ff15fe394c239cc064b5286c43" target="_blank" rel="noreferrer">Zorg_Sinister on Sketchfab</a> · CC BY 4.0
                </>}
              </p>
            </div>
          </div>
        </aside>}
      </div>
    </main>
  )
}
