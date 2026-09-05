import assert from "node:assert/strict"
import fs from "node:fs"
import createEngineSimModule from "../public/wasm/engine-sim.js"

const wasmBinary = fs.readFileSync(new URL("../public/wasm/engine-sim.wasm", import.meta.url))
const wasmModule = await WebAssembly.compile(wasmBinary)
const engineSim = await createEngineSimModule({
  instantiateWasm: (imports, receiveInstance) => {
    const instance = new WebAssembly.Instance(wasmModule, imports)
    receiveInstance(instance)
    return instance.exports
  },
})
const engine = engineSim._tz_engine_create(48_000)

const configure = (cylinders) => {
  engineSim._tz_engine_configure(
    engine,
    cylinders,
    cylinders === 6 ? 183 : 376,
    10.8,
    34,
    26,
    0.48,
    0.08,
    0.9,
    18,
    0.88,
  )
  engineSim._tz_engine_set_state(engine, 2_400, 7_600, 0.4)
}

const renderedRatio = () => {
  const blockSize = 128
  const blockCount = 50
  let renderedFrames = 0
  for (let block = 0; block < blockCount; block += 1) {
    renderedFrames += engineSim._tz_engine_render(engine, blockSize)
  }
  return renderedFrames / (blockSize * blockCount)
}

try {
  // Match startup ordering: the chosen rate arrives before the car's engine
  // configuration. A cylinder-count change must not erase that rate.
  engineSim._tz_engine_set_simulation_frequency(engine, 10_000)

  configure(6)
  assert.ok(renderedRatio() >= 0.99, "six-cylinder startup audio contains underrun gaps")

  // Switching to another cylinder count rebuilds the upstream synthesizer too.
  // Do not touch the rate between configurations: persistence is the invariant.
  configure(8)
  assert.ok(renderedRatio() >= 0.99, "eight-cylinder reconfiguration contains underrun gaps")
} finally {
  engineSim._tz_engine_destroy(engine)
}

console.log("Engine audio initialization keeps the selected simulation rate across synthesizer rebuilds.")
