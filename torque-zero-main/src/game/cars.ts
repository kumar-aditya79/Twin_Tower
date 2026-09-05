export type TorquePoint = { rpm: number; torque: number }

export type CarSpec = {
  id: string
  name: string
  className: string
  description: string
  color: string
  accent: string
  massKg: number
  redline: number
  idleRpm: number
  finalDrive: number
  reverseGear: number
  gears: number[]
  dragArea: number
  torqueCurve: TorquePoint[]
}

export const CARS: CarSpec[] = [
  {
    id: "comet",
    name: "Synkro",
    className: "HIGH-REV",
    description: "Light, modest torque, strong power near redline.",
    color: "#a3ff12",
    accent: "#f5ff76",
    massKg: 960,
    redline: 9000,
    idleRpm: 1100,
    finalDrive: 4.1,
    reverseGear: 3.05,
    gears: [3.2, 2.18, 1.6, 1.24, 1.0, 0.82],
    dragArea: 0.57,
    torqueCurve: [
      { rpm: 1000, torque: 170 }, { rpm: 2000, torque: 205 }, { rpm: 3000, torque: 238 },
      { rpm: 4000, torque: 262 }, { rpm: 5000, torque: 282 }, { rpm: 6000, torque: 300 },
      { rpm: 7000, torque: 312 }, { rpm: 8000, torque: 306 }, { rpm: 9000, torque: 270 },
    ],
  },
  {
    id: "vortex",
    name: "RD-02",
    className: "BALANCED",
    description: "Broad torque band with power that builds smoothly.",
    color: "#18d7ff",
    accent: "#89efff",
    massKg: 1240,
    redline: 7600,
    idleRpm: 900,
    finalDrive: 3.72,
    reverseGear: 2.9,
    gears: [3.02, 2.07, 1.5, 1.17, 0.96, 0.78],
    dragArea: 0.61,
    torqueCurve: [
      { rpm: 1000, torque: 280 }, { rpm: 2000, torque: 360 }, { rpm: 3000, torque: 410 },
      { rpm: 4000, torque: 440 }, { rpm: 5000, torque: 448 }, { rpm: 6000, torque: 432 },
      { rpm: 7000, torque: 400 }, { rpm: 7600, torque: 360 },
    ],
  },
  {
    id: "titan",
    name: "Piledriver",
    className: "TORQUE",
    description: "Heavy launch force, early peak, lower redline.",
    color: "#ff3d9a",
    accent: "#ff95c8",
    massKg: 1510,
    redline: 6500,
    idleRpm: 800,
    finalDrive: 3.42,
    reverseGear: 2.7,
    gears: [2.82, 1.92, 1.38, 1.08, 0.86, 0.7],
    dragArea: 0.67,
    torqueCurve: [
      { rpm: 800, torque: 390 }, { rpm: 1500, torque: 530 }, { rpm: 2500, torque: 610 },
      { rpm: 3500, torque: 625 }, { rpm: 4500, torque: 595 }, { rpm: 5500, torque: 530 },
      { rpm: 6500, torque: 440 },
    ],
  },
]

export function torqueAtRpm(car: CarSpec, rpm: number) {
  const points = car.torqueCurve
  if (rpm <= points[0].rpm) return points[0].torque
  if (rpm >= points[points.length - 1].rpm) return points[points.length - 1].torque
  const upperIndex = points.findIndex((point) => point.rpm >= rpm)
  const lower = points[upperIndex - 1]
  const upper = points[upperIndex]
  const mix = (rpm - lower.rpm) / (upper.rpm - lower.rpm)
  return lower.torque + (upper.torque - lower.torque) * mix
}

export function horsepower(torqueNm: number, rpm: number) {
  return (torqueNm * rpm) / 7127
}

export function graphData(car: CarSpec) {
  const data = []
  for (let rpm = 0; rpm <= car.redline; rpm += 100) {
    const torque = rpm < car.idleRpm ? 0 : torqueAtRpm(car, rpm)
    data.push({ rpm, torque: Math.round(torque), hp: Math.round(horsepower(torque, rpm)) })
  }
  return data
}

export function peakStats(car: CarSpec) {
  const data = graphData(car)
  return {
    torque: Math.max(...data.map((point) => point.torque)),
    hp: Math.max(...data.map((point) => point.hp)),
  }
}
