const MPS_TO_MPH = 2.2369362921
const METERS_TO_MILES = 0.0006213711922
const NM_TO_LB_FT = 0.7375621493

export function displaySpeed(speedMps: number) {
  return speedMps * MPS_TO_MPH
}

export function displayDistance(distanceMeters: number) {
  return distanceMeters * METERS_TO_MILES
}

export function displayTorque(torqueNm: number) {
  return torqueNm * NM_TO_LB_FT
}

export function accelerationBenchmark() {
  return { label: "0–60 MPH", target: 60 }
}
