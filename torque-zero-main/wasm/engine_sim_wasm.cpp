#include "gas_system.h"
#include "synthesizer.h"
#include "units.h"

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#define TZ_EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define TZ_EXPORT
#endif

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <vector>

namespace {
constexpr double tau = 6.28318530717958647692;

struct EngineSoundModel {
    explicit EngineSoundModel(int requestedSampleRate)
        : sampleRate(std::max(8000, requestedSampleRate)) {
        configure(4, 122.0, 11.0, 28.0, 26.0, 0.48, 0.08, 0.9, 18.0, 0.88);
    }

    ~EngineSoundModel() {
        if (initialized) synthesizer.destroy();
    }

    void configure(
        int requestedCylinders,
        double requestedDisplacementCubicInches,
        double requestedCompressionRatio,
        double requestedExhaustLengthInches,
        double requestedPulseWidthDegrees,
        double requestedResonance,
        double requestedMechanicalNoise,
        double requestedGain,
        double requestedIgnitionTimingDegrees,
        double requestedVolumetricEfficiency) {
        const int nextCylinders = std::clamp(requestedCylinders, 1, 24);
        if (initialized && nextCylinders != cylinders) {
            synthesizer.destroy();
            initialized = false;
        }

        cylinders = nextCylinders;
        displacementCubicInches = std::clamp(requestedDisplacementCubicInches, 30.0, 3000.0);
        compressionRatio = std::clamp(requestedCompressionRatio, 6.0, 30.0);
        exhaustLengthInches = std::clamp(requestedExhaustLengthInches, 8.0, 120.0);
        pulseWidthDegrees = std::clamp(requestedPulseWidthDegrees, 8.0, 90.0);
        resonance = std::clamp(requestedResonance, 0.0, 0.98);
        mechanicalNoise = std::clamp(requestedMechanicalNoise, 0.0, 0.5);
        gain = std::clamp(requestedGain, 0.05, 2.0);
        ignitionTimingDegrees = std::clamp(requestedIgnitionTimingDegrees, 0.0, 45.0);
        volumetricEfficiency = std::clamp(requestedVolumetricEfficiency, 0.45, 1.35);

        if (!initialized) {
            Synthesizer::Parameters parameters;
            parameters.inputChannelCount = cylinders;
            parameters.inputBufferSize = 8192;
            parameters.audioBufferSize = 8192;
            // The synthesizer may be rebuilt when a new engine changes the
            // cylinder count. Preserve the independently selected simulation
            // rate instead of silently reverting its input to the audio rate.
            parameters.inputSampleRate = static_cast<float>(simulationFrequency);
            parameters.audioSampleRate = static_cast<float>(sampleRate);
            parameters.initialAudioParameters.volume = static_cast<float>(gain);
            parameters.initialAudioParameters.convolution = 0.0f;
            parameters.initialAudioParameters.dF_F_mix = 0.002f;
            parameters.initialAudioParameters.inputSampleNoise = 0.0f;
            parameters.initialAudioParameters.airNoise = static_cast<float>(mechanicalNoise);
            parameters.initialAudioParameters.airNoiseFrequencyCutoff = 6500.0f;
            parameters.initialAudioParameters.levelerTarget = 6500.0f;
            parameters.initialAudioParameters.levelerMinGain = 0.02f;
            parameters.initialAudioParameters.levelerMaxGain = 1.0f;
            synthesizer.initialize(parameters);
            channelInput.assign(cylinders, 0.0);
            cylinderPressure.assign(cylinders, 0.0);
            initialized = true;
        }

        auto audio = synthesizer.getAudioParameters();
        audio.volume = static_cast<float>(gain);
        audio.airNoise = static_cast<float>(mechanicalNoise);
        synthesizer.setAudioParameters(audio);

        const double volumeM3 = units::volume(displacementCubicInches, units::cubic_inches) / cylinders;
        chamber.initialize(
            units::pressure(1.0, units::atm),
            volumeM3,
            units::celcius(25.0));
    }

