#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
build_dir="${project_dir}/wasm/build-native-tests-clang"

if command -v clang >/dev/null 2>&1 && command -v clang++ >/dev/null 2>&1; then
  c_compiler="$(command -v clang)"
  cxx_compiler="$(command -v clang++)"
elif [[ -x /home/linuxbrew/.linuxbrew/opt/llvm/bin/clang && -x /home/linuxbrew/.linuxbrew/opt/llvm/bin/clang++ ]]; then
  c_compiler=/home/linuxbrew/.linuxbrew/opt/llvm/bin/clang
  cxx_compiler=/home/linuxbrew/.linuxbrew/opt/llvm/bin/clang++
else
  echo "Clang is required to compile the upstream MSVC-oriented source." >&2
  exit 1
fi

cmake \
  -S "${project_dir}/wasm" \
  -B "${build_dir}" \
  -G "Unix Makefiles" \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_C_COMPILER="${c_compiler}" \
  -DCMAKE_CXX_COMPILER="${cxx_compiler}" \
  -DENGINE_SIM_BUILD_TESTS=ON
cmake --build "${build_dir}" --target engine_sim_tests --parallel
ctest --test-dir "${build_dir}" --output-on-failure
