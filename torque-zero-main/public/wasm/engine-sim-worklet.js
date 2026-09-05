import createEngineSimModule from "./engine-sim.js"

class EngineSimProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super()
    this.engineSim = null
    this.engine = 0
    this.enabled = false
    this.monitor = false
    this.frame = { rpm: 900, redline: 7600, throttle: 0 }
    this.qualityCountdown = 0
    this.tuning = null
    this.simulationFrequency = 10000
    createEngineSimModule({
      instantiateWasm: (imports, receiveInstance) => {
        const instance = new WebAssembly.Instance(options.processorOptions.wasmModule, imports)
        receiveInstance(instance)
        return instance.exports
      },
    }).then((module) => {
      this.engineSim = module
      this.engine = module._tz_engine_create(sampleRate)
      module._tz_engine_set_simulation_frequency(this.engine, this.simulationFrequency)
      if (this.tuning) this.configure(this.tuning)
      this.port.postMessage({ type: "ready" })
    }).catch((error) => {
      this.port.postMessage({ type: "error", message: String(error?.stack || error) })
    })
    this.port.onmessage = ({ data }) => {
      if (data.type === "state") this.frame = data.frame
      if (data.type === "enabled") this.enabled = data.enabled
      if (data.type === "monitor") this.monitor = data.enabled
      if (data.type === "configure") {
        this.tuning = data.tuning
        if (this.engine) this.configure(this.tuning)
      }
      if (data.type === "simulation-frequency") {
        this.simulationFrequency = Math.max(400, Math.min(400000, Math.round(data.frequency)))
        if (this.engine) this.engineSim._tz_engine_set_simulation_frequency(this.engine, this.simulationFrequency)
      }
      if (data.type === "destroy") {
        this.engineSim?._tz_engine_destroy(this.engine)
        this.engine = 0
      }
    }
  }

  configure(tuning) {
    this.engineSim._tz_engine_configure(
      this.engine,
      tuning.cylinders,
      tuning.displacementCuIn,
      tuning.compressionRatio,
      tuning.exhaustLengthIn,
      tuning.pulseWidthDegrees,
      tuning.exhaustResonance,
      tuning.mechanicalNoise,
      tuning.masterGain,
      tuning.ignitionTimingDegrees,
      tuning.volumetricEfficiency,
    )
    // A cylinder-count change rebuilds the upstream synthesizer. Reapply the
    // input rate so initial configuration and later DialKit changes are
    // identical, even when configuration messages arrive in either order.
    this.engineSim._tz_engine_set_simulation_frequency(this.engine, this.simulationFrequency)
  }

  process(_inputs, outputs) {
    const target = outputs[0][0]
    if (!target) return true
    if ((!this.enabled && !this.monitor) || !this.engine) {
      target.fill(0)
      return true
    }

    this.engineSim._tz_engine_set_state(
      this.engine,
      this.frame.rpm,
      this.frame.redline,
      this.frame.throttle,
    )
    const rendered = this.engineSim._tz_engine_render(this.engine, target.length)
    const outputPointer = this.engineSim._tz_engine_output(this.engine) >> 1
    if (this.enabled) {
      for (let index = 0; index < rendered; index += 1) {
        target[index] = this.engineSim.HEAP16[outputPointer + index] / 32768
      }
      if (rendered < target.length) target.fill(0, rendered)
    } else {
      target.fill(0)
    }

    this.qualityCountdown -= 1
    if (this.qualityCountdown <= 0) {
      this.qualityCountdown = 15
      const cylinderCount = this.engineSim._tz_engine_cylinder_count(this.engine)
      const cylinders = Array.from({ length: cylinderCount }, (_, cylinder) => ({
        phase: this.engineSim._tz_engine_cylinder_phase(this.engine, cylinder),
        pressurePsi: this.engineSim._tz_engine_cylinder_pressure_psi(this.engine, cylinder),
        temperatureF: this.engineSim._tz_engine_cylinder_temperature_f(this.engine, cylinder),
        combustion: this.engineSim._tz_engine_cylinder_combustion(this.engine, cylinder),
        intakeValveLift: this.engineSim._tz_engine_intake_valve_lift(this.engine, cylinder),
        exhaustValveLift: this.engineSim._tz_engine_exhaust_valve_lift(this.engine, cylinder),
      }))
      this.port.postMessage({
        type: "qualities",
        qualities: {
          firingFrequencyHz: this.engineSim._tz_engine_firing_frequency(this.engine),
          exhaustFlow: this.engineSim._tz_engine_exhaust_flow(this.engine),
          torqueRipple: this.engineSim._tz_engine_torque_ripple(this.engine),
          crankAngleDegrees: this.engineSim._tz_engine_crank_angle(this.engine),
          airFlowCfm: this.engineSim._tz_engine_air_flow_cfm(this.engine),
          airFuelRatio: this.engineSim._tz_engine_air_fuel_ratio(this.engine),
          intakePressurePsi: this.engineSim._tz_engine_intake_pressure_psi(this.engine),
          exhaustTemperatureF: this.engineSim._tz_engine_exhaust_temperature_f(this.engine),
          cylinders,
        },
      })
    }
    return true
  }
}

registerProcessor("engine-sim-processor", EngineSimProcessor)
