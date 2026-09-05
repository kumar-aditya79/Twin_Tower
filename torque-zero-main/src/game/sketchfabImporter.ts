export type SketchfabImporterModel = {
  name?: string
  viewerUrl?: string
  user?: { displayName?: string; username?: string; profileUrl?: string }
  license?: { label?: string; fullName?: string; url?: string }
}

export type SketchfabImporterDownload = {
  gltf?: { url?: string; size?: number; expires?: number }
}

export type SketchfabImporterResult = {
  model: SketchfabImporterModel
  download: SketchfabImporterDownload
}

type SketchfabImporterInstance = {
  download: (
    uid: string,
    callback: (model: SketchfabImporterModel, download: SketchfabImporterDownload) => void,
  ) => void
}

type SketchfabImporterConstructor = new (
  element: HTMLElement,
  options?: { onModelSelected?: (result: SketchfabImporterResult) => void },
) => SketchfabImporterInstance

declare global {
  interface Window {
    SketchfabImporter?: SketchfabImporterConstructor
  }
}

const IMPORTER_SCRIPT_URL = "https://apps.sketchfab.com/web-importer/sketchfab-importer.js"
const IMPORTER_SESSION_HINT_KEY = "torque-zero:sketchfab-connected"
let importerScriptPromise: Promise<SketchfabImporterConstructor> | null = null
let importerSessionPromise: Promise<SketchfabImporterSession> | null = null

type SketchfabImporterSession = {
  request: (uid: string) => Promise<SketchfabImporterResult>
}

function loadImporterScript() {
  if (window.SketchfabImporter) return Promise.resolve(window.SketchfabImporter)
  if (importerScriptPromise) return importerScriptPromise

  importerScriptPromise = new Promise<SketchfabImporterConstructor>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${IMPORTER_SCRIPT_URL}"]`)
    const script = existing ?? document.createElement("script")
    const loaded = () => window.SketchfabImporter
      ? resolve(window.SketchfabImporter)
      : reject(new Error("Sketchfab's importer loaded without its browser API"))
    script.addEventListener("load", loaded, { once: true })
    script.addEventListener("error", () => {
      script.remove()
      reject(new Error("Could not load Sketchfab's official importer"))
    }, { once: true })
    if (!existing) {
      script.src = IMPORTER_SCRIPT_URL
      script.async = true
      document.head.appendChild(script)
    }
  }).catch((error) => {
    importerScriptPromise = null
    throw error
  })

  return importerScriptPromise
}

function makeImporterDialog() {
  const overlay = document.createElement("div")
  overlay.setAttribute("role", "dialog")
  overlay.setAttribute("aria-modal", "true")
  overlay.setAttribute("aria-label", "Sign in to Sketchfab and authorize model download")
  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    zIndex: "2147483647",
    display: "none",
    placeItems: "center",
    padding: "16px",
    background: "rgba(7, 7, 11, 0.86)",
    backdropFilter: "blur(10px)",
  })

  const panel = document.createElement("div")
  Object.assign(panel.style, {
    position: "relative",
    width: "min(900px, 100%)",
    height: "min(720px, calc(100vh - 32px))",
    overflow: "hidden",
    border: "1px solid rgba(255, 255, 255, 0.16)",
    borderRadius: "12px",
    background: "#ffffff",
    boxShadow: "0 24px 80px rgba(0, 0, 0, 0.55)",
  })

  const close = document.createElement("button")
  close.type = "button"
  close.textContent = "Close"
  close.setAttribute("aria-label", "Cancel Sketchfab import")
  Object.assign(close.style, {
    position: "absolute",
    top: "10px",
    right: "12px",
    zIndex: "2",
    padding: "7px 12px",
    border: "0",
    borderRadius: "6px",
    color: "#ffffff",
    background: "#1caad9",
    font: "600 13px system-ui, sans-serif",
    cursor: "pointer",
  })

  const host = document.createElement("div")
  Object.assign(host.style, { width: "100%", height: "100%" })
  panel.append(host, close)
  overlay.append(panel)
  document.body.append(overlay)
  return { overlay, host, close }
}

async function createImporterSession(): Promise<SketchfabImporterSession> {
  const Importer = await loadImporterScript()
  const { overlay, host, close } = makeImporterDialog()
  let sequence = 0
  let active: { id: number; resolve: (result: SketchfabImporterResult) => void; reject: (error: Error) => void } | null = null

  const hide = () => { overlay.style.display = "none" }
  const succeed = (id: number, result: SketchfabImporterResult) => {
    if (active?.id !== id) return
    const { resolve } = active
    active = null
    hide()
    try {
      localStorage.setItem(IMPORTER_SESSION_HINT_KEY, "true")
    } catch {
      // The live Sketchfab session still works when app storage is unavailable.
    }
    resolve(result)
  }
  const cancel = () => {
    if (!active) return
    const { reject } = active
    active = null
    hide()
    reject(new Error("Sketchfab import canceled"))
  }

  const importer = new Importer(host, {
    onModelSelected: (result) => {
      if (active) succeed(active.id, result)
    },
  })
  const iframe = host.querySelector("iframe")
  if (!iframe) {
    overlay.remove()
    throw new Error("Sketchfab's importer did not create its authentication frame")
  }
  iframe.title = "Sketchfab model importer"
  await new Promise<void>((resolve) => iframe.addEventListener("load", () => resolve(), { once: true }))

  close.addEventListener("click", cancel)
  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape") cancel()
  })

  return {
    request: (uid) => {
      if (active) return Promise.reject(new Error("Another Sketchfab import is already open"))
      const id = ++sequence
      overlay.style.display = "grid"
      close.focus()
      return new Promise<SketchfabImporterResult>((resolve, reject) => {
        active = { id, resolve, reject }
        importer.download(uid, (model, download) => succeed(id, { model, download }))
      })
    },
  }
}

function getImporterSession() {
  importerSessionPromise ??= createImporterSession().catch((error) => {
    importerSessionPromise = null
    throw error
  })
  return importerSessionPromise
}

export function warmSketchfabSession() {
  try {
    if (localStorage.getItem(IMPORTER_SESSION_HINT_KEY) === "true") void getImporterSession()
  } catch {
    // Storage may be disabled; initialize lazily on the next import instead.
  }
}

export async function requestSketchfabDownload(uid: string): Promise<SketchfabImporterResult> {
  const session = await getImporterSession()
  return session.request(uid)
}