    void setState(double nextRpm, double nextRedline, double nextThrottle) {
        rpm = std::clamp(nextRpm, 0.0, 20000.0);
        redline = std::clamp(nextRedline, 1000.0, 20000.0);
        throttle = std::clamp(nextThrottle, 0.0, 1.0);
    }

    void setSimulationFrequency(double frequency) {
        simulationFrequency = std::clamp(frequency, 400.0, 400000.0);
        synthesizer.setInputSampleRate(simulationFrequency);
    }

    int render(int frames) {
        frames = std::clamp(frames, 1, 4096);
        output.resize(frames);

        inputFrameAccumulator += frames * simulationFrequency / sampleRate;
        const int simulationFrames = static_cast<int>(inputFrameAccumulator);
        inputFrameAccumulator -= simulationFrames;
        const double revolutionsPerSample = (rpm / 60.0) / simulationFrequency;
        const double cycleAdvance = revolutionsPerSample * 0.5;
        const double pulseSigma = std::max(0.004, pulseWidthDegrees / 720.0 / 2.355);
        const double displacementScale = std::sqrt(displacementCubicInches / 122.0);
        const double compressionScale = std::pow(compressionRatio / 10.0, 1.35);
        const double limiter = rpm >= redline ? 0.18 : 1.0;
        const double combustion = (0.15 + 0.85 * throttle) * limiter * std::sqrt(volumetricEfficiency);
        const double exhaustDelay = exhaustLengthInches / 13500.0 * simulationFrequency;
        const double decay = std::pow(resonance, 1.0 / std::max(1.0, exhaustDelay));

        for (int frame = 0; frame < simulationFrames; ++frame) {
            cyclePhase += cycleAdvance;
            cyclePhase -= std::floor(cyclePhase);

            double aggregateFlow = 0.0;
            for (int cylinder = 0; cylinder < cylinders; ++cylinder) {
                double firingPhase = static_cast<double>(cylinder) / cylinders - ignitionTimingDegrees / 720.0;
                firingPhase -= std::floor(firingPhase);
                double distance = std::abs(cyclePhase - firingPhase);
                distance = std::min(distance, 1.0 - distance);
                const double pulse = std::exp(-0.5 * (distance / pulseSigma) * (distance / pulseSigma));

                cylinderPressure[cylinder] =
                    cylinderPressure[cylinder] * decay
                    + pulse * combustion * displacementScale * compressionScale;

                const double pressure = units::pressure(1.0, units::atm)
                    * (1.0 + 0.065 * cylinderPressure[cylinder]);
                const double flow = GasSystem::flowRate(
                    1.0e-7,
                    pressure,
                    units::pressure(1.0, units::atm),
                    units::celcius(650.0),
                    units::celcius(25.0),
                    GasSystem::heatCapacityRatio(chamber.degreesOfFreedom()),
                    GasSystem::chokedFlowLimit(chamber.degreesOfFreedom()),
                    GasSystem::chokedFlowRate(chamber.degreesOfFreedom()));

                aggregateFlow += flow;
                channelInput[cylinder] = cylinderPressure[cylinder] * 8500.0 + flow * 2.0e7;
            }
            lastExhaustFlow = aggregateFlow;
            synthesizer.writeInput(channelInput.data());
        }

        if (simulationFrames > 0) {
            synthesizer.endInputBlock();
            synthesizer.renderAudio();
        }
        return synthesizer.readAudioOutput(frames, output.data());
    }

