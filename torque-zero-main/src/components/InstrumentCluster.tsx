const DIGIT_SEGMENTS: Record<string, string[]> = {
  "0": ["topLeft", "top", "topRight", "upperLeft", "upperRight", "lowerLeft", "lowerRight", "bottomLeft", "bottom", "bottomRight"],
  "1": ["topRight", "upperRight", "lowerRight", "bottomRight"],
  "2": ["topLeft", "top", "topRight", "upperRight", "middleRight", "middle", "middleLeft", "lowerLeft", "bottomLeft", "bottom", "bottomRight"],
  "3": ["topLeft", "top", "topRight", "upperRight", "middleRight", "middle", "middleLeft", "lowerRight", "bottomLeft", "bottom", "bottomRight"],
  "4": ["topLeft", "topRight", "upperLeft", "upperRight", "middleLeft", "middle", "middleRight", "lowerRight", "bottomRight"],
  "5": ["topLeft", "top", "topRight", "upperLeft", "middleLeft", "middle", "middleRight", "lowerRight", "bottomLeft", "bottom", "bottomRight"],
  "6": ["topLeft", "top", "topRight", "upperLeft", "middleLeft", "middle", "middleRight", "lowerLeft", "lowerRight", "bottomLeft", "bottom", "bottomRight"],
  "7": ["topLeft", "top", "topRight", "upperRight", "lowerRight", "bottomRight"],
  "8": ["topLeft", "top", "topRight", "upperLeft", "upperRight", "middleLeft", "middle", "middleRight", "lowerLeft", "lowerRight", "bottomLeft", "bottom", "bottomRight"],
  "9": ["topLeft", "top", "topRight", "upperLeft", "upperRight", "middleLeft", "middle", "middleRight", "lowerRight", "bottomLeft", "bottom", "bottomRight"],
}

const SEGMENT_PATHS: Record<string, string> = {
  topLeft: "M12 2H14V13H3Q1.5 13 2 10Q3 4 12 2Z",
  top: "M15 2H41V13H15Z",
  topRight: "M42 2H44Q53 4 54 10Q54.5 13 53 13H42Z",
  upperLeft: "M2 14H13V36L7.5 41L2 38Z",
  upperRight: "M43 14H54V38L48.5 41L43 36Z",
  middleLeft: "M7 42L13.5 37H17V49H13.5L7 44Z",
  middle: "M18 37H38V49H18Z",
  middleRight: "M39 37H42.5L49 42L49 44L42.5 49H39Z",
  lowerLeft: "M2 48L7.5 43L13 48V73H2Z",
  lowerRight: "M43 48L48.5 43L54 48V73H43Z",
  bottomLeft: "M2 74H14V85H12Q3 83 2 77Z",
  bottom: "M15 74H41V85H15Z",
  bottomRight: "M42 74H54V77Q53 83 44 85H42Z",
}

function ThirteenSegmentDigit({ value }: { value: string }) {
  const active = new Set(DIGIT_SEGMENTS[value] ?? [])
  return (
    <svg aria-hidden="true" viewBox="0 0 56 87" className="h-14 w-9 overflow-visible sm:h-[4.5rem] sm:w-12">
      {Object.entries(SEGMENT_PATHS).map(([segment, path]) => (
        <path
          key={segment}
          d={path}
          className={active.has(segment) ? "fill-[#ff5441] stroke-[#8d211a]" : "fill-[#25100e] stroke-[#351310]"}
          strokeWidth="0.55"
          strokeLinejoin="round"
          style={active.has(segment) ? { filter: "drop-shadow(0 0 4px rgba(255,76,51,.65))" } : undefined}
        />
      ))}
    </svg>
  )
}

function ThirteenSegmentSpeed({ speedMph }: { speedMph: number }) {
  const digits = Math.max(0, Math.min(999, Math.round(speedMph))).toString().padStart(3, " ")
  return (
    <div className="flex items-end justify-center gap-2" aria-label={`${Math.round(speedMph)} miles per hour`}>
      <div className="flex gap-1" aria-hidden="true">
        {[...digits].map((digit, index) => <ThirteenSegmentDigit key={`${index}-${digit}`} value={digit} />)}
      </div>
      <span className="mb-1 font-mono text-sm font-semibold tracking-[0.18em] text-[#ff725c]">MPH</span>
    </div>
  )
}

type InstrumentClusterProps = {
  rpm: number
  redline: number
  speedMph: number
  innerArc: number
  outerArcDelta: number
  lowBarWidth: number
  highBarWidth: number
  barGap: number
}

type Point = { x: number; y: number }

const polarPoint = (centerX: number, centerY: number, radius: number, angle: number): Point => ({
  x: centerX + radius * Math.sin(angle),
  y: centerY - radius * Math.cos(angle),
})

const pointText = (point: Point) => `${point.x.toFixed(3)} ${point.y.toFixed(3)}`

function annularWedgePath(centerX: number, centerY: number, innerRadius: number, outerRadius: number, startAngle: number, endAngle: number) {
  const innerStart = polarPoint(centerX, centerY, innerRadius, startAngle)
  const outerStart = polarPoint(centerX, centerY, outerRadius, startAngle)
  const outerEnd = polarPoint(centerX, centerY, outerRadius, endAngle)
  const innerEnd = polarPoint(centerX, centerY, innerRadius, endAngle)
  return [
    `M ${pointText(innerStart)}`,
    `L ${pointText(outerStart)}`,
    `A ${outerRadius.toFixed(3)} ${outerRadius.toFixed(3)} 0 0 1 ${pointText(outerEnd)}`,
    `L ${pointText(innerEnd)}`,
    `A ${innerRadius.toFixed(3)} ${innerRadius.toFixed(3)} 0 0 0 ${pointText(innerStart)}`,
    "Z",
  ].join(" ")
}

