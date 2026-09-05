import { useCallback, useEffect, useRef, useState } from "react"
import { ArrowDown, ArrowUp } from "lucide-react"
import { CompactDynoChart } from "@/components/CompactDynoChart"
import type { CarSpec } from "@/game/cars"
import type { DriveDirection, DriverInput, TransmissionMode } from "@/game/physics"
import { cn } from "@/lib/utils"

type ClutchMode = "manual" | "automatic"
type DrivePadInput = Pick<DriverInput, "steeringAxis" | "throttleAxis" | "brakeAxis">
type DigitalInputKey = Exclude<keyof DriverInput, keyof DrivePadInput>

type MobileDriveControlsProps = {
  car: CarSpec
  rpm: number
  speedMph: number
  gear: number
  driveDirection: DriveDirection
  transmission: TransmissionMode
  clutchMode: ClutchMode
  shiftFeedback: string | null
  setInput: (key: DigitalInputKey, active: boolean) => void
  setDrivePadInput: (input: DrivePadInput) => void
  requestShift: (direction: -1 | 1) => void
  onToggleTransmission: () => void
  onToggleClutchMode: () => void
  onCycleCar: () => void
}

const DRIVE_PAD_DEAD_ZONE = 0.1
const SHIFT_GATE_THRESHOLD_PX = 27
const SHIFT_GATE_REARM_PX = 11
const MIN_SHIFT_CLUTCH_HOLD_MS = 100

const clampAxis = (value: number) => Math.max(-1, Math.min(1, value))

function withDeadZone(value: number) {
  const magnitude = Math.abs(clampAxis(value))
  if (magnitude <= DRIVE_PAD_DEAD_ZONE) return 0
  return Math.sign(value) * (magnitude - DRIVE_PAD_DEAD_ZONE) / (1 - DRIVE_PAD_DEAD_ZONE)
}

