import { useMemo } from "react"
import { graphData, peakStats, type CarSpec } from "@/game/cars"
import { displayTorque } from "@/game/units"

type CompactDynoChartProps = {
  car: CarSpec
  rpm: number
}

export function CompactDynoChart({ car, rpm }: CompactDynoChartProps) {
  const data = useMemo(
    () => graphData(car).map((point) => ({ ...point, torque: displayTorque(point.torque) })),
    [car],
  )
  const peaks = useMemo(() => peakStats(car), [car])
  const maxY = Math.max(1, peaks.hp, displayTorque(peaks.torque))
  const width = 240
  const height = 60
  const inset = 4
  const x = (value: number) => inset + (value / Math.max(1, car.redline)) * (width - inset * 2)
  const y = (value: number) => height - inset - (value / maxY) * (height - inset * 2)
  const points = (key: "torque" | "hp") => data
    .map((point) => `${x(point.rpm).toFixed(1)},${y(point[key]).toFixed(1)}`)
    .join(" ")
  const currentX = x(Math.max(0, Math.min(car.redline, rpm)))

  return (
    <div className="mobile-dyno" aria-label={`Live torque and horsepower curves. Current engine speed ${Math.round(rpm).toLocaleString()} RPM.`}>
      <div className="mobile-dyno__legend" aria-hidden="true">
        <span className="text-pink-400">TQ</span>
        <span className="text-cyan-300">HP</span>
        <span className="ml-auto text-zinc-300">{Math.round(rpm).toLocaleString()} RPM</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="mobile-dyno__plot" role="img" aria-label="Torque and horsepower by engine RPM">
        <line x1={inset} x2={width - inset} y1={height - inset} y2={height - inset} stroke="rgba(255,255,255,.16)" />
        <polyline points={points("torque")} fill="none" stroke="#ff3d9a" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        <polyline points={points("hp")} fill="none" stroke="#18d7ff" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        <line x1={currentX} x2={currentX} y1={inset} y2={height - inset} stroke="#fff" strokeWidth="2" strokeDasharray="3 3" />
      </svg>
    </div>
  )
}
