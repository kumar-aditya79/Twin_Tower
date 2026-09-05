import { useMemo, useRef, type MutableRefObject } from "react"
import { useFrame } from "@react-three/fiber"
import { Effect } from "postprocessing"
import { MathUtils, Uniform, Vector2 } from "three"
import type { Telemetry } from "@/game/physics"
import type { BodyMotionTuning } from "@/game/useCarTuning"

const fragmentShader = /* glsl */ `
  uniform float strength;
  uniform vec2 center;

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec2 fromCenter = uv - center;
    float radialDistance = length(fromCenter);

    float peripheralGain = mix(0.45, 1.0, smoothstep(0.05, 0.7, radialDistance));
    float localStrength = strength * peripheralGain;

    vec4 accumulated = inputColor * 0.24;
    float totalWeight = 0.24;

    for (int i = 1; i <= 4; i++) {
      float progress = float(i) / 4.0;
      float weight = 1.0 - progress * 0.62;
      vec2 sampleUv = clamp(uv - fromCenter * localStrength * progress, vec2(0.001), vec2(0.999));
      accumulated += texture2D(inputBuffer, sampleUv) * weight;
      totalWeight += weight;
    }

    outputColor = accumulated / totalWeight;
    outputColor.a = inputColor.a;
  }
`

class SpeedMotionBlurEffect extends Effect {
  constructor() {
    super("SpeedMotionBlur", fragmentShader, {
      uniforms: new Map<string, Uniform>([
        ["strength", new Uniform(0)],
        ["center", new Uniform(new Vector2(0.5, 0.67))],
      ]),
    })
  }

  setStrength(value: number) {
    this.uniforms.get("strength")!.value = value
  }
}

type SpeedMotionBlurProps = {
  telemetryRef: MutableRefObject<Telemetry>
  tuningRef: MutableRefObject<BodyMotionTuning>
}

export function SpeedMotionBlur({ telemetryRef, tuningRef }: SpeedMotionBlurProps) {
  const effect = useMemo(() => new SpeedMotionBlurEffect(), [])
  const reducedMotion = useMemo(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches, [])
  const currentStrength = useRef(0)

  useFrame((_, delta) => {
    const speedMph = telemetryRef.current.speedMps * 2.2369362921
    const { motionBlurStrength: maxStrength, motionBlurStartMph: startMph, motionBlurFullMph: fullMph } = tuningRef.current
    const safeStartMph = Number.isFinite(startMph) ? startMph : 35
    const safeFullMph = Number.isFinite(fullMph) ? fullMph : 160
    const safeMaxStrength = Number.isFinite(maxStrength) ? maxStrength : 0.06
    const speedMix = Number.isFinite(speedMph)
      ? MathUtils.clamp((speedMph - safeStartMph) / Math.max(1, safeFullMph - safeStartMph), 0, 1)
      : 0
    const targetStrength = reducedMotion ? 0 : speedMix * safeMaxStrength
    currentStrength.current = MathUtils.damp(currentStrength.current, targetStrength, 5, delta)
    effect.setStrength(currentStrength.current)
  })

  return <primitive object={effect} dispose={null} />
}
