export type CommunityEngineProfile = {
  name: string
  creator: string
  sourceUrl: string
  cylinders: number
  displacementCuIn?: number
  compressionRatio?: number
  exhaustLengthIn?: number
  mechanicalNoise?: number
  redlineRpm?: number
  simulationFrequency?: number
}

type CatalogPart = {
  id: number
  name: string
  script: string
  short_user?: { name?: string }
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

function firstNumber(script: string, pattern: RegExp) {
  const match = pattern.exec(script)
  if (!match) return undefined
  const value = Number(match[1])
  return Number.isFinite(value) ? value : undefined
}

function dimensionInches(script: string, label: string) {
  const match = new RegExp(`(?:label\\s+${label}\\s*\\(\\s*|input\\s+${label}\\s*:\\s*)([\\d.]+)\\s*\\*\\s*units\\.(inch|mm|cm)`, "i").exec(script)
  if (!match) return undefined
  const value = Number(match[1])
  if (!Number.isFinite(value)) return undefined
  if (match[2].toLowerCase() === "mm") return value / 25.4
  if (match[2].toLowerCase() === "cm") return value / 2.54
  return value
}

export function catalogPartId(url: string) {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error("Enter a full catalog.engine-sim.parts part URL")
  }
  if (parsed.hostname !== "catalog.engine-sim.parts") throw new Error("The engine URL must come from catalog.engine-sim.parts")
  const match = /^\/parts\/(\d+)\/?$/.exec(parsed.pathname)
  if (!match) throw new Error("The catalog URL must look like https://catalog.engine-sim.parts/parts/2953")
  return Number(match[1])
}

export function profileFromCatalogPart(part: CatalogPart, sourceUrl: string): CommunityEngineProfile {
  const script = part.script
  const cylinders = Math.max(1, (script.match(/\.add_cylinder\s*\(/g) ?? []).length)
  const boreIn = dimensionInches(script, "bore")
  const strokeIn = dimensionInches(script, "stroke")
  const displacementCuIn = boreIn && strokeIn
    ? Math.PI * boreIn * boreIn * strokeIn * cylinders / 4
    : undefined
  const chamberCc = firstNumber(script, /(?:input\s+)?chamber_volume\s*:\s*([\d.]+)\s*\*\s*units\.cc/i)
  const displacementPerCylinderCc = displacementCuIn ? displacementCuIn * 16.387064 / cylinders : undefined
  const explicitCompressionRatio = firstNumber(script, /\bcompression_ratio\s*:\s*([\d.]+)/i)
  const compressionRatio = explicitCompressionRatio ?? (chamberCc && displacementPerCylinderCc
    ? (displacementPerCylinderCc + chamberCc) / chamberCc
    : undefined)
  const exhaustLengths = Array.from(script.matchAll(/exhaust_system\s+\w+\s*\([\s\S]{0,500}?\blength\s*:\s*([\d.]+)\s*\*\s*units\.inch/gi), (match) => Number(match[1]))
    .filter(Number.isFinite)
  const exhaustLengthIn = exhaustLengths.length
    ? exhaustLengths.reduce((sum, value) => sum + value, 0) / exhaustLengths.length
    : undefined

  return {
    name: part.name,
    creator: part.short_user?.name ?? "Unknown catalog creator",
    sourceUrl,
    cylinders: clamp(cylinders, 1, 24),
    displacementCuIn: displacementCuIn ? clamp(displacementCuIn, 30, 3000) : undefined,
    compressionRatio: compressionRatio ? clamp(compressionRatio, 6, 30) : undefined,
    exhaustLengthIn: exhaustLengthIn ? clamp(exhaustLengthIn, 8, 120) : undefined,
    mechanicalNoise: firstNumber(script, /\bnoise\s*:\s*([\d.]+)/i),
    redlineRpm: firstNumber(script, /\bredline\s*:\s*([\d.]+)\s*\*\s*units\.rpm/i),
    simulationFrequency: firstNumber(script, /\bsimulation_frequency\s*:\s*([\d.]+)/i),
  }
}

export async function fetchCommunityEngine(url: string) {
  const id = catalogPartId(url)
  const response = await fetch(`https://catalog.engine-sim.parts/api/parts/${id}`)
  if (!response.ok) throw new Error(`The Parts Catalog returned ${response.status}`)
  const part = await response.json() as CatalogPart
  if (!part.script) throw new Error("That catalog part does not contain an engine script")
  return profileFromCatalogPart(part, `https://catalog.engine-sim.parts/parts/${id}`)
}
