import type { EngineSoundTuning } from "../game/useCarTuning"

export type EngineAudioFrame = {
  rpm: number
  redline: number
  throttle: number
}

export type EngineQualities = {
  firingFrequencyHz: number
  exhaustFlow: number
  torqueRipple: number
  crankAngleDegrees: number
  airFlowCfm: number
  airFuelRatio: number
  intakePressurePsi: number
  exhaustTemperatureF: number
  cylinders: CylinderTelemetry[]
}

export type CylinderTelemetry = {
  phase: number
  pressurePsi: number
  temperatureF: number
  combustion: number
  intakeValveLift: number
  exhaustValveLift: number
}

const DEFAULT_TUNING: EngineSoundTuning = {
  cylinders: 4,
  displacementCuIn: 122,
  compressionRatio: 11,
  exhaustLengthIn: 28,
  pulseWidthDegrees: 26,
  exhaustResonance: 0.48,
  mechanicalNoise: 0.08,
  masterGain: 0.9,
  ignitionTimingDegrees: 18,
  volumetricEfficiency: 0.88,
  bankAngleDegrees: 0,
}

const EMPTY_QUALITIES: EngineQualities = {
  firingFrequencyHz: 0,
  exhaustFlow: 0,
  torqueRipple: 0,
  crankAngleDegrees: 0,
  airFlowCfm: 0,
  airFuelRatio: 14.7,
  intakePressurePsi: 4.2,
  exhaustTemperatureF: 420,
  cylinders: [],
}

export class EngineAudioController {
  private context?: AudioContext
  private output?: GainNode
  private compressor?: DynamicsCompressorNode
  private worklet?: AudioWorkletNode
  private enabled = false
  private pageActive = true
  private monitor = false
  private loading?: Promise<void>
  private tuning = DEFAULT_TUNING
  private simulationFrequency = 10000
  private latestFrame: EngineAudioFrame = { rpm: 900, redline: 7600, throttle: 0 }
  private qualities: EngineQualities = EMPTY_QUALITIES

  async enable(_carId: string, tuning: EngineSoundTuning = this.tuning) {
    this.enabled = true
    this.tuning = tuning
    await this.ensureContext()
    this.configure(tuning)
    this.worklet?.port.postMessage({ type: "enabled", enabled: true })
    this.worklet?.port.postMessage({ type: "state", frame: this.latestFrame })
    await this.context?.resume()
    this.updateOutputGain()
  }

  disable() {
    this.enabled = false
    this.worklet?.port.postMessage({ type: "enabled", enabled: false })
    this.updateOutputGain()
  }

  setPageActive(active: boolean) {
    this.pageActive = active
    this.updateOutputGain()
  }

  async setWorkbenchActive(active: boolean) {
    this.monitor = active
    if (active) {
      await this.ensureContext()
      this.configure(this.tuning)
      this.worklet?.port.postMessage({ type: "state", frame: this.latestFrame })
      await this.context?.resume()
    }
    this.worklet?.port.postMessage({ type: "monitor", enabled: active })
  }

  async selectCar(_carId: string, tuning: EngineSoundTuning = this.tuning) {
    this.tuning = tuning
    if (!this.enabled) return
    await this.ensureContext()
    this.configure(tuning)
  }

  setTuning(tuning: EngineSoundTuning) {
    this.tuning = tuning
    this.configure(tuning)
  }

  setSimulationFrequency(frequency: number) {
    this.simulationFrequency = Math.max(400, Math.min(400000, Math.round(frequency)))
    this.worklet?.port.postMessage({ type: "simulation-frequency", frequency: this.simulationFrequency })
  }

  update(frame: EngineAudioFrame) {
    this.latestFrame = frame
    if (this.enabled || this.monitor) this.worklet?.port.postMessage({ type: "state", frame })
  }

  getEngineQualities() {
    return { ...this.qualities }
  }

  dispose() {
    this.worklet?.port.postMessage({ type: "destroy" })
    this.worklet?.disconnect()
    this.worklet = undefined
    void this.context?.close()
    this.context = undefined
  }

  private async ensureContext() {
    if (this.loading) return this.loading
    if (this.context && this.worklet) return

    if (!window.isSecureContext && !["localhost", "127.0.0.1"].includes(window.location.hostname)) {
      throw new Error("Engine audio requires a secure browser context. Open http://localhost:5173 or serve the app over HTTPS.")
    }

    this.loading = (async () => {
      this.context = new AudioContext({ latencyHint: "interactive" })
      if (!this.context.audioWorklet) {
        throw new Error("This browser does not support AudioWorklet engine audio.")
      }
      this.output = this.context.createGain()
      this.compressor = this.context.createDynamicsCompressor()
      this.output.gain.value = 0
      this.compressor.threshold.value = -10
      this.compressor.knee.value = 16
      this.compressor.ratio.value = 4
      this.compressor.attack.value = 0.002
      this.compressor.release.value = 0.12

      const workletUrl = new URL("wasm/engine-sim-worklet.js", document.baseURI).href
      const wasmUrl = new URL("wasm/engine-sim.wasm", document.baseURI).href
      const wasmResponse = await fetch(wasmUrl)
      if (!wasmResponse.ok) throw new Error(`Could not load Engine Simulator Wasm (${wasmResponse.status})`)
      const wasmModule = await WebAssembly.compileStreaming(Promise.resolve(wasmResponse))
      await this.context.audioWorklet.addModule(workletUrl)
      this.worklet = new AudioWorkletNode(this.context, "engine-sim-processor", {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        processorOptions: { wasmModule },
      })
      this.worklet.port.onmessage = ({ data }) => {
        if (data.type === "qualities") this.qualities = data.qualities as EngineQualities
        if (data.type === "error") console.error("Engine Simulator AudioWorklet failed", data.message)
      }
      this.worklet.port.postMessage({ type: "simulation-frequency", frequency: this.simulationFrequency })
      this.worklet.connect(this.compressor).connect(this.output).connect(this.context.destination)
    })().finally(() => {
      this.loading = undefined
    })

    return this.loading
  }

  private configure(tuning: EngineSoundTuning) {
    this.worklet?.port.postMessage({ type: "configure", tuning })
  }

  private updateOutputGain() {
    if (!this.output || !this.context) return
    this.output.gain.cancelScheduledValues(this.context.currentTime)
    this.output.gain.setTargetAtTime(this.enabled && this.pageActive ? 1 : 0, this.context.currentTime, 0.02)
  }
}
