import { horsepower, torqueAtRpm, type CarSpec } from "./cars"

export type DriverInput = {
  throttle: boolean
  reverse: boolean
  brake: boolean
  left: boolean
  right: boolean
  clutch: boolean
  smooth: boolean
  steeringAxis: number
  throttleAxis: number
  brakeAxis: number
}
export type PhysicsInput = DriverInput & {
  automaticClutch?: boolean
  revMatchRpm?: number
}
export type TransmissionMode = "automatic" | "manual"
export type DriveDirection = 1 | -1
export type PhysicsTuning = {
  wheelRadiusMeters: number
  drivetrainEfficiency: number
  rpmRisePerSecond: number
  rpmFallPerSecond: number
  throttleRisePerSecond: number
  throttleFallPerSecond: number
  engineBrakingRatio: number
  automaticUpshiftRatio: number
  automaticDownshiftRatio: number
  brakeForceNewtons: number
  rollingResistance: number
  steeringGain: number
  maxSteeringRate: number
  maxClutchTorqueNm: number
  clutchSlipStiffness: number
  clutchResponseSeconds: number
  automaticClutchResponseSeconds: number
  smoothClutchResponseSeconds: number
  smoothInputScale: number
  externallySimulated: boolean
}
export type Telemetry = {
  speedMps: number
  signedForwardSpeedMps: number
  rpm: number
  gear: number
  driveDirection: DriveDirection
  torqueNm: number
  horsepower: number
  acceleration: number
  distance: number
  lateral: number
  throttle: number
  clutch: number
  wheelForceNewtons: number
  positionX: number
  positionY: number
  positionZ: number
  yaw: number
  lateralAcceleration: number
  slipAngle: number
  groundedWheels: number
  steering: number
}

export const initialTelemetry = (car: CarSpec): Telemetry => ({
  speedMps: 0,
  signedForwardSpeedMps: 0,
  rpm: car.idleRpm,
  gear: 0,
  driveDirection: 1,
  torqueNm: torqueAtRpm(car, car.idleRpm),
  horsepower: horsepower(torqueAtRpm(car, car.idleRpm), car.idleRpm),
  acceleration: 0,
  distance: 0,
  lateral: 0,
  throttle: 0,
  clutch: 1,
  wheelForceNewtons: 0,
  positionX: 25,
  positionY: 1.4,
  positionZ: -26,
  yaw: -Math.PI / 2,
  lateralAcceleration: 0,
  slipAngle: 0,
  groundedWheels: 4,
  steering: 0,
})

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

function approach(current: number, target: number, ratePerSecond: number, dt: number) {
  const step = Math.max(0, ratePerSecond) * dt
  return target > current
    ? Math.min(target, current + step)
    : Math.max(target, current - step)
}