    double firingFrequency() const { return rpm * cylinders / 120.0; }
    double crankAngleDegrees() const { return cyclePhase * 720.0; }
    double cylinderPhase(int cylinder) const {
        if (cylinder < 0 || cylinder >= cylinders) return 0.0;
        double phase = cyclePhase - static_cast<double>(cylinder) / cylinders;
        phase -= std::floor(phase);
        return phase;
    }
    double cylinderCombustion(int cylinder) const {
        const double phase = cylinderPhase(cylinder);
        const double firingPhase = 1.0 - ignitionTimingDegrees / 720.0;
        double shifted = std::abs(phase - firingPhase);
        shifted = std::min(shifted, 1.0 - shifted);
        const double sigma = std::max(0.004, pulseWidthDegrees / 720.0 / 2.355);
        const double limiter = rpm >= redline ? 0.18 : 1.0;
        return std::clamp(std::exp(-0.5 * (shifted / sigma) * (shifted / sigma))
            * (0.15 + 0.85 * throttle) * limiter * std::sqrt(volumetricEfficiency), 0.0, 1.0);
    }
    double cylinderPressurePsi(int cylinder) const {
        if (cylinder < 0 || cylinder >= cylinders) return 14.7;
        const double phase = cylinderPhase(cylinder);
        const double pistonCompression = std::pow(std::max(0.0, std::cos(phase * tau)), 6.0);
        const double compressionPressure = pistonCompression * compressionRatio * 9.5;
        const double combustionPressure = cylinderCombustion(cylinder)
            * (340.0 + 28.0 * compressionRatio) * std::sqrt(displacementCubicInches / cylinders / 30.5);
        return 14.7 + compressionPressure + combustionPressure + cylinderPressure[cylinder] * 18.0;
    }
    double cylinderTemperatureF(int cylinder) const {
        const double pressureRise = std::max(0.0, cylinderPressurePsi(cylinder) - 14.7);
        return 190.0 + pressureRise * 1.35 + cylinderCombustion(cylinder) * 1050.0;
    }
    double intakeValveLift(int cylinder) const {
        const double phase = cylinderPhase(cylinder);
        return (phase >= 0.50 && phase <= 0.75)
            ? std::pow(std::sin((phase - 0.50) / 0.25 * 3.14159265358979323846), 2.0)
            : 0.0;
    }
    double exhaustValveLift(int cylinder) const {
        const double phase = cylinderPhase(cylinder);
        return (phase >= 0.25 && phase <= 0.50)
            ? std::pow(std::sin((phase - 0.25) / 0.25 * 3.14159265358979323846), 2.0)
            : 0.0;
    }
    double airFlowCfm() const {
        return displacementCubicInches * rpm * 0.5 / 1728.0
            * volumetricEfficiency * (0.12 + throttle * 0.88);
    }
    double airFuelRatio() const {
        return 14.7 - std::pow(throttle, 1.7) * 2.25;
    }
    double intakePressurePsi() const {
        return 14.7 * (0.28 + 0.72 * throttle);
    }
    double exhaustTemperatureF() const {
        return 420.0 + throttle * 880.0 + std::min(240.0, rpm / redline * 240.0);
    }
    double torqueRipple() const {
        return (1.0 / std::sqrt(static_cast<double>(cylinders)))
            * (0.25 + 0.75 * throttle) * (compressionRatio / 10.0);
    }

    int sampleRate;
    double simulationFrequency = 10000.0;
    double inputFrameAccumulator = 0.0;
    int cylinders = 4;
    double displacementCubicInches = 122.0;
    double compressionRatio = 11.0;
    double exhaustLengthInches = 28.0;
    double pulseWidthDegrees = 26.0;
    double resonance = 0.48;
    double mechanicalNoise = 0.08;
    double gain = 0.9;
    double ignitionTimingDegrees = 18.0;
    double volumetricEfficiency = 0.88;
    double rpm = 900.0;
    double redline = 8000.0;
    double throttle = 0.0;
    double cyclePhase = 0.0;
    double lastExhaustFlow = 0.0;
    bool initialized = false;
    GasSystem chamber;
    Synthesizer synthesizer;
    std::vector<double> channelInput;
    std::vector<double> cylinderPressure;
    std::vector<int16_t> output;
};
}

