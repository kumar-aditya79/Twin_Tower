import { strFromU8, unzip } from "fflate"
import type { SketchfabImporterResult } from "./sketchfabImporter"

export type ModelAttribution = {
  modelName: string
  creatorName: string
  creatorUrl?: string
  licenseLabel: string
  sourceUrl?: string
}

export type ImportedModelAsset = {
  url: string
  attribution: ModelAttribution
  revoke: () => void
}

export type ModelImportProgress = {
  phase: "reading" | "downloading" | "unpacking" | "preparing"
  loadedBytes?: number
  totalBytes?: number
}

export type ModelImportProgressHandler = (progress: ModelImportProgress) => void

type SketchfabModelMetadata = {
  name?: string
  isDownloadable?: boolean
  viewerUrl?: string
  user?: { displayName?: string; username?: string; profileUrl?: string }
  license?: { label?: string; fullName?: string; url?: string }
}

const normalizePath = (path: string) => {
  const parts: string[] = []
  for (const part of path.replaceAll("\\", "/").split("/")) {
    if (!part || part === ".") continue
    if (part === "..") parts.pop()
    else parts.push(part)
  }
  return parts.join("/")
}

const resolvePath = (base: string, relative: string) => normalizePath(`${base}/${decodeURIComponent(relative)}`)

const mimeFor = (path: string) => {
  const extension = path.split(".").pop()?.toLowerCase()
  return ({
    bin: "application/octet-stream",
    glb: "model/gltf-binary",
    gltf: "model/gltf+json",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    ktx2: "image/ktx2",
  } as Record<string, string>)[extension ?? ""] ?? "application/octet-stream"
}

const unzipArchive = (bytes: Uint8Array) => new Promise<Record<string, Uint8Array>>((resolve, reject) => {
  unzip(bytes, (error, files) => error ? reject(error) : resolve(files))
})

async function assetFromArchive(bytes: Uint8Array, attribution: ModelAttribution, onProgress?: ModelImportProgressHandler): Promise<ImportedModelAsset> {
  onProgress?.({ phase: "unpacking", loadedBytes: bytes.byteLength, totalBytes: bytes.byteLength })
  const unpacked = await unzipArchive(bytes)
  onProgress?.({ phase: "preparing" })
  const files = new Map(Object.entries(unpacked).map(([path, data]) => [normalizePath(path), data]))
  const paths = [...files.keys()].filter((path) => !path.startsWith("__MACOSX/"))
  const entry = paths.find((path) => /(^|\/)scene\.glb$/i.test(path))
    ?? paths.find((path) => path.toLowerCase().endsWith(".glb"))
    ?? paths.find((path) => /(^|\/)scene\.gltf$/i.test(path))
    ?? paths.find((path) => path.toLowerCase().endsWith(".gltf"))
  if (!entry) throw new Error("The archive does not contain a GLB or glTF scene")

  const objectUrls: string[] = []
  const makeUrl = (path: string) => {
    const data = files.get(path)
    if (!data) throw new Error(`The model archive is missing ${path}`)
    const url = URL.createObjectURL(new Blob([Uint8Array.from(data)], { type: mimeFor(path) }))
    objectUrls.push(url)
    return url
  }

  let url: string
  if (entry.toLowerCase().endsWith(".glb")) {
    url = makeUrl(entry)
  } else {
    const json = JSON.parse(strFromU8(files.get(entry)!)) as {
      buffers?: Array<{ uri?: string }>
      images?: Array<{ uri?: string }>
    }
    const base = entry.includes("/") ? entry.slice(0, entry.lastIndexOf("/")) : ""
    for (const resource of [...(json.buffers ?? []), ...(json.images ?? [])]) {
      if (!resource.uri || /^(data:|blob:|https?:)/i.test(resource.uri)) continue
      resource.uri = makeUrl(resolvePath(base, resource.uri))
    }
    url = URL.createObjectURL(new Blob([JSON.stringify(json)], { type: "model/gltf+json" }))
    objectUrls.push(url)
  }

  return {
    url,
    attribution,
    revoke: () => objectUrls.forEach((objectUrl) => URL.revokeObjectURL(objectUrl)),
  }
}

