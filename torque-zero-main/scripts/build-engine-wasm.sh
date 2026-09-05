#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
build_dir="${project_dir}/wasm/build-wasm"

emcmake cmake \
  -S "${project_dir}/wasm" \
  -B "${build_dir}" \
  -G "Unix Makefiles" \
  -DCMAKE_BUILD_TYPE=Release \
  -DENGINE_SIM_BUILD_TESTS=OFF
cmake --build "${build_dir}" --target engine_sim_wasm --parallel
mkdir -p "${project_dir}/public/wasm"
cp "${build_dir}/engine-sim.js" "${project_dir}/public/wasm/engine-sim.js"
cp "${build_dir}/engine-sim.wasm" "${project_dir}/public/wasm/engine-sim.wasm"