extern "C" {
TZ_EXPORT EngineSoundModel *tz_engine_create(int sampleRate) {
    return new EngineSoundModel(sampleRate);
}

TZ_EXPORT void tz_engine_destroy(EngineSoundModel *engine) { delete engine; }

TZ_EXPORT void tz_engine_configure(
    EngineSoundModel *engine,
    int cylinders,
    double displacementCubicInches,
    double compressionRatio,
    double exhaustLengthInches,
    double pulseWidthDegrees,
    double resonance,
    double mechanicalNoise,
    double gain,
    double ignitionTimingDegrees,
    double volumetricEfficiency) {
    if (engine) engine->configure(cylinders, displacementCubicInches, compressionRatio,
        exhaustLengthInches, pulseWidthDegrees, resonance, mechanicalNoise, gain,
        ignitionTimingDegrees, volumetricEfficiency);
}

TZ_EXPORT void tz_engine_set_state(EngineSoundModel *engine, double rpm, double redline, double throttle) {
    if (engine) engine->setState(rpm, redline, throttle);
}

TZ_EXPORT void tz_engine_set_simulation_frequency(EngineSoundModel *engine, double frequency) {
    if (engine) engine->setSimulationFrequency(frequency);
}

TZ_EXPORT int tz_engine_render(EngineSoundModel *engine, int frames) {
    return engine ? engine->render(frames) : 0;
}

TZ_EXPORT const int16_t *tz_engine_output(EngineSoundModel *engine) {
    return engine && !engine->output.empty() ? engine->output.data() : nullptr;
}

TZ_EXPORT double tz_engine_firing_frequency(EngineSoundModel *engine) {
    return engine ? engine->firingFrequency() : 0.0;
}

TZ_EXPORT double tz_engine_exhaust_flow(EngineSoundModel *engine) {
    return engine ? engine->lastExhaustFlow : 0.0;
}

TZ_EXPORT double tz_engine_torque_ripple(EngineSoundModel *engine) {
    return engine ? engine->torqueRipple() : 0.0;
}

TZ_EXPORT int tz_engine_cylinder_count(EngineSoundModel *engine) {
    return engine ? engine->cylinders : 0;
}

TZ_EXPORT double tz_engine_crank_angle(EngineSoundModel *engine) {
    return engine ? engine->crankAngleDegrees() : 0.0;
}

TZ_EXPORT double tz_engine_cylinder_phase(EngineSoundModel *engine, int cylinder) {
    return engine ? engine->cylinderPhase(cylinder) : 0.0;
}

TZ_EXPORT double tz_engine_cylinder_pressure_psi(EngineSoundModel *engine, int cylinder) {
    return engine ? engine->cylinderPressurePsi(cylinder) : 0.0;
}

TZ_EXPORT double tz_engine_cylinder_temperature_f(EngineSoundModel *engine, int cylinder) {
    return engine ? engine->cylinderTemperatureF(cylinder) : 0.0;
}

TZ_EXPORT double tz_engine_cylinder_combustion(EngineSoundModel *engine, int cylinder) {
    return engine ? engine->cylinderCombustion(cylinder) : 0.0;
}

TZ_EXPORT double tz_engine_intake_valve_lift(EngineSoundModel *engine, int cylinder) {
    return engine ? engine->intakeValveLift(cylinder) : 0.0;
}

TZ_EXPORT double tz_engine_exhaust_valve_lift(EngineSoundModel *engine, int cylinder) {
    return engine ? engine->exhaustValveLift(cylinder) : 0.0;
}

TZ_EXPORT double tz_engine_air_flow_cfm(EngineSoundModel *engine) {
    return engine ? engine->airFlowCfm() : 0.0;
}

TZ_EXPORT double tz_engine_air_fuel_ratio(EngineSoundModel *engine) {
    return engine ? engine->airFuelRatio() : 0.0;
}

TZ_EXPORT double tz_engine_intake_pressure_psi(EngineSoundModel *engine) {
    return engine ? engine->intakePressurePsi() : 0.0;
}

TZ_EXPORT double tz_engine_exhaust_temperature_f(EngineSoundModel *engine) {
    return engine ? engine->exhaustTemperatureF() : 0.0;
}
}