export function stepPhysics(state: Telemetry, car: CarSpec, input: PhysicsInput, delta: number, transmission: TransmissionMode, tuning: PhysicsTuning): Telemetry {
  if (![
    state.speedMps,
    state.signedForwardSpeedMps,
    state.rpm,
    state.gear,
    state.driveDirection,
    state.torqueNm,
    state.horsepower,
    state.acceleration,
    state.distance,
    state.lateral,
    state.throttle,
    state.clutch,
    state.wheelForceNewtons,
    state.positionX,
    state.positionY,
    state.positionZ,
    state.yaw,
    state.lateralAcceleration,
    state.slipAngle,
    state.groundedWheels,
    state.steering,
  ].every(Number.isFinite)) {
    state = initialTelemetry(car)
  }
  const dt = Number.isFinite(delta) ? Math.max(0, Math.min(delta, 0.05)) : 0
  const wheelRadius = Math.max(0.01, tuning.wheelRadiusMeters)
  let gear = state.gear
  const driveDirection: DriveDirection = state.driveDirection === -1 ? -1 : 1
  // Keep the HUD speed unsigned, but couple the engine to wheel motion in the
  // selected range. A rebound while Reverse is selected is wrong-way motion,
  // not positive reverse wheel RPM.
  const rangeAlignedSpeedMps = state.signedForwardSpeedMps * driveDirection
  const wheelRpm = (Math.max(0, rangeAlignedSpeedMps) / (2 * Math.PI * wheelRadius)) * 60
  let activeGearRatio = driveDirection === -1 ? car.reverseGear : car.gears[gear]
  let coupledRpm = Math.max(car.idleRpm, wheelRpm * activeGearRatio * car.finalDrive)

  if (transmission === "automatic" && driveDirection === 1) {
    if (coupledRpm > car.redline * tuning.automaticUpshiftRatio && gear < car.gears.length - 1) gear += 1
    const downshiftRpm = wheelRpm * car.gears[Math.max(0, gear - 1)] * car.finalDrive
    if (coupledRpm < car.redline * tuning.automaticDownshiftRatio && gear > 0 && downshiftRpm < car.redline * 0.88) gear -= 1
    activeGearRatio = car.gears[gear]
    coupledRpm = Math.max(car.idleRpm, wheelRpm * activeGearRatio * car.finalDrive)
  }

  // Space mirrors Engine Simulator's fine-control modifier: it slows the pedal
  // ramp and changes the clutch from a near-instant command to a one-second RC
  // response. Clutch is pressure (1 = locked, 0 = pedal fully depressed).
  const inputScale = input.smooth ? clamp(tuning.smoothInputScale, 0.01, 1) : 1
  const throttleAxis = Number.isFinite(input.throttleAxis) ? input.throttleAxis : 0
  const brakeAxis = Number.isFinite(input.brakeAxis) ? input.brakeAxis : 0
  const steeringAxis = Number.isFinite(input.steeringAxis) ? input.steeringAxis : 0
  const throttleTarget = clamp(Math.max(Number(input.throttle), throttleAxis), 0, 1)
  const throttleRate = (throttleTarget > state.throttle ? tuning.throttleRisePerSecond : tuning.throttleFallPerSecond) * inputScale
  const throttle = approach(state.throttle, throttleTarget, throttleRate, dt)
  const clutchTarget = input.clutch ? 0 : 1
  const clutchRc = input.automaticClutch
    ? tuning.automaticClutchResponseSeconds
    : input.smooth
      ? tuning.smoothClutchResponseSeconds
      : tuning.clutchResponseSeconds
  const clutchAlpha = clutchRc <= 0.001 ? 1 : dt / (dt + clutchRc)
  const clutch = clamp(state.clutch + (clutchTarget - state.clutch) * clutchAlpha, 0, 1)

  // With the clutch open, RPM follows the throttle like an unloaded engine.
  // Clutch pressure then pulls it toward driveline RPM without teleporting it
  // on a gear change. This preserves rev-matched shifts and exposes bad ones.
  const freeRpmTarget = input.revMatchRpm === undefined
    ? car.idleRpm + Math.pow(throttle, 1.35) * (car.redline - car.idleRpm)
    : clamp(input.revMatchRpm, car.idleRpm, car.redline)
  const freeRpmRate = freeRpmTarget >= state.rpm ? tuning.rpmRisePerSecond : tuning.rpmFallPerSecond
  const freelyRevvingRpm = approach(state.rpm, freeRpmTarget, freeRpmRate, dt)
  const couplingRate = 10 * clutch
  const couplingAlpha = 1 - Math.exp(-couplingRate * dt)
  const rpm = clamp(freelyRevvingRpm + (coupledRpm - freelyRevvingRpm) * couplingAlpha, car.idleRpm, car.redline)

  const engineTorque = torqueAtRpm(car, Math.min(rpm, car.redline))
  const revLimiter = transmission === "manual" && rpm >= car.redline ? 0 : 1
  const deliveredThrottle = Math.pow(throttle, 1.2)
  const engineBrakeSpeedFactor = Math.min(1, Math.abs(state.signedForwardSpeedMps) / 4)
  const engineBrakingNm = throttleTarget > 0.001 ? 0 : engineTorque * tuning.engineBrakingRatio * Math.pow(1 - throttle, 1.2) * engineBrakeSpeedFactor
  const engineOutputTorqueNm = engineTorque * deliveredThrottle * revLimiter - engineBrakingNm

  // Engine Simulator models the clutch as a torque-limited constraint whose
  // capacity is proportional to pressure. The slip term transfers flywheel
  // energy during engagement, while the clamp prevents an RPM mismatch from
  // creating an unbounded launch impulse.
  const slipRpm = rpm - coupledRpm
  const clutchCapacityNm = Math.max(0, tuning.maxClutchTorqueNm) * clutch
  const requestedClutchTorqueNm = engineOutputTorqueNm + slipRpm * Math.max(0, tuning.clutchSlipStiffness)
  let transmittedTorqueNm = clamp(requestedClutchTorqueNm, -clutchCapacityNm, clutchCapacityNm)
  // A locked clutch may legitimately transmit negative torque while coasting,
  // but held throttle must not turn a wrong-way rebound into a self-sustaining
  // drivetrain spring across zero speed.
  if (throttle > 0.01 && rangeAlignedSpeedMps <= 0.05) {
    transmittedTorqueNm = Math.max(0, transmittedTorqueNm)
  }
  const wheelForce = (transmittedTorqueNm * activeGearRatio * car.finalDrive * tuning.drivetrainEfficiency) / wheelRadius
  const aeroDrag = 0.5 * 1.225 * car.dragArea * state.speedMps * state.speedMps
  const rollingResistance = state.speedMps > 0.1 ? car.massKg * 9.81 * tuning.rollingResistance : 0
  const brakeAmount = clamp(Math.max(Number(input.brake), brakeAxis), 0, 1)
  const brakeForce = brakeAmount * tuning.brakeForceNewtons
  const rawAcceleration = (wheelForce - aeroDrag - rollingResistance - brakeForce) / car.massKg
  const speedMps = tuning.externallySimulated ? state.speedMps : Math.max(0, state.speedMps + rawAcceleration * dt)
  const acceleration = tuning.externallySimulated ? state.acceleration : speedMps === 0 && rawAcceleration < 0 ? 0 : rawAcceleration
  const steeringRate = Math.min(tuning.maxSteeringRate, speedMps * tuning.steeringGain)
  const steeringInput = clamp(steeringAxis + Number(input.right) - Number(input.left), -1, 1)
  const steering = steeringInput * steeringRate
  const lateral = Math.max(-5.1, Math.min(5.1, state.lateral + steering * dt))

  const nextState = {
    speedMps,
    signedForwardSpeedMps: tuning.externallySimulated ? state.signedForwardSpeedMps : speedMps * driveDirection,
    rpm,
    gear,
    driveDirection,
    torqueNm: engineTorque,
    horsepower: horsepower(engineTorque, rpm),
    acceleration,
    distance: tuning.externallySimulated ? state.distance : state.distance + speedMps * dt,
    lateral,
    throttle,
    clutch,
    wheelForceNewtons: tuning.externallySimulated ? wheelForce : wheelForce - aeroDrag - rollingResistance,
    positionX: state.positionX,
    positionY: state.positionY,
    positionZ: state.positionZ,
    yaw: state.yaw,
    lateralAcceleration: state.lateralAcceleration,
    slipAngle: state.slipAngle,
    groundedWheels: state.groundedWheels,
    steering: state.steering,
  }
  return Object.values(nextState).every(Number.isFinite) ? nextState : initialTelemetry(car)
}