export function MobileDriveControls({
  car,
  rpm,
  speedMph,
  gear,
  driveDirection,
  transmission,
  clutchMode,
  shiftFeedback,
  setInput,
  setDrivePadInput,
  requestShift,
  onToggleTransmission,
  onToggleClutchMode,
  onCycleCar,
}: MobileDriveControlsProps) {
  const surfaceRef = useRef<HTMLDivElement>(null)
  const drivePointerRef = useRef<number | null>(null)
  const clutchPointerRef = useRef<number | null>(null)
  const reversePointerRef = useRef<number | null>(null)
  const clutchStartYRef = useRef(0)
  const clutchStartedAtRef = useRef(0)
  const shiftArmedRef = useRef(true)
  const shiftedThisGestureRef = useRef(false)
  const clutchReleaseTimerRef = useRef<number | null>(null)
  const [drivePad, setDrivePad] = useState<DrivePadInput>({ steeringAxis: 0, throttleAxis: 0, brakeAxis: 0 })
  const [clutchPressed, setClutchPressed] = useState(false)
  const [reversePressed, setReversePressed] = useState(false)
  const [shiftDirection, setShiftDirection] = useState<-1 | 1 | null>(null)

  const clearDrivePad = useCallback(() => {
    const neutral = { steeringAxis: 0, throttleAxis: 0, brakeAxis: 0 }
    setDrivePad(neutral)
    setDrivePadInput(neutral)
  }, [setDrivePadInput])

  const clearClutchReleaseTimer = useCallback(() => {
    if (clutchReleaseTimerRef.current === null) return
    window.clearTimeout(clutchReleaseTimerRef.current)
    clutchReleaseTimerRef.current = null
  }, [])

  const releaseClutch = useCallback((allowMinimumHold: boolean) => {
    const finishRelease = () => {
      clutchReleaseTimerRef.current = null
      setInput("clutch", false)
    }
    if (clutchMode !== "manual") return
    const elapsed = performance.now() - clutchStartedAtRef.current
    const remainingHold = allowMinimumHold && shiftedThisGestureRef.current
      ? Math.max(0, MIN_SHIFT_CLUTCH_HOLD_MS - elapsed)
      : 0
    if (remainingHold > 0) {
      clearClutchReleaseTimer()
      clutchReleaseTimerRef.current = window.setTimeout(finishRelease, remainingHold)
    } else {
      finishRelease()
    }
  }, [clearClutchReleaseTimer, clutchMode, setInput])

  const releaseAll = useCallback(() => {
    drivePointerRef.current = null
    clutchPointerRef.current = null
    reversePointerRef.current = null
    clearClutchReleaseTimer()
    clearDrivePad()
    setInput("clutch", false)
    setInput("reverse", false)
    setClutchPressed(false)
    setReversePressed(false)
    setShiftDirection(null)
  }, [clearClutchReleaseTimer, clearDrivePad, setInput])

  useEffect(() => {
    const surface = surfaceRef.current
    if (!surface) return
    const preventTouchMove = (event: TouchEvent) => event.preventDefault()
    surface.addEventListener("touchmove", preventTouchMove, { passive: false })
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") releaseAll()
    }
    window.addEventListener("pagehide", releaseAll)
    window.addEventListener("orientationchange", releaseAll)
    document.addEventListener("visibilitychange", handleVisibility)
    return () => {
      surface.removeEventListener("touchmove", preventTouchMove)
      window.removeEventListener("pagehide", releaseAll)
      window.removeEventListener("orientationchange", releaseAll)
      document.removeEventListener("visibilitychange", handleVisibility)
      releaseAll()
    }
  }, [releaseAll])

  const updateDrivePad = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const usableRadiusX = Math.max(1, rect.width * 0.42)
    const usableRadiusY = Math.max(1, rect.height * 0.42)
    const steeringAxis = withDeadZone((event.clientX - (rect.left + rect.width / 2)) / usableRadiusX)
    const verticalAxis = withDeadZone((event.clientY - (rect.top + rect.height / 2)) / usableRadiusY)
    const next = {
      steeringAxis,
      throttleAxis: Math.max(0, -verticalAxis),
      brakeAxis: Math.max(0, verticalAxis),
    }
    setDrivePad(next)
    setDrivePadInput(next)
  }, [setDrivePadInput])

  const pressDrivePad = (event: React.PointerEvent<HTMLDivElement>) => {
    if (drivePointerRef.current !== null) return
    event.preventDefault()
    drivePointerRef.current = event.pointerId
    event.currentTarget.setPointerCapture(event.pointerId)
    updateDrivePad(event)
  }

  const moveDrivePad = (event: React.PointerEvent<HTMLDivElement>) => {
    if (drivePointerRef.current !== event.pointerId) return
    event.preventDefault()
    updateDrivePad(event)
  }

  const releaseDrivePad = (event: React.PointerEvent<HTMLDivElement>) => {
    if (drivePointerRef.current !== event.pointerId) return
    drivePointerRef.current = null
    clearDrivePad()
  }

  const pressClutchGate = (event: React.PointerEvent<HTMLDivElement>) => {
    if (clutchPointerRef.current !== null) return
    event.preventDefault()
    clearClutchReleaseTimer()
    clutchPointerRef.current = event.pointerId
    clutchStartYRef.current = event.clientY
    clutchStartedAtRef.current = performance.now()
    shiftArmedRef.current = true
    shiftedThisGestureRef.current = false
    event.currentTarget.setPointerCapture(event.pointerId)
    setClutchPressed(true)
    setShiftDirection(null)
    if (clutchMode === "manual") setInput("clutch", true)
  }

  const moveClutchGate = (event: React.PointerEvent<HTMLDivElement>) => {
    if (clutchPointerRef.current !== event.pointerId) return
    event.preventDefault()
    const deltaY = event.clientY - clutchStartYRef.current
    if (!shiftArmedRef.current && Math.abs(deltaY) <= SHIFT_GATE_REARM_PX) {
      shiftArmedRef.current = true
      setShiftDirection(null)
      return
    }
    if (!shiftArmedRef.current || Math.abs(deltaY) < SHIFT_GATE_THRESHOLD_PX || transmission !== "manual") return
    const direction: -1 | 1 = deltaY < 0 ? 1 : -1
    shiftArmedRef.current = false
    shiftedThisGestureRef.current = true
    setShiftDirection(direction)
    requestShift(direction)
  }

  const releaseClutchGate = (event: React.PointerEvent<HTMLDivElement>, cancelled = false) => {
    if (clutchPointerRef.current !== event.pointerId) return
    clutchPointerRef.current = null
    setClutchPressed(false)
    setShiftDirection(null)
    releaseClutch(!cancelled)
  }

  const pressReverse = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (reversePointerRef.current !== null) return
    event.preventDefault()
    reversePointerRef.current = event.pointerId
    event.currentTarget.setPointerCapture(event.pointerId)
    setReversePressed(true)
    setInput("reverse", true)
  }

  const releaseReverse = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (reversePointerRef.current !== event.pointerId) return
    reversePointerRef.current = null
    setReversePressed(false)
    setInput("reverse", false)
  }

  const handleClutchKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.code === "Space") {
      event.preventDefault()
      event.stopPropagation()
      if (clutchMode === "manual") setInput("clutch", true)
      setClutchPressed(true)
      return
    }
    if (transmission !== "manual" || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return
    event.preventDefault()
    event.stopPropagation()
    if (event.repeat) return
    if (clutchMode === "manual") setInput("clutch", true)
    setClutchPressed(true)
    const direction: -1 | 1 = event.key === "ArrowUp" ? 1 : -1
    setShiftDirection(direction)
    requestShift(direction)
  }

  const handleClutchKeyUp = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.code !== "Space" && event.key !== "ArrowUp" && event.key !== "ArrowDown") return
    event.preventDefault()
    event.stopPropagation()
    if (clutchMode === "manual") setInput("clutch", false)
    setClutchPressed(false)
    setShiftDirection(null)
  }

  const rpmProgress = Math.max(0, Math.min(1, rpm / Math.max(1, car.redline)))
  const displayedGear = driveDirection === -1 ? "R" : `${gear + 1}`
  const puckX = drivePad.steeringAxis * 34
  const puckY = (drivePad.brakeAxis - drivePad.throttleAxis) * 34

  return (
    <div
      ref={surfaceRef}
      className="mobile-drive-controls"
      onContextMenu={(event) => event.preventDefault()}
      aria-label="Mobile driving controls"
    >
      <div className="mobile-drive-hud">
        <div className="mobile-drive-readout">
          <span className="mobile-drive-readout__gear" aria-label={`Gear ${displayedGear}`}>{displayedGear}</span>
          <span className="mobile-drive-readout__speed"><strong>{Math.round(speedMph)}</strong> MPH</span>
          <span className="mobile-drive-readout__rpm">{Math.round(rpm).toLocaleString()} RPM</span>
          <span className="mobile-drive-readout__tach" aria-hidden="true">
            <span style={{ width: `${rpmProgress * 100}%` }} />
          </span>
        </div>

        <CompactDynoChart car={car} rpm={rpm} />

        <div className="mobile-drive-modes" role="group" aria-label="Driving setup">
          <button
            type="button"
            className="mobile-mode-button"
            onClick={onToggleTransmission}
            aria-label={`Transmission ${transmission}. Toggle transmission mode`}
          >
            <span>GEARS</span><strong>{transmission === "manual" ? "MAN" : "AUTO"}</strong>
          </button>
          <button
            type="button"
            className={cn("mobile-mode-button", clutchMode === "automatic" && "mobile-mode-button--amber")}
            onClick={onToggleClutchMode}
            aria-pressed={clutchMode === "automatic"}
            aria-label={`Clutch ${clutchMode}. Toggle clutch control mode`}
          >
            <span>CLUTCH</span><strong>{clutchMode === "manual" ? "MAN" : "AUTO"}</strong>
          </button>
          <button
            type="button"
            className="mobile-mode-button mobile-mode-button--car"
            onClick={onCycleCar}
            aria-label={`Current car ${car.name}. Select next car`}
          >
            <span>CAR</span><strong>{car.name}</strong>
          </button>
        </div>
      </div>

      <div className="mobile-shift-status" role="status" aria-live="polite">
        {shiftFeedback ?? (clutchPressed && clutchMode === "manual" ? "CLUTCH OPEN" : "")}
      </div>

      <div className="mobile-transmission-deck">
        <div
          className={cn(
            "mobile-clutch-gate",
            clutchPressed && "mobile-clutch-gate--pressed",
            shiftDirection === 1 && "mobile-clutch-gate--up",
            shiftDirection === -1 && "mobile-clutch-gate--down",
          )}
          data-control="clutch-shift"
          role="slider"
          tabIndex={0}
          aria-label={transmission === "manual"
            ? clutchMode === "manual"
              ? "Hold clutch and slide up to shift up or down to shift down"
              : "Slide up to shift up or down to shift down; clutch is automatic"
            : "Hold clutch pedal"}
          aria-valuemin={-1}
          aria-valuemax={1}
          aria-valuenow={shiftDirection ?? 0}
          onPointerDown={pressClutchGate}
          onPointerMove={moveClutchGate}
          onPointerUp={(event) => releaseClutchGate(event)}
          onPointerCancel={(event) => releaseClutchGate(event, true)}
          onLostPointerCapture={(event) => releaseClutchGate(event, true)}
          onKeyDown={handleClutchKeyDown}
          onKeyUp={handleClutchKeyUp}
          onBlur={() => {
            if (clutchMode === "manual") setInput("clutch", false)
            setClutchPressed(false)
            setShiftDirection(null)
          }}
        >
          <span className="mobile-clutch-gate__shift mobile-clutch-gate__shift--up"><ArrowUp aria-hidden="true" /> UP</span>
          <span className="mobile-clutch-gate__label">
            {clutchMode === "manual" ? "HOLD" : "SWIPE"}
            <strong>{clutchMode === "manual" ? "CLUTCH" : "SHIFT"}</strong>
          </span>
          <span className="mobile-clutch-gate__shift mobile-clutch-gate__shift--down"><ArrowDown aria-hidden="true" /> DOWN</span>
        </div>

        <button
          type="button"
          className={cn("mobile-reverse-button", (reversePressed || driveDirection === -1) && "mobile-reverse-button--pressed")}
          data-control="reverse"
          aria-label="Hold for reverse and reverse acceleration"
          aria-pressed={reversePressed}
          onPointerDown={pressReverse}
          onPointerUp={releaseReverse}
          onPointerCancel={releaseReverse}
          onLostPointerCapture={releaseReverse}
        >
          <strong>R</strong><span>HOLD</span>
        </button>
      </div>

      <div
        className={cn("mobile-drive-pad", (Math.abs(drivePad.steeringAxis) > 0 || drivePad.throttleAxis > 0 || drivePad.brakeAxis > 0) && "mobile-drive-pad--active")}
        data-control="drive-pad"
        role="group"
        aria-label="Drive pad. Drag up to accelerate, down to brake, and left or right to steer. Diagonal movement combines steering with a pedal."
        onPointerDown={pressDrivePad}
        onPointerMove={moveDrivePad}
        onPointerUp={releaseDrivePad}
        onPointerCancel={releaseDrivePad}
        onLostPointerCapture={releaseDrivePad}
      >
        <span className="mobile-drive-pad__label mobile-drive-pad__label--gas">ACCEL</span>
        <span className="mobile-drive-pad__label mobile-drive-pad__label--brake">BRAKE</span>
        <span className="mobile-drive-pad__label mobile-drive-pad__label--left" aria-hidden="true">←</span>
        <span className="mobile-drive-pad__label mobile-drive-pad__label--right" aria-hidden="true">→</span>
        <span className="mobile-drive-pad__crosshair" aria-hidden="true" />
        <span
          className="mobile-drive-pad__puck"
          aria-hidden="true"
          style={{ transform: `translate(calc(-50% + ${puckX}px), calc(-50% + ${puckY}px))` }}
        />
      </div>
    </div>
  )
}
