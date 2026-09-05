#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
build_dir="${project_dir}/wasm/build-wasm-tests"

emcmake cmake \
  -S "${project_dir}/wasm" \
  -B "${build_dir}" \
  -G "Unix Makefiles" \
  -DCMAKE_BUILD_TYPE=Release \
  -DENGINE_SIM_BUILD_TESTS=ON
cmake --build "${build_dir}" --target engine_sim_tests --parallel
node "${build_dir}/engine_sim_tests.cjs" --gtest_brief=1
