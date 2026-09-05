import { useEffect, useMemo, useRef, useState } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import { Environment, OrbitControls } from "@react-three/drei"
import * as THREE from "three"
import { Activity, AudioWaveform, CircleGauge, Flame, MousePointer2 } from "lucide-react"
import { DynoChart } from "@/components/DynoChart"
import type { EngineQualities } from "@/audio/engineAudio"
import type { CarSpec } from "@/game/cars"
import type { EngineSoundTuning } from "@/game/useCarTuning"
import { displayTorque } from "@/game/units"

type EngineWorkbenchProps = {
  car: CarSpec
  rpm: number
  throttle: number
  horsepower: number
  torqueNm: number
  qualities: EngineQualities
  tuning: EngineSoundTuning
}

export type EngineVisualizationState = {
  rpm: number
  throttle: number
  crankAngleDegrees?: number
}

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum))

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-lg bg-zinc-950/72 p-3 ring-1 ring-white/10 backdrop-blur-md ${className}`}>{children}</section>
}

function PanelTitle({ icon: Icon, children, detail }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode; detail?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3 border-b border-white/8 pb-2">
      <div className="flex items-center gap-2">
        <Icon className="size-4 stroke-cyan-300" />
        <h2 className="font-display text-sm font-semibold tracking-wide text-zinc-100">{children}</h2>
      </div>
      {detail && <span className="font-mono text-[10px] tracking-[0.14em] text-zinc-600">{detail}</span>}
    </div>
  )
}

function GaugeDial({ label, value, suffix, minimum, maximum, color = "#18d7ff", decimals = 0 }: {
  label: string
  value: number
  suffix: string
  minimum: number
  maximum: number
  color?: string
  decimals?: number
}) {
  const progress = clamp((value - minimum) / Math.max(0.001, maximum - minimum), 0, 1)
  const angle = -125 + progress * 250
  return (
    <div className="min-w-0 text-center">
      <svg viewBox="0 0 120 82" className="mx-auto w-full max-w-32 overflow-visible" role="meter" aria-label={`${label}: ${value.toFixed(decimals)} ${suffix}`}>
        <path d="M 19 67 A 46 46 0 1 1 101 67" fill="none" stroke="rgba(255,255,255,.09)" strokeWidth="7" strokeLinecap="round" />
        <path d="M 19 67 A 46 46 0 1 1 101 67" fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" pathLength="100" strokeDasharray={`${progress * 100} 100`} style={{ filter: `drop-shadow(0 0 5px ${color}88)` }} />
        <g transform={`rotate(${angle} 60 59)`}>
          <path d="M58.5 60 L60 20 L61.5 60Z" fill="#f4f4f5" />
        </g>
        <circle cx="60" cy="59" r="4" fill="#09090b" stroke="#d4d4d8" strokeWidth="1.5" />
      </svg>
      <p className="-mt-2 truncate font-mono text-[10px] tracking-[0.12em] text-zinc-500">{label}</p>
      <p className="font-display text-lg font-semibold tabular-nums text-white">{value.toFixed(decimals)} <span className="font-mono text-[10px] font-normal text-zinc-500">{suffix}</span></p>
    </div>
  )
}

function Rod({ start, end, radius, color }: { start: THREE.Vector3; end: THREE.Vector3; radius: number; color: string }) {
  const { midpoint, length, quaternion } = useMemo(() => {
    const direction = end.clone().sub(start)
    return {
      midpoint: start.clone().add(end).multiplyScalar(0.5),
      length: direction.length(),
      quaternion: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize()),
    }
  }, [end, start])
  return (
    <mesh position={midpoint} quaternion={quaternion}>
      <cylinderGeometry args={[radius, radius, length, 10]} />
      <meshStandardMaterial color={color} metalness={0.75} roughness={0.28} />
    </mesh>
  )
}

function Propeller({ rpm, rpmScale, isRunning, resetToken }: { rpm: number; rpmScale: number; isRunning: boolean; resetToken: number }) {
  const propellerRef = useRef<THREE.Group>(null)
  useEffect(() => {
    if (propellerRef.current) propellerRef.current.rotation.x = 0
  }, [resetToken])
  useFrame((_, delta) => {
    if (isRunning && propellerRef.current) propellerRef.current.rotation.x += rpm * rpmScale * 0.006 * delta
  })
  return (
    <group ref={propellerRef} position={[-3.65, 0, 0]}>
      <mesh rotation={[0, Math.PI / 2, 0]}>
        <cylinderGeometry args={[0.12, 0.12, 0.42, 16]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.9} roughness={0.2} />
      </mesh>
      {Array.from({ length: 3 }, (_, index) => (
        <mesh key={index} rotation={[(index * Math.PI * 2) / 3, 0, 0]} position={[0, 0, 0]}>
          <boxGeometry args={[0.22, 1.35, 0.16]} />
          <meshStandardMaterial color="#38bdf8" emissive="#075985" emissiveIntensity={0.25} metalness={0.7} roughness={0.25} />
        </mesh>
      ))}
    </group>
  )
}

function EngineMechanism({ qualities, tuning, rpm, rpmScale = 1, isRunning = true, resetToken = 0 }: Pick<EngineWorkbenchProps, "qualities" | "tuning" | "rpm"> & { rpmScale?: number; isRunning?: boolean; resetToken?: number }) {
  const cylinderCount = Math.max(1, Math.round(tuning.cylinders))
  const banked = tuning.bankAngleDegrees > 5 && cylinderCount > 2
  const bankAngle = THREE.MathUtils.degToRad(tuning.bankAngleDegrees / 2)
  const itemsPerBank = banked ? Math.ceil(cylinderCount / 2) : cylinderCount
  const spacing = Math.min(1.05, 7.2 / Math.max(4, itemsPerBank))
  const [visualCrankAngleDegrees, setVisualCrankAngleDegrees] = useState(qualities.crankAngleDegrees)
  const visualCrankAngleRef = useRef(qualities.crankAngleDegrees)
  const lastTelemetryAngleRef = useRef(qualities.crankAngleDegrees)

  useEffect(() => {
    const telemetryAngle = qualities.crankAngleDegrees
    const telemetryDelta = Math.abs(telemetryAngle - lastTelemetryAngleRef.current)
    lastTelemetryAngleRef.current = telemetryAngle
    if (telemetryDelta > 45) {
      visualCrankAngleRef.current = telemetryAngle
      setVisualCrankAngleDegrees(telemetryAngle)
    }
  }, [qualities.crankAngleDegrees])

  useFrame((_, delta) => {
    if (!isRunning || rpm <= 0) return
    // A four-stroke cycle is 720 degrees: RPM * 12 gives degrees per second.
    visualCrankAngleRef.current = (visualCrankAngleRef.current + rpm * rpmScale * 12 * delta) % 720
    setVisualCrankAngleDegrees(visualCrankAngleRef.current)
  })

  const crankAngle = THREE.MathUtils.degToRad(visualCrankAngleDegrees)

  const cylinders = Array.from({ length: cylinderCount }, (_, index) => {
    const telemetry = qualities.cylinders[index]
    const bankSign = banked ? (index % 2 === 0 ? -1 : 1) : 0
    const bankIndex = banked ? Math.floor(index / 2) : index
    const x = (bankIndex - (itemsPerBank - 1) / 2) * spacing
    const axis = new THREE.Vector3(0, Math.cos(bankAngle), bankSign * Math.sin(bankAngle)).normalize()
    const localAngle = crankAngle - index / cylinderCount * Math.PI * 4
    const crankPin = new THREE.Vector3(x, Math.cos(localAngle) * 0.34, Math.sin(localAngle) * 0.34)
    const pistonTravel = 0.92 + (1 - Math.cos(localAngle)) * 0.46
    const piston = new THREE.Vector3(x, 0, 0).add(axis.clone().multiplyScalar(pistonTravel))
    const head = new THREE.Vector3(x, 0, 0).add(axis.clone().multiplyScalar(2.1))
    return { index, telemetry, x, axis, crankPin, piston, head, bankSign }
  })

  return (
    <group position={[0, -0.8, 0]} rotation={[0, -0.12, 0]}>
      <mesh position={[0, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.19, 0.19, Math.max(4.6, itemsPerBank * spacing + 1), 18]} />
        <meshStandardMaterial color="#9297a3" metalness={0.9} roughness={0.22} />
      </mesh>
      {cylinders.map(({ index, telemetry, x, axis, crankPin, piston, head, bankSign }) => {
        const pressure = telemetry?.pressurePsi ?? 14.7
        const combustion = telemetry?.combustion ?? 0
        const intakeLift = telemetry?.intakeValveLift ?? 0
        const exhaustLift = telemetry?.exhaustValveLift ?? 0
        const axisQuaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis)
        const cylinderCenter = new THREE.Vector3(x, 0, 0).add(axis.clone().multiplyScalar(1.48))
        const intakeBase = head.clone().add(new THREE.Vector3(0.18, 0, bankSign * -0.12))
        const exhaustBase = head.clone().add(new THREE.Vector3(-0.18, 0, bankSign * 0.12))
        return (
          <group key={index}>
            <mesh position={cylinderCenter} quaternion={axisQuaternion}>
              <cylinderGeometry args={[0.35, 0.35, 1.52, 20, 1, true]} />
              <meshStandardMaterial color="#1b2331" transparent opacity={0.32} side={THREE.DoubleSide} metalness={0.5} roughness={0.32} />
            </mesh>
            <mesh position={piston} quaternion={axisQuaternion}>
              <cylinderGeometry args={[0.29, 0.29, 0.22, 18]} />
              <meshStandardMaterial color={pressure > 300 ? "#ff784d" : "#b8c3d6"} emissive="#ff3d20" emissiveIntensity={combustion * 1.5} metalness={0.85} roughness={0.22} />
            </mesh>
            <Rod start={crankPin} end={piston} radius={0.075} color="#e4e4e7" />
            <mesh position={crankPin} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.22, 0.22, 0.16, 16]} />
              <meshStandardMaterial color="#6b7280" metalness={0.9} roughness={0.2} />
            </mesh>
            <mesh position={intakeBase.clone().sub(axis.clone().multiplyScalar(intakeLift * 0.18))} quaternion={axisQuaternion}>
              <cylinderGeometry args={[0.045, 0.08, 0.5, 10]} />
              <meshStandardMaterial color="#22d3ee" emissive="#0891b2" emissiveIntensity={intakeLift} metalness={0.6} />
            </mesh>
            <mesh position={exhaustBase.clone().sub(axis.clone().multiplyScalar(exhaustLift * 0.18))} quaternion={axisQuaternion}>
              <cylinderGeometry args={[0.045, 0.08, 0.5, 10]} />
              <meshStandardMaterial color="#fb7185" emissive="#e11d48" emissiveIntensity={exhaustLift} metalness={0.6} />
            </mesh>
            <pointLight position={head} color="#ff5a2f" intensity={combustion * 5} distance={1.35} decay={2} />
            <mesh position={head}>
              <sphereGeometry args={[0.09 + combustion * 0.12, 12, 12]} />
              <meshBasicMaterial color={combustion > 0.08 ? "#fff3a3" : "#423020"} transparent opacity={0.35 + combustion * 0.65} />
            </mesh>
          </group>
        )
      })}
      <Propeller rpm={rpm} rpmScale={rpmScale} isRunning={isRunning} resetToken={resetToken} />
      <mesh position={[-2.25, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.08, 0.08, 2.8, 12]} />
        <meshStandardMaterial color="#64748b" metalness={0.85} roughness={0.25} />
      </mesh>
    </group>
  )
}

export function EngineCanvas(props: Pick<EngineWorkbenchProps, "qualities" | "tuning" | "rpm"> & { rpmScale?: number; isRunning?: boolean; resetToken?: number }) {
  return (
    <div className="relative min-h-[430px] overflow-hidden rounded-lg bg-[radial-gradient(circle_at_50%_40%,#162033_0%,#090b12_48%,#050508_100%)] ring-1 ring-white/10 xl:min-h-0">
      <div className="absolute inset-0">
        <Canvas style={{ width: "100%", height: "100%", display: "block" }} camera={{ position: [7.6, 4.5, 8.8], fov: 48, near: 0.1, far: 100 }} dpr={[1, 1.25]}>
          <ambientLight intensity={0.58} />
          <directionalLight position={[4, 8, 6]} color="#dff8ff" intensity={2.4} />
          <directionalLight position={[-5, 3, -5]} color="#ff3d9a" intensity={1.5} />
          <EngineMechanism key={props.resetToken ?? 0} {...props} />
          <gridHelper args={[18, 18, "#164e63", "#111827"]} position={[0, -1.22, 0]} />
          <Environment preset="warehouse" environmentIntensity={0.34} />
          <OrbitControls makeDefault enablePan enableZoom enableRotate minDistance={5} maxDistance={18} target={[0, 0.1, 0]} />
        </Canvas>
      </div>
      <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] tracking-[0.18em] text-cyan-300">LIVE MECHANICAL VIEW</p>
          <p className="mt-1 font-display text-xl font-semibold text-white">{props.tuning.cylinders}-cylinder cutaway</p>
        </div>
        <div className="flex items-center gap-2 rounded bg-black/45 px-2 py-1 font-mono text-[10px] text-zinc-400 ring-1 ring-white/10">
          <MousePointer2 className="size-3" /> DRAG · PAN · SCROLL TO ZOOM
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-3 bottom-3 flex flex-wrap gap-2 font-mono text-[10px]">
        <span className="rounded bg-cyan-950/70 px-2 py-1 text-cyan-300 ring-1 ring-cyan-400/20">INTAKE VALVES</span>
        <span className="rounded bg-rose-950/70 px-2 py-1 text-rose-300 ring-1 ring-rose-400/20">EXHAUST VALVES</span>
        <span className="rounded bg-orange-950/70 px-2 py-1 text-orange-300 ring-1 ring-orange-400/20">COMBUSTION</span>
      </div>
    </div>
  )
}

function Oscilloscope({ qualities }: { qualities: EngineQualities }) {
  const width = 720
  const height = 120
  const phaseOffset = qualities.crankAngleDegrees / 720
  const points = Array.from({ length: 180 }, (_, index) => {
    const samplePhase = index / 179
    const wave = qualities.cylinders.reduce((sum, cylinder) => {
      let distance = Math.abs((samplePhase + phaseOffset) % 1 - cylinder.phase)
      distance = Math.min(distance, 1 - distance)
      return sum + Math.exp(-distance * distance / 0.0014) * (0.25 + cylinder.combustion * 0.75)
    }, 0)
    const normalized = clamp(wave / Math.max(1, qualities.cylinders.length * 0.34), 0, 1)
    return `${(index / 179 * width).toFixed(1)},${(height - 12 - normalized * 92).toFixed(1)}`
  }).join(" ")
  return (
    <Panel>
      <PanelTitle icon={AudioWaveform} detail="TWO ENGINE CYCLES">COMBUSTION OSCILLOSCOPE</PanelTitle>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-28 w-full" role="img" aria-label="Live combustion pressure waveform">
        {Array.from({ length: 9 }, (_, index) => <line key={`v${index}`} x1={index * width / 8} x2={index * width / 8} y1="0" y2={height} stroke="rgba(255,255,255,.055)" />)}
        {Array.from({ length: 5 }, (_, index) => <line key={`h${index}`} x1="0" x2={width} y1={index * height / 4} y2={index * height / 4} stroke="rgba(255,255,255,.055)" />)}
        <polyline points={points} fill="none" stroke="#18d7ff" strokeWidth="2.5" vectorEffect="non-scaling-stroke" style={{ filter: "drop-shadow(0 0 5px rgba(24,215,255,.65))" }} />
      </svg>
    </Panel>
  )
}

function FiringOrder({ qualities, count }: { qualities: EngineQualities; count: number }) {
  const active = qualities.cylinders.reduce((best, cylinder, index, array) => cylinder.combustion > (array[best]?.combustion ?? -1) ? index : best, 0)
  return (
    <Panel>
      <PanelTitle icon={Flame} detail="720° CYCLE">FIRING ORDER</PanelTitle>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        {Array.from({ length: count }, (_, index) => {
          const cylinder = qualities.cylinders[index]
          const hot = index === active && (cylinder?.combustion ?? 0) > 0.05
          return (
            <div key={index} className={`relative grid aspect-square place-items-center overflow-hidden rounded-md ring-1 ${hot ? "bg-orange-500/18 text-orange-200 ring-orange-400/55" : "bg-white/3 text-zinc-500 ring-white/10"}`}>
              <div className="absolute inset-x-0 bottom-0 bg-orange-500/30" style={{ height: `${clamp((cylinder?.pressurePsi ?? 0) / 700, 0, 1) * 100}%` }} />
              <span className="relative font-display text-lg font-semibold">{index + 1}</span>
            </div>
          )
        })}
      </div>
      <p className="mt-3 font-mono text-[10px] text-zinc-600">SEQUENTIAL EVEN-FIRE · {Math.round(qualities.firingFrequencyHz)} EVENTS/SEC</p>
    </Panel>
  )
}

export function EngineWorkbench({ car, rpm, throttle, horsepower, torqueNm, qualities, tuning }: EngineWorkbenchProps) {
  const peakPressure = Math.max(14.7, ...qualities.cylinders.map((cylinder) => cylinder.pressurePsi))
  const peakTemperature = Math.max(190, ...qualities.cylinders.map((cylinder) => cylinder.temperatureF))
  const exhaustFlowLbMin = Math.abs(qualities.exhaustFlow) * 132.277
  return (
    <section className="grid min-h-0 gap-3 overflow-y-auto pr-1 xl:grid-cols-[minmax(0,1.65fr)_minmax(360px,.75fr)] xl:grid-rows-[minmax(480px,1fr)_auto]" aria-label="Engine workbench">
      <EngineCanvas qualities={qualities} tuning={tuning} rpm={rpm} />
      <div className="grid content-start gap-3 sm:grid-cols-2 xl:grid-cols-1">
        <Panel>
          <PanelTitle icon={CircleGauge} detail="WASM TELEMETRY">ENGINE INSTRUMENTS</PanelTitle>
          <div className="grid grid-cols-2 gap-x-2 gap-y-4">
            <GaugeDial label="CYLINDER PRESSURE" value={peakPressure} suffix="PSI" minimum={0} maximum={800} color="#ff5a45" />
            <GaugeDial label="CYLINDER TEMP" value={peakTemperature} suffix="°F" minimum={150} maximum={1800} color="#ff9a3d" />
            <GaugeDial label="AIR / FUEL" value={qualities.airFuelRatio} suffix=":1" minimum={10} maximum={18} color="#a3e635" decimals={1} />
            <GaugeDial label="INTAKE PRESSURE" value={qualities.intakePressurePsi} suffix="PSI" minimum={0} maximum={15} color="#22d3ee" decimals={1} />
          </div>
        </Panel>
        <Panel>
          <PanelTitle icon={Activity} detail="LIVE OUTPUT">PERFORMANCE</PanelTitle>
          <div className="grid grid-cols-2 gap-3">
            {[
              ["ENGINE SPEED", Math.round(rpm).toLocaleString(), "RPM"],
              ["THROTTLE", (throttle * 100).toFixed(0), "%"],
              ["TORQUE", Math.round(displayTorque(torqueNm)).toString(), "LB-FT"],
              ["POWER", Math.round(horsepower).toString(), "HP"],
              ["AIRFLOW", Math.round(qualities.airFlowCfm).toString(), "CFM"],
              ["EXHAUST FLOW", exhaustFlowLbMin.toFixed(2), "LB/MIN"],
            ].map(([label, value, suffix]) => (
              <div key={label} className="min-w-0 border-l border-white/10 pl-2">
                <p className="truncate font-mono text-[9px] tracking-[0.12em] text-zinc-600">{label}</p>
                <p className="truncate font-display text-lg font-semibold tabular-nums text-zinc-100">{value} <span className="font-mono text-[9px] font-normal text-zinc-500">{suffix}</span></p>
              </div>
            ))}
          </div>
          <div className="mt-3 border-t border-white/8 pt-3 font-mono text-[10px] text-zinc-500">
            <div className="flex justify-between"><span>IGNITION ADVANCE</span><span className="text-cyan-300">{tuning.ignitionTimingDegrees.toFixed(0)}°</span></div>
            <div className="mt-1 flex justify-between"><span>VOLUMETRIC EFFICIENCY</span><span className="text-cyan-300">{(tuning.volumetricEfficiency * 100).toFixed(0)}%</span></div>
            <div className="mt-1 flex justify-between"><span>BANK ANGLE</span><span className="text-cyan-300">{tuning.bankAngleDegrees.toFixed(0)}°</span></div>
          </div>
        </Panel>
      </div>
      <div className="grid gap-3 xl:col-span-2 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,.65fr)_minmax(360px,1fr)]">
        <Oscilloscope qualities={qualities} />
        <FiringOrder qualities={qualities} count={Math.max(1, Math.round(tuning.cylinders))} />
        <DynoChart car={car} rpm={rpm} />
      </div>
    </section>
  )
}
