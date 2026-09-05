cmake_minimum_required(VERSION 3.20)

project(torque_zero_engine_sim_wasm LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

option(ENGINE_SIM_BUILD_TESTS "Build the upstream engine-sim tests" ON)

# The upstream suite includes a real std::thread synthesis test. Every object
# in a shared-memory Wasm link (including GoogleTest) must be compiled with
# atomics/bulk-memory enabled, so apply pthread support directory-wide.
if(EMSCRIPTEN AND ENGINE_SIM_BUILD_TESTS)
  add_compile_options(-pthread)
endif()

set(ENGINE_SIM_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../vendor/engine-sim")
set(SCS_ROOT "${ENGINE_SIM_ROOT}/dependencies/submodules/simple-2d-constraint-solver")
set(CSV_ROOT "${ENGINE_SIM_ROOT}/dependencies/submodules/csv-io")

file(GLOB SCS_SOURCES CONFIGURE_DEPENDS "${SCS_ROOT}/src/*.cpp")

add_library(engine_sim_scs STATIC ${SCS_SOURCES})
target_include_directories(engine_sim_scs PUBLIC "${SCS_ROOT}/include")
target_compile_definitions(engine_sim_scs PUBLIC __forceinline=inline)

add_library(engine_sim_csv STATIC
  "${CSV_ROOT}/src/information.cpp"
  "${CSV_ROOT}/src/csv_data.cpp"
)
target_include_directories(engine_sim_csv PUBLIC "${CSV_ROOT}/include")
target_compile_definitions(engine_sim_csv PRIVATE PROJECT_NAMESPACE=atg_csv)

add_library(engine_sim_core STATIC
  "${ENGINE_SIM_ROOT}/src/audio_buffer.cpp"
  "${ENGINE_SIM_ROOT}/src/camshaft.cpp"
  "${ENGINE_SIM_ROOT}/src/crankshaft.cpp"
  "${ENGINE_SIM_ROOT}/src/combustion_chamber.cpp"
  "${ENGINE_SIM_ROOT}/src/connecting_rod.cpp"
  "${ENGINE_SIM_ROOT}/src/convolution_filter.cpp"
  "${ENGINE_SIM_ROOT}/src/cylinder_bank.cpp"
  "${ENGINE_SIM_ROOT}/src/cylinder_head.cpp"
  "${ENGINE_SIM_ROOT}/src/delay_filter.cpp"
  "${ENGINE_SIM_ROOT}/src/derivative_filter.cpp"
  "${ENGINE_SIM_ROOT}/src/direct_throttle_linkage.cpp"
  "${ENGINE_SIM_ROOT}/src/dynamometer.cpp"
  "${ENGINE_SIM_ROOT}/src/engine.cpp"
  "${ENGINE_SIM_ROOT}/src/exhaust_system.cpp"
  "${ENGINE_SIM_ROOT}/src/feedback_comb_filter.cpp"
  "${ENGINE_SIM_ROOT}/src/filter.cpp"
  "${ENGINE_SIM_ROOT}/src/fuel.cpp"
  "${ENGINE_SIM_ROOT}/src/function.cpp"
  "${ENGINE_SIM_ROOT}/src/gas_system.cpp"
  "${ENGINE_SIM_ROOT}/src/gaussian_filter.cpp"
  "${ENGINE_SIM_ROOT}/src/governor.cpp"
  "${ENGINE_SIM_ROOT}/src/ignition_module.cpp"
  "${ENGINE_SIM_ROOT}/src/impulse_response.cpp"
  "${ENGINE_SIM_ROOT}/src/intake.cpp"
  "${ENGINE_SIM_ROOT}/src/jitter_filter.cpp"
  "${ENGINE_SIM_ROOT}/src/leveling_filter.cpp"
  "${ENGINE_SIM_ROOT}/src/low_pass_filter.cpp"
  "${ENGINE_SIM_ROOT}/src/part.cpp"
  "${ENGINE_SIM_ROOT}/src/piston.cpp"
  "${ENGINE_SIM_ROOT}/src/piston_engine_simulator.cpp"
  "${ENGINE_SIM_ROOT}/src/simulator.cpp"
  "${ENGINE_SIM_ROOT}/src/standard_valvetrain.cpp"
  "${ENGINE_SIM_ROOT}/src/starter_motor.cpp"
  "${ENGINE_SIM_ROOT}/src/synthesizer.cpp"
  "${ENGINE_SIM_ROOT}/src/throttle.cpp"
  "${ENGINE_SIM_ROOT}/src/transmission.cpp"
  "${ENGINE_SIM_ROOT}/src/utilities.cpp"
  "${ENGINE_SIM_ROOT}/src/valvetrain.cpp"
  "${ENGINE_SIM_ROOT}/src/vehicle.cpp"
  "${ENGINE_SIM_ROOT}/src/vehicle_drag_constraint.cpp"
  "${ENGINE_SIM_ROOT}/src/vtec_valvetrain.cpp"
)
target_include_directories(engine_sim_core PUBLIC
  "${ENGINE_SIM_ROOT}/include"
  "${SCS_ROOT}/include"
  "${CSV_ROOT}/include"
)
target_compile_definitions(engine_sim_core PUBLIC __forceinline=inline)
target_link_libraries(engine_sim_core PUBLIC engine_sim_scs engine_sim_csv)

if(EMSCRIPTEN)
  add_executable(engine_sim_wasm "${CMAKE_CURRENT_SOURCE_DIR}/engine_sim_wasm.cpp")
  target_link_libraries(engine_sim_wasm PRIVATE engine_sim_core)
  target_link_options(engine_sim_wasm PRIVATE
    "-sMODULARIZE=1"
    "-sEXPORT_ES6=1"
    "-sEXPORT_NAME=createEngineSimModule"
    "-sENVIRONMENT=web,worker"
    "-sFILESYSTEM=0"
    "-sALLOW_MEMORY_GROWTH=1"
    "-sEXPORTED_RUNTIME_METHODS=['HEAP16']"
    "-sEXPORTED_FUNCTIONS=['_tz_engine_create','_tz_engine_destroy','_tz_engine_configure','_tz_engine_set_state','_tz_engine_set_simulation_frequency','_tz_engine_render','_tz_engine_output','_tz_engine_firing_frequency','_tz_engine_exhaust_flow','_tz_engine_torque_ripple','_tz_engine_cylinder_count','_tz_engine_crank_angle','_tz_engine_cylinder_phase','_tz_engine_cylinder_pressure_psi','_tz_engine_cylinder_temperature_f','_tz_engine_cylinder_combustion','_tz_engine_intake_valve_lift','_tz_engine_exhaust_valve_lift','_tz_engine_air_flow_cfm','_tz_engine_air_fuel_ratio','_tz_engine_intake_pressure_psi','_tz_engine_exhaust_temperature_f']"
  )
  set_target_properties(engine_sim_wasm PROPERTIES
    OUTPUT_NAME "engine-sim"
    SUFFIX ".js"
  )
endif()

if(ENGINE_SIM_BUILD_TESTS)
  include(FetchContent)
  FetchContent_Declare(
    googletest
    URL https://github.com/google/googletest/archive/refs/tags/v1.14.0.zip
    DOWNLOAD_EXTRACT_TIMESTAMP TRUE
  )
  set(INSTALL_GTEST OFF CACHE BOOL "" FORCE)
  FetchContent_MakeAvailable(googletest)

  add_executable(engine_sim_tests
    "${ENGINE_SIM_ROOT}/test/gas_system_tests.cpp"
    "${ENGINE_SIM_ROOT}/test/function_test.cpp"
    "${ENGINE_SIM_ROOT}/test/synthesizer_tests.cpp"
  )
  target_link_libraries(engine_sim_tests PRIVATE gtest_main engine_sim_core)

  if(EMSCRIPTEN)
    target_link_options(engine_sim_tests PRIVATE
      -pthread
      "-sPTHREAD_POOL_SIZE=2"
      "-sENVIRONMENT=node"
      "-sEXIT_RUNTIME=1"
      "-sALLOW_MEMORY_GROWTH=1"
    )
    # Torque Zero is an ESM package, while Emscripten's Node pthread launcher
    # uses CommonJS require()/__dirname.
    set_target_properties(engine_sim_tests PROPERTIES SUFFIX ".cjs")
  else()
    include(GoogleTest)
    enable_testing()
    gtest_discover_tests(engine_sim_tests)
  endif()
endif()
