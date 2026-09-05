import { useCallback, useEffect, useMemo } from "react"
import { useDialKitController, type DialConfig } from "dialkit"
import { resolveDialValues } from "dialkit/store"
import type { CarSpec } from "./cars"
import type { CommunityEngineProfile } from "./communityEngine"
import type { PhysicsTuning } from "./physics"

const KG_TO_LB = 2.2046226218
const INCHES_TO_METERS = 0.0254
const finiteOr = (value: unknown, fallback: number) => typeof value === "number" && Number.isFinite(value) ? value : fallback

const ENGINE_SOUND_DEFAULTS = {
  comet: { cylinders: 4, displacementCuIn: 122, compressionRatio: 11.7, exhaustLengthIn: 31 },
  vortex: { cylinders: 6, displacementCuIn: 183, compressionRatio: 10.8, exhaustLengthIn: 34 },
  titan: { cylinders: 8, displacementCuIn: 376, compressionRatio: 10.2, exhaustLengthIn: 42 },
} as const

export type BodyMotionTuning = {
  motionBlurStrength: number
  motionBlurStartMph: number
  motionBlurFullMph: number
}

export type VehicleDynamicsTuning = {
  wheelbaseMeters: number
  trackWidthMeters: number
  centerOfMassDropMeters: number
  suspensionRestLengthMeters: number
  maxSuspensionTravelMeters: number
  suspensionStiffness: number
  compressionDamping: number
  reboundDamping: number
  maxSuspensionForceNewtons: number
  steeringLockRadians: number
  steeringResponse: number
  steeringSpeedSensitivity: number
  frontSideFriction: number
  rearSideFriction: number
  longitudinalFrictionSlip: number
  frontBrakeBias: number
  rearDriveBias: number
  chassisAngularDamping: number
  chassisLinearDamping: number
}

export type EngineSoundTuning = {
  cylinders: number
  displacementCuIn: number
  compressionRatio: number
  exhaustLengthIn: number
  pulseWidthDegrees: number
  exhaustResonance: number
  mechanicalNoise: number
  masterGain: number
  ignitionTimingDegrees: number
  volumetricEfficiency: number
  bankAngleDegrees: number
}

