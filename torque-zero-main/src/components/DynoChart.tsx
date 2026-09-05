import { useMemo } from "react"
import { graphData, peakStats, type CarSpec } from "@/game/cars"
import { displayTorque } from "@/game/units"

type DynoChartProps = { car: CarSpec; rpm: number }

export function DynoChart({ car, rpm }: DynoChartProps) {
  const data = useMemo(
    () => graphData(car).map((point) => ({ ...point, torque: Math.round(displayTorque(point.torque)) })),
    [car],
  )
  const peaks = useMemo(() => peakStats(car), [car])
  const displayPeakTorque = displayTorque(peaks.torque)
  const maxY = Math.ceil(Math.max(peaks.hp, displayPeakTorque) / 100) * 100
  const width = 600
  const height = 210
  const margin = { top: 8, right: 10, bottom: 24, left: 42 }
  const plotWidth = width - margin.left - margin.right
  const plotHeight = height - margin.top - margin.bottom
  const x = (value: number) => margin.left + (value / car.redline) * plotWidth
  const y = (value: number) => margin.top + (1 - value / maxY) * plotHeight
  const points = (key: "torque" | "hp") => data.map((point) => `${x(point.rpm).toFixed(1)},${y(point[key]).toFixed(1)}`).join(" ")
  const xTicks = Array.from({ length: 7 }, (_, index) => (car.redline * index) / 6)
  const yTicks = Array.from({ length: 5 }, (_, index) => (maxY * index) / 4)
  const currentX = x(Math.max(0, Math.min(car.redline, rpm)))

  return (
    <section className="@container min-h-72 rounded-lg bg-zinc-950/80 p-3 ring-1 ring-white/10 backdrop-blur-md" aria-labelledby="dyno-title">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="dyno-title" className="truncate font-display text-lg font-semibold text-white">Live dyno curve</h2>
          <p className="text-base text-zinc-400 sm:text-sm">Torque and horsepower over engine speed</p>
        </div>
        <div className="shrink-0 text-right font-mono tabular-nums">
          <p className="text-base text-cyan-300 sm:text-sm">{Math.round(rpm).toLocaleString()} RPM</p>
          <p className="text-base text-zinc-500 sm:text-sm">1,000 RPM / division</p>
        </div>
      </div>
      <div className="mt-2 h-44 @md:h-52">
        <svg viewBox={`0 0 ${width} ${height}`} className="size-full overflow-visible" role="img" aria-label="Torque and horsepower by engine RPM">
          {yTicks.map((tick) => (
            <g key={tick}>
              <line x1={margin.left} x2={width - margin.right} y1={y(tick)} y2={y(tick)} stroke="rgba(255,255,255,0.08)" />
              <text x={margin.left - 8} y={y(tick)} fill="#71717a" fontSize="10" textAnchor="end" dominantBaseline="middle">{Math.round(tick)}</text>
            </g>
          ))}
          <line x1={margin.left} x2={margin.left} y1={margin.top} y2={height - margin.bottom} stroke="#71717a" />
          <line x1={margin.left} x2={width - margin.right} y1={height - margin.bottom} y2={height - margin.bottom} stroke="#71717a" />
          {xTicks.map((tick) => (
            <g key={tick}>
              <line x1={x(tick)} x2={x(tick)} y1={height - margin.bottom} y2={height - margin.bottom + 4} stroke="#71717a" />
              <text x={x(tick)} y={height - 6} fill="#71717a" fontSize="10" textAnchor="middle">{`${Number((tick / 1000).toFixed(1))}k`}</text>
            </g>
          ))}
          <line x1={currentX} x2={currentX} y1={margin.top} y2={height - margin.bottom} stroke="#fff" strokeWidth="2" strokeDasharray="4 4" />
          <polyline points={points("torque")} fill="none" stroke="#ff3d9a" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
          <polyline points={points("hp")} fill="none" stroke="#18d7ff" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      </div>
      <div className="flex items-center gap-5 font-mono text-base sm:text-sm">
        <p className="flex items-center gap-2 text-zinc-300"><span className="size-2.5 shrink-0 rounded-full bg-pink-500" />Torque · lb-ft</p>
        <p className="flex items-center gap-2 text-zinc-300"><span className="size-2.5 shrink-0 rounded-full bg-cyan-400" />Power · hp</p>
      </div>
    </section>
  )
}