export async function modelAssetFromFile(file: File, onProgress?: ModelImportProgressHandler): Promise<ImportedModelAsset> {
  const attribution = { modelName: file.name, creatorName: "Local file", licenseLabel: "User supplied" }
  onProgress?.({ phase: "reading", loadedBytes: 0, totalBytes: file.size })
  if (/\.zip$/i.test(file.name)) {
    const bytes = new Uint8Array(await file.arrayBuffer())
    onProgress?.({ phase: "reading", loadedBytes: bytes.byteLength, totalBytes: file.size })
    return assetFromArchive(bytes, attribution, onProgress)
  }
  if (/\.gltf$/i.test(file.name)) {
    const json = JSON.parse(await file.text()) as { buffers?: Array<{ uri?: string }>; images?: Array<{ uri?: string }> }
    const externalResource = [...(json.buffers ?? []), ...(json.images ?? [])]
      .find((resource) => resource.uri && !/^(data:|blob:|https?:)/i.test(resource.uri))
    if (externalResource) throw new Error("This glTF references other files; upload a ZIP containing the glTF, BIN, and textures")
  }
  if (!/\.(glb|gltf)$/i.test(file.name)) throw new Error("Choose a .glb, .gltf, or .zip model")
  const url = URL.createObjectURL(file)
  onProgress?.({ phase: "preparing", loadedBytes: file.size, totalBytes: file.size })
  return { url, attribution, revoke: () => URL.revokeObjectURL(url) }
}

export function sketchfabUid(url: string) {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error("Enter a full Sketchfab model URL")
  }
  if (!/(^|\.)sketchfab\.com$/i.test(parsed.hostname)) throw new Error("The model URL must come from sketchfab.com")
  const match = /-([a-f0-9]{32})\/?$/i.exec(parsed.pathname)
  if (!match) throw new Error("Could not find a Sketchfab model ID in that URL")
  return match[1]
}

export async function validateSketchfabDownload(url: string) {
  const uid = sketchfabUid(url)
  const response = await fetch(`https://api.sketchfab.com/v3/models/${uid}`)
  if (!response.ok) throw new Error(`Sketchfab returned ${response.status} for that model`)
  const model = await response.json() as SketchfabModelMetadata
  if (!model.isDownloadable) {
    const license = model.license?.fullName ?? model.license?.label
    const suffix = license ? ` (${license} license)` : ""
    throw new Error(`Sketchfab does not make this model downloadable through its API${suffix}. Choose a downloadable Creative Commons model or upload a licensed GLB.`)
  }
  return uid
}

async function responseBytes(response: Response, expectedSize: number | undefined, onProgress?: ModelImportProgressHandler) {
  const headerSize = Number(response.headers.get("content-length"))
  const totalBytes = Number.isFinite(headerSize) && headerSize > 0 ? headerSize : expectedSize
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer())
    onProgress?.({ phase: "downloading", loadedBytes: bytes.byteLength, totalBytes: totalBytes ?? bytes.byteLength })
    return bytes
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let loadedBytes = 0
  onProgress?.({ phase: "downloading", loadedBytes, totalBytes })
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loadedBytes += value.byteLength
    onProgress?.({ phase: "downloading", loadedBytes, totalBytes })
  }

  const bytes = new Uint8Array(loadedBytes)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

export async function modelAssetFromSketchfabDownload(url: string, result: SketchfabImporterResult, onProgress?: ModelImportProgressHandler): Promise<ImportedModelAsset> {
  const archiveUrl = result.download.gltf?.url
  if (!archiveUrl) throw new Error("Sketchfab did not provide a glTF download for this model")
  const parsedArchiveUrl = new URL(archiveUrl)
  if (parsedArchiveUrl.protocol !== "https:") throw new Error("Sketchfab returned an insecure model download URL")
  const trustedArchiveHost = parsedArchiveUrl.hostname === "sketchfab-prod-media.s3.amazonaws.com"
    || parsedArchiveUrl.hostname === "media.sketchfab.com"
    || parsedArchiveUrl.hostname.endsWith(".media.sketchfab.com")
  if (!trustedArchiveHost) throw new Error("Sketchfab returned an unexpected model download host")
  const archiveResponse = await fetch(parsedArchiveUrl)
  if (!archiveResponse.ok) throw new Error(`The temporary Sketchfab archive returned ${archiveResponse.status}`)
  const metadata = result.model
  const bytes = await responseBytes(archiveResponse, result.download.gltf?.size, onProgress)
  return assetFromArchive(bytes, {
    modelName: metadata.name ?? "Sketchfab model",
    creatorName: metadata.user?.displayName ?? metadata.user?.username ?? "Unknown Sketchfab creator",
    creatorUrl: metadata.user?.profileUrl,
    licenseLabel: metadata.license?.fullName ?? metadata.license?.label ?? "Sketchfab license",
    sourceUrl: metadata.viewerUrl ?? url,
  }, onProgress)
}