export function InstrumentCluster({
  rpm,
  redline,
  speedMph,
  innerArc,
  outerArcDelta,
  lowBarWidth,
  highBarWidth,
  barGap,
}: InstrumentClusterProps) {
  const referenceBarCount = 44
  const safeRedline = Math.max(1, redline)
  const safeInnerArc = Math.max(0, Math.min(80, Number.isFinite(innerArc) ? innerArc : 24))
  const safeOuterArcDelta = Math.max(14, Math.min(64, Number.isFinite(outerArcDelta) ? outerArcDelta : 28))
  const safeLowBarWidth = Math.round(Math.max(1, Math.min(250, Number.isFinite(lowBarWidth) ? lowBarWidth : 10)))
  const safeHighBarWidth = Math.round(Math.max(1, Math.min(250, Number.isFinite(highBarWidth) ? highBarWidth : 125)))
  const safeBarGap = Math.max(0.02, Math.min(0.8, Number.isFinite(barGap) ? barGap / 100 : 0.2))
  const rpmProgress = Math.max(0, Math.min(1, rpm / safeRedline))
  const redlineStart = 0.88
  const labelMaximum = Math.ceil(safeRedline / 1000)
  const centerX = 500
  const halfChord = 465
  const effectiveSag = Math.max(0.5, safeInnerArc)
  const innerRadius = (halfChord * halfChord) / (2 * effectiveSag) + effectiveSag / 2
  const outerRadius = innerRadius + safeOuterArcDelta
  const halfAngle = Math.asin(Math.min(0.999, halfChord / innerRadius))
  const centerY = outerRadius + 4
  const totalAngle = halfAngle * 2
  const angularUnit = totalAngle / referenceBarCount
  const averageBarWidth = angularUnit * (safeLowBarWidth + safeHighBarWidth) / 200
  const requestedGap = angularUnit * safeBarGap
  const widthsForCount = (count: number) => Array.from({ length: count }, (_, index) => {
    const progress = count === 1 ? 0 : index / (count - 1)
    const interpolatedWidth = safeLowBarWidth + (safeHighBarWidth - safeLowBarWidth) * progress
    return angularUnit * Math.round(interpolatedWidth) / 100
  })
  const packedWidth = (widths: number[]) => widths.reduce((sum, width) => sum + width, 0)
    + Math.max(0, widths.length - 1) * requestedGap
  let barCount = Math.max(8, Math.min(240, Math.floor((totalAngle + requestedGap) / (averageBarWidth + requestedGap))))
  let barWidths = widthsForCount(barCount)
  while (barCount > 8 && packedWidth(barWidths) > totalAngle) {
    barCount -= 1
    barWidths = widthsForCount(barCount)
  }
  while (barCount < 240) {
    const nextWidths = widthsForCount(barCount + 1)
    if (packedWidth(nextWidths) > totalAngle) break
    barCount += 1
    barWidths = nextWidths
  }
  const totalBarWidth = barWidths.reduce((sum, width) => sum + width, 0)
  const fittedGap = barCount > 1 ? Math.max(0, (totalAngle - totalBarWidth) / (barCount - 1)) : 0
  const barStarts = barWidths.map((_, index) => -halfAngle
    + barWidths.slice(0, index).reduce((sum, width) => sum + width, 0)
    + index * fittedGap)
  const activeBars = Math.round(rpmProgress * barCount)
  const viewHeight = safeOuterArcDelta + safeInnerArc + 24

  return (
    <div className="min-w-0 px-3 pb-2 pt-2 sm:px-5">
      <div className="mb-1.5 flex items-end justify-between font-mono text-[10px] tracking-[0.16em] text-zinc-500">
        <span>RPM ×1000</span>
        <span className="tabular-nums text-zinc-300">{Math.round(rpm).toLocaleString()} RPM</span>
      </div>

      <svg
        className="block h-auto w-full overflow-visible"
        viewBox={`0 0 1000 ${viewHeight}`}
        preserveAspectRatio="xMidYMid meet"
        role="meter"
        aria-label="Engine speed"
        aria-valuemin={0}
        aria-valuemax={redline}
        aria-valuenow={Math.round(rpm)}
      >
        {barWidths.map((barAngularWidth, index) => {
          const progress = index / (barCount - 1)
          const startAngle = barStarts[index]
          const endAngle = startAngle + barAngularWidth
          const active = index < activeBars
          const inRedline = progress >= redlineStart
          return (
            <path
              key={index}
              d={annularWedgePath(centerX, centerY, innerRadius, outerRadius, startAngle, endAngle)}
              fill={active ? (inRedline ? "#ff3d32" : "#ff943d") : (inRedline ? "#351615" : "#29201c")}
              style={active ? { filter: `drop-shadow(0 0 ${inRedline ? 5 : 3}px ${inRedline ? "rgba(255,61,50,.7)" : "rgba(255,148,61,.5)"})` } : undefined}
            />
          )
        })}
        {[0, 0.25, 0.5, 0.75, 1].map((position) => {
          const angle = -halfAngle + position * halfAngle * 2
          const point = polarPoint(centerX, centerY, innerRadius - 13, angle)
          return (
            <text
              key={position}
              x={point.x}
              y={point.y}
              fill="#71717a"
              fontFamily="var(--font-mono)"
              fontSize="10"
              textAnchor="middle"
              dominantBaseline="middle"
              aria-hidden="true"
            >
              {Math.round(labelMaximum * position)}
            </text>
          )
        })}
      </svg>

      <ThirteenSegmentSpeed speedMph={speedMph} />
    </div>
  )
}