export function useCarTuning(car: CarSpec) {
  const soundDefaults = ENGINE_SOUND_DEFAULTS[car.id as keyof typeof ENGINE_SOUND_DEFAULTS] ?? ENGINE_SOUND_DEFAULTS.comet
  const suspensionForceDefaultLb = Math.round((car.massKg * 9.81 * 3 / 4 / 4.4482216153) / 50) * 50
  const config = useMemo(() => ({
    Engine: {
      rpmLimiter: [car.redline, 1000, 15000, 100],
      idleRpm: [car.idleRpm, 500, 1800, 50],
      torqueScale: [1, 0.5, 2, 0.01],
      rpmRiseSpeed: [12000, 500, 30000, 100],
      rpmSlowDownSpeed: [9000, 500, 30000, 100],
      throttleRiseSpeed: [12, 1, 30, 0.5],
      throttleReleaseSpeed: [12, 1, 30, 0.5],
      engineBraking: [0.16, 0, 0.5, 0.01],
    },
    "Engine Sound": {
      cylinders: [soundDefaults.cylinders, 1, 24, 1],
      displacementCuIn: [soundDefaults.displacementCuIn, 30, 3000, 1],
      compressionRatio: [soundDefaults.compressionRatio, 6, 30, 0.1],
      exhaustLengthIn: [soundDefaults.exhaustLengthIn, 8, 120, 1],
      pulseWidthDegrees: [26, 8, 90, 1],
      exhaustResonance: [0.48, 0, 0.98, 0.01],
      mechanicalNoise: [0.08, 0, 0.5, 0.01],
      masterGain: [0.9, 0.05, 2, 0.05],
      ignitionTimingDegrees: [18, 0, 45, 1],
      volumetricEfficiency: [0.88, 0.45, 1.35, 0.01],
      bankAngleDegrees: [car.id === "comet" ? 0 : car.id === "vortex" ? 60 : 90, 0, 90, 5],
    },
    Drivetrain: {
      finalDrive: [car.finalDrive, 2, 6, 0.01],
      reverseGear: [car.reverseGear, 0.5, 5, 0.01],
      firstGear: [car.gears[0], 0.5, 5, 0.01],
      secondGear: [car.gears[1], 0.5, 5, 0.01],
      thirdGear: [car.gears[2], 0.5, 5, 0.01],
      fourthGear: [car.gears[3], 0.5, 5, 0.01],
      fifthGear: [car.gears[4], 0.5, 5, 0.01],
      sixthGear: [car.gears[5], 0.5, 5, 0.01],
      efficiency: [0.87, 0.6, 1, 0.01],
      autoUpShift: [0.97, 0.6, 1, 0.01],
      autoDownShift: [0.43, 0.2, 0.8, 0.01],
      maxClutchTorqueLbFt: [1000, 200, 1800, 10],
      clutchSlipStiffness: [0.08, 0.01, 0.25, 0.01],
      clutchResponseMs: [1, 1, 250, 1],
      autoClutchResponse: [0.025, 0.01, 0.2, 0.005],
      smoothClutchResponse: [1, 0.2, 2.5, 0.05],
      smoothInputScale: [0.16, 0.05, 0.5, 0.01],
    },
    Chassis: {
      curbWeightLb: [Math.round(car.massKg * KG_TO_LB), 1200, 6000, 10],
      tireRadiusIn: [13.4, 8, 22, 0.1],
      brakeForceLb: [2920, 1000, 6000, 10],
      rollingResistance: [0.013, 0.005, 0.04, 0.001],
      aeroDragScale: [1, 0.4, 2, 0.01],
    },
    "Vehicle Physics": {
      wheelbaseIn: [105, 78, 132, 1],
      trackWidthIn: [63, 48, 80, 1],
      centerOfMassDropIn: [8, 0, 18, 0.5],
      suspensionRestLengthIn: [6.5, 2, 14, 0.25],
      suspensionTravelIn: [4.5, 1, 12, 0.25],
      springStiffness: [38, 8, 90, 1],
      bumpDamping: [4.8, 0.5, 15, 0.1],
      reboundDamping: [6.2, 0.5, 18, 0.1],
      maxSuspensionForceLb: [suspensionForceDefaultLb, 1200, 12000, 50],
      steeringLockDeg: [40, 12, 52, 1],
      steeringResponse: [7.5, 1, 14, 0.1],
      highSpeedSteeringReduction: [0.5, 0, 0.9, 0.01],
      frontLateralGrip: [0.45, 0.1, 2, 0.01],
      rearLateralGrip: [0.5, 0.1, 2, 0.01],
      tireGripLimit: [1.05, 0.5, 3, 0.05],
      frontBrakeBias: [0.62, 0.35, 0.8, 0.01],
      rearDriveBias: [1, 0, 1, 0.05],
      angularDamping: [0.38, 0, 2, 0.01],
      linearDamping: [0.03, 0, 0.4, 0.01],
    },
    Visuals: {
      motionBlurStrength: [0.06, 0, 0.1, 0.001],
      motionBlurStartMph: [35, 0, 120, 1],
      motionBlurFullMph: [160, 80, 280, 5],
      tachInnerArc: [24, 0, 80, 1],
      tachOuterArcDelta: [28, 14, 64, 1],
      tachLowBarWidth: [10, 1, 250, 1],
      tachHighBarWidth: [125, 1, 250, 1],
      tachBarGap: [20, 2, 80, 1],
    },
  }) satisfies DialConfig, [car, soundDefaults, suspensionForceDefaultLb])

  const dial = useDialKitController(`Tune ${car.name}`, config, {
    id: `torque-zero-${car.id}`,
    persist: true,
  })
  const values = dial.values
  const currentVersionDefaults = useMemo(() => resolveDialValues(config, {}), [config])

  useEffect(() => {
    const vehicle = values["Vehicle Physics"]
    if (
      finiteOr(vehicle.steeringLockDeg, 40) === 34
      && finiteOr(vehicle.steeringResponse, 7.5) === 5.8
      && finiteOr(vehicle.highSpeedSteeringReduction, 0.5) === 0.68
    ) {
      dial.setValue("Vehicle Physics.steeringLockDeg", 40)
      dial.setValue("Vehicle Physics.steeringResponse", 7.5)
      dial.setValue("Vehicle Physics.highSpeedSteeringReduction", 0.5)
    }
    if (finiteOr(vehicle.maxSuspensionForceLb, suspensionForceDefaultLb) === 5500) {
      dial.setValue("Vehicle Physics.maxSuspensionForceLb", suspensionForceDefaultLb)
    }
  }, [dial, suspensionForceDefaultLb, values])

  useEffect(() => {
    const collapsePanel = () => {
      const title = [...document.querySelectorAll<HTMLElement>(".dialkit-folder-title")]
        .find((element) => element.textContent?.trim() === `Tune ${car.name}`)
      const folder = title?.closest<HTMLElement>(".dialkit-folder")
      const header = folder?.querySelector<HTMLElement>(":scope > .dialkit-folder-header")
      if (!folder || !header) return false
      if (folder.dataset.open === "true") header.click()
      return true
    }

    if (collapsePanel()) return
    const observer = new MutationObserver(() => {
      if (collapsePanel()) observer.disconnect()
    })
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [car.name])

  const applyEngineProfile = useCallback((profile: CommunityEngineProfile) => {
    if (profile.redlineRpm) dial.setValue("Engine.rpmLimiter", profile.redlineRpm)
    dial.setValue("Engine Sound.cylinders", profile.cylinders)
    if (profile.displacementCuIn) dial.setValue("Engine Sound.displacementCuIn", profile.displacementCuIn)
    if (profile.compressionRatio) dial.setValue("Engine Sound.compressionRatio", profile.compressionRatio)
    if (profile.exhaustLengthIn) dial.setValue("Engine Sound.exhaustLengthIn", profile.exhaustLengthIn)
    if (profile.mechanicalNoise !== undefined) dial.setValue("Engine Sound.mechanicalNoise", Math.min(0.5, profile.mechanicalNoise))
  }, [dial])

  const resetEngine = useCallback(() => {
    dial.setValues({
      Engine: {
        rpmLimiter: car.redline,
        idleRpm: car.idleRpm,
        torqueScale: 1,
        rpmRiseSpeed: 12000,
        rpmSlowDownSpeed: 9000,
        throttleRiseSpeed: 12,
        throttleReleaseSpeed: 12,
        engineBraking: 0.16,
      },
      "Engine Sound": {
        cylinders: soundDefaults.cylinders,
        displacementCuIn: soundDefaults.displacementCuIn,
        compressionRatio: soundDefaults.compressionRatio,
        exhaustLengthIn: soundDefaults.exhaustLengthIn,
        pulseWidthDegrees: 26,
        exhaustResonance: 0.48,
        mechanicalNoise: 0.08,
        masterGain: 0.9,
        ignitionTimingDegrees: 18,
        volumetricEfficiency: 0.88,
        bankAngleDegrees: car.id === "comet" ? 0 : car.id === "vortex" ? 60 : 90,
      },
    })
  }, [car, dial, soundDefaults])

  const resetCurrentVersion = useCallback(() => {
    // setValues writes to the active DialKit version. Unlike resetValues, it
    // neither switches back to Version 1 nor touches sibling presets.
    dial.setValues(currentVersionDefaults)
  }, [currentVersionDefaults, dial])

  const tunedCar = useMemo<CarSpec>(() => ({
    ...car,
    idleRpm: finiteOr(values.Engine.idleRpm, car.idleRpm),
    redline: Math.max(finiteOr(values.Engine.rpmLimiter, car.redline), finiteOr(values.Engine.idleRpm, car.idleRpm) + 1000),
    finalDrive: finiteOr(values.Drivetrain.finalDrive, car.finalDrive),
    reverseGear: finiteOr(values.Drivetrain.reverseGear, car.reverseGear),
    gears: [
      finiteOr(values.Drivetrain.firstGear, car.gears[0]),
      finiteOr(values.Drivetrain.secondGear, car.gears[1]),
      finiteOr(values.Drivetrain.thirdGear, car.gears[2]),
      finiteOr(values.Drivetrain.fourthGear, car.gears[3]),
      finiteOr(values.Drivetrain.fifthGear, car.gears[4]),
      finiteOr(values.Drivetrain.sixthGear, car.gears[5]),
    ],
    massKg: finiteOr(values.Chassis.curbWeightLb, car.massKg * KG_TO_LB) / KG_TO_LB,
    dragArea: car.dragArea * finiteOr(values.Chassis.aeroDragScale, 1),
    torqueCurve: car.torqueCurve.map((point) => ({ ...point, torque: point.torque * finiteOr(values.Engine.torqueScale, 1) })),
  }), [car, values])

  const physics = useMemo<PhysicsTuning>(() => ({
    wheelRadiusMeters: finiteOr(values.Chassis.tireRadiusIn, 13.4) * INCHES_TO_METERS,
    drivetrainEfficiency: finiteOr(values.Drivetrain.efficiency, 0.87),
    rpmRisePerSecond: finiteOr(values.Engine.rpmRiseSpeed, 12000),
    rpmFallPerSecond: finiteOr(values.Engine.rpmSlowDownSpeed, 9000),
    throttleRisePerSecond: finiteOr(values.Engine.throttleRiseSpeed, 12),
    throttleFallPerSecond: finiteOr(values.Engine.throttleReleaseSpeed, 12),
    engineBrakingRatio: finiteOr(values.Engine.engineBraking, 0.16),
    automaticUpshiftRatio: finiteOr(values.Drivetrain.autoUpShift, 0.97),
    automaticDownshiftRatio: finiteOr(values.Drivetrain.autoDownShift, 0.43),
    brakeForceNewtons: finiteOr(values.Chassis.brakeForceLb, 2920) * 4.4482216153,
    rollingResistance: finiteOr(values.Chassis.rollingResistance, 0.013),
    steeringGain: 0,
    maxSteeringRate: 0,
    maxClutchTorqueNm: finiteOr(values.Drivetrain.maxClutchTorqueLbFt, 1000) * 1.3558179483,
    clutchSlipStiffness: finiteOr(values.Drivetrain.clutchSlipStiffness, 0.08),
    clutchResponseSeconds: finiteOr(values.Drivetrain.clutchResponseMs, 1) / 1000,
    automaticClutchResponseSeconds: finiteOr(values.Drivetrain.autoClutchResponse, 0.025),
    smoothClutchResponseSeconds: finiteOr(values.Drivetrain.smoothClutchResponse, 1),
    smoothInputScale: finiteOr(values.Drivetrain.smoothInputScale, 0.16),
    externallySimulated: true,
  }), [values])

  const vehicleDynamics = useMemo<VehicleDynamicsTuning>(() => ({
    wheelbaseMeters: finiteOr(values["Vehicle Physics"].wheelbaseIn, 105) * INCHES_TO_METERS,
    trackWidthMeters: finiteOr(values["Vehicle Physics"].trackWidthIn, 63) * INCHES_TO_METERS,
    centerOfMassDropMeters: finiteOr(values["Vehicle Physics"].centerOfMassDropIn, 8) * INCHES_TO_METERS,
    suspensionRestLengthMeters: finiteOr(values["Vehicle Physics"].suspensionRestLengthIn, 6.5) * INCHES_TO_METERS,
    maxSuspensionTravelMeters: finiteOr(values["Vehicle Physics"].suspensionTravelIn, 4.5) * INCHES_TO_METERS,
    suspensionStiffness: finiteOr(values["Vehicle Physics"].springStiffness, 38),
    compressionDamping: finiteOr(values["Vehicle Physics"].bumpDamping, 4.8),
    reboundDamping: finiteOr(values["Vehicle Physics"].reboundDamping, 6.2),
    maxSuspensionForceNewtons: finiteOr(values["Vehicle Physics"].maxSuspensionForceLb, suspensionForceDefaultLb) * 4.4482216153,
    steeringLockRadians: finiteOr(values["Vehicle Physics"].steeringLockDeg, 40) * Math.PI / 180,
    steeringResponse: finiteOr(values["Vehicle Physics"].steeringResponse, 7.5),
    steeringSpeedSensitivity: finiteOr(values["Vehicle Physics"].highSpeedSteeringReduction, 0.5),
    frontSideFriction: finiteOr(values["Vehicle Physics"].frontLateralGrip, 0.45),
    rearSideFriction: finiteOr(values["Vehicle Physics"].rearLateralGrip, 0.5),
    longitudinalFrictionSlip: finiteOr(values["Vehicle Physics"].tireGripLimit, 1.05),
    frontBrakeBias: finiteOr(values["Vehicle Physics"].frontBrakeBias, 0.62),
    rearDriveBias: finiteOr(values["Vehicle Physics"].rearDriveBias, 1),
    chassisAngularDamping: finiteOr(values["Vehicle Physics"].angularDamping, 0.38),
    chassisLinearDamping: finiteOr(values["Vehicle Physics"].linearDamping, 0.03),
  }), [suspensionForceDefaultLb, values])

  const bodyMotion = useMemo<BodyMotionTuning>(() => ({
    motionBlurStrength: finiteOr(values.Visuals.motionBlurStrength, 0.06),
    motionBlurStartMph: finiteOr(values.Visuals.motionBlurStartMph, 35),
    motionBlurFullMph: finiteOr(values.Visuals.motionBlurFullMph, 160),
  }), [values])

  const engineSound = useMemo<EngineSoundTuning>(() => ({
    cylinders: Math.round(finiteOr(values["Engine Sound"].cylinders, soundDefaults.cylinders)),
    displacementCuIn: finiteOr(values["Engine Sound"].displacementCuIn, soundDefaults.displacementCuIn),
    compressionRatio: finiteOr(values["Engine Sound"].compressionRatio, soundDefaults.compressionRatio),
    exhaustLengthIn: finiteOr(values["Engine Sound"].exhaustLengthIn, soundDefaults.exhaustLengthIn),
    pulseWidthDegrees: finiteOr(values["Engine Sound"].pulseWidthDegrees, 26),
    exhaustResonance: finiteOr(values["Engine Sound"].exhaustResonance, 0.48),
    mechanicalNoise: finiteOr(values["Engine Sound"].mechanicalNoise, 0.08),
    masterGain: finiteOr(values["Engine Sound"].masterGain, 0.9),
    ignitionTimingDegrees: finiteOr(values["Engine Sound"].ignitionTimingDegrees, 18),
    volumetricEfficiency: finiteOr(values["Engine Sound"].volumetricEfficiency, 0.88),
    bankAngleDegrees: finiteOr(values["Engine Sound"].bankAngleDegrees, car.id === "comet" ? 0 : car.id === "vortex" ? 60 : 90),
  }), [car.id, soundDefaults, values])

  const tachInnerArc = finiteOr(values.Visuals.tachInnerArc, 24)
  const tachOuterArcDelta = finiteOr(values.Visuals.tachOuterArcDelta, 28)
  const tachLowBarWidth = finiteOr(values.Visuals.tachLowBarWidth, 10)
  const tachHighBarWidth = finiteOr(values.Visuals.tachHighBarWidth, 125)
  const tachBarGap = finiteOr(values.Visuals.tachBarGap, 20)

  return { tunedCar, physics, vehicleDynamics, bodyMotion, engineSound, tachInnerArc, tachOuterArcDelta, tachLowBarWidth, tachHighBarWidth, tachBarGap, applyEngineProfile, resetEngine, resetCurrentVersion }
}
