import { Component, memo, Suspense, useCallback, useEffect, useMemo, useRef, type ErrorInfo, type MutableRefObject, type ReactNode } from "react"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { useGLTF } from "@react-three/drei"
import { CuboidCollider, Physics, RigidBody, RoundCuboidCollider, TrimeshCollider, interactionGroups, useAfterPhysicsStep, useBeforePhysicsStep, useRapier, type RapierRigidBody } from "@react-three/rapier"
import { EffectComposer } from "@react-three/postprocessing"
import * as THREE from "three"
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js"
import { SpeedMotionBlur } from "@/components/SpeedMotionBlur"
import type { CarSpec } from "@/game/cars"
import type { DriverInput, PhysicsTuning, Telemetry } from "@/game/physics"
import type { BodyMotionTuning, VehicleDynamicsTuning } from "@/game/useCarTuning"

export type CustomCarModel = { url: string; yawDegrees: number; scale: number }
type TrackSceneProps = {
  car: CarSpec
  telemetryRef: MutableRefObject<Telemetry>
  inputRef: MutableRefObject<DriverInput>
  physicsRef: MutableRefObject<PhysicsTuning>
  vehicleDynamicsRef: MutableRefObject<VehicleDynamicsTuning>
  bodyMotionRef: MutableRefObject<BodyMotionTuning>
  resetVersion: number
  customModel?: CustomCarModel
  onCustomModelReady?: () => void
  onCustomModelError?: () => void
}
type SceneProps = TrackSceneProps
type BenchmarkWindow = Window & {
  __torqueZeroBenchmark?: {
    scene: THREE.Scene
    renderer: THREE.WebGLRenderer
    camera: THREE.Camera
  }
}
type VehicleController = ReturnType<ReturnType<typeof useRapier>["world"]["createVehicleController"]>

const PHYSICS_STEP = 1 / 120
// Pole-side grid slot immediately before the start-light gantry. The oval's
// front straight runs toward +X at this point.
const START_POSITION = { x: 25, y: 1.4, z: -26 }
const START_YAW = -Math.PI / 2
const modelUrl = (file: string) => new URL(`models/${file}`, document.baseURI).href
const TRACK_URL = modelUrl("oval-track.glb")
const CAR_LAYER = 1
const WORLD_LAYER = 0
const TERRAIN_GROUP = 0
const OBSTACLE_GROUP = 1
const CATCH_GROUP = 2
const VEHICLE_GROUP = 3
const ALL_PHYSICS_GROUPS = [TERRAIN_GROUP, OBSTACLE_GROUP, CATCH_GROUP, VEHICLE_GROUP]
const TERRAIN_COLLISION_GROUPS = interactionGroups(TERRAIN_GROUP, ALL_PHYSICS_GROUPS)
const OBSTACLE_COLLISION_GROUPS = interactionGroups(OBSTACLE_GROUP, ALL_PHYSICS_GROUPS)
const CATCH_COLLISION_GROUPS = interactionGroups(CATCH_GROUP, ALL_PHYSICS_GROUPS)
const VEHICLE_COLLISION_GROUPS = interactionGroups(VEHICLE_GROUP, ALL_PHYSICS_GROUPS)
const TERRAIN_RAY_GROUPS = interactionGroups(VEHICLE_GROUP, [TERRAIN_GROUP])
const PLAYABLE_BOUNDS = { minX: -488, maxX: 382, minZ: -386, maxZ: 170 }
const SAFETY_TERRAIN_GRID_SIZE = 8
const SAFETY_TERRAIN_CLEARANCE = 0.28
const SAFETY_TERRAIN_SMOOTHING_PASSES = 12
const SAFETY_TERRAIN_RAY_HEIGHT = 80
const SAFETY_TERRAIN_RAY_DEPTH = 180
const BOUNDARY_CENTER = {
  x: (PLAYABLE_BOUNDS.minX + PLAYABLE_BOUNDS.maxX) / 2,
  z: (PLAYABLE_BOUNDS.minZ + PLAYABLE_BOUNDS.maxZ) / 2,
}
const BOUNDARY_HALF_SIZE = {
  x: (PLAYABLE_BOUNDS.maxX - PLAYABLE_BOUNDS.minX) / 2,
  z: (PLAYABLE_BOUNDS.maxZ - PLAYABLE_BOUNDS.minZ) / 2,
}
const BOUNDARY_THICKNESS = 2
const BOUNDARY_HALF_HEIGHT = 12
const RECOVERY_MARGIN = 6
const MAX_HEIGHT_ABOVE_TERRAIN = 2.5
const MAX_UPWARD_SPEED = 6
const MAX_AIRBORNE_SECONDS = 0.75
const enableCarLayer = (object: THREE.Object3D) => object.layers.set(CAR_LAYER)
const worldDepthMaterial = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true, depthTest: true })
const TERRAIN_MESH_NAMES = new Set([
  "1TARMAC_oval_road_0",
  "1GRASS_grass_1_0",
  "1GRAVEL_gravel_0",
  "0GRASS2_grass_2_0",
])
const NON_SOLID_MESH_NAMES = new Set([
  "line_seg_48_white_line_0",
  "baloon_A001_baloon_0",
])

type SafetyTerrain = {
  vertices: Float32Array
  indices: Uint32Array
}

function buildSafetyTerrain(terrainMeshes: THREE.Mesh[]): SafetyTerrain {
  const cellsX = Math.ceil((PLAYABLE_BOUNDS.maxX - PLAYABLE_BOUNDS.minX) / SAFETY_TERRAIN_GRID_SIZE)
  const cellsZ = Math.ceil((PLAYABLE_BOUNDS.maxZ - PLAYABLE_BOUNDS.minZ) / SAFETY_TERRAIN_GRID_SIZE)
  const pointsX = cellsX + 1
  const pointsZ = cellsZ + 1
  const pointCount = pointsX * pointsZ
  const heights = new Float64Array(pointCount)
  const authored = new Uint8Array(pointCount)
  const raycaster = new THREE.Raycaster(
    new THREE.Vector3(),
    new THREE.Vector3(0, -1, 0),
    0,
    SAFETY_TERRAIN_RAY_DEPTH,
  )
  const queue = new Int32Array(pointCount)
  let queueHead = 0
  let queueTail = 0

  const pointIndex = (x: number, z: number) => z * pointsX + x
  const worldX = (x: number) => PLAYABLE_BOUNDS.minX
    + (x / cellsX) * (PLAYABLE_BOUNDS.maxX - PLAYABLE_BOUNDS.minX)
  const worldZ = (z: number) => PLAYABLE_BOUNDS.minZ
    + (z / cellsZ) * (PLAYABLE_BOUNDS.maxZ - PLAYABLE_BOUNDS.minZ)

  for (let z = 0; z < pointsZ; z += 1) {
    for (let x = 0; x < pointsX; x += 1) {
      const index = pointIndex(x, z)
      raycaster.ray.origin.set(worldX(x), SAFETY_TERRAIN_RAY_HEIGHT, worldZ(z))
      const hit = raycaster.intersectObjects(terrainMeshes, false)[0]
      if (!hit) continue
      heights[index] = hit.point.y
      authored[index] = 1
      queue[queueTail] = index
      queueTail += 1
    }
  }

  if (queueTail === 0) {
    heights.fill(START_POSITION.y - 1)
  } else {
    // Flood every uncovered point from the nearest authored terrain sample.
    // The following relaxation passes turn those plateaus into smooth bridges.
    const resolved = authored.slice()
    const neighborOffsets = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const
    while (queueHead < queueTail) {
      const index = queue[queueHead]
      queueHead += 1
      const x = index % pointsX
      const z = Math.floor(index / pointsX)
      for (const [dx, dz] of neighborOffsets) {
        const nextX = x + dx
        const nextZ = z + dz
        if (nextX < 0 || nextX >= pointsX || nextZ < 0 || nextZ >= pointsZ) continue
        const nextIndex = pointIndex(nextX, nextZ)
        if (resolved[nextIndex]) continue
        heights[nextIndex] = heights[index]
        resolved[nextIndex] = 1
        queue[queueTail] = nextIndex
        queueTail += 1
      }
    }

    for (let pass = 0; pass < SAFETY_TERRAIN_SMOOTHING_PASSES; pass += 1) {
      const previous = heights.slice()
      for (let z = 0; z < pointsZ; z += 1) {
        for (let x = 0; x < pointsX; x += 1) {
          const index = pointIndex(x, z)
          if (authored[index]) continue
          let total = previous[index] * 2
          let weight = 2
          for (let dz = -1; dz <= 1; dz += 1) {
            for (let dx = -1; dx <= 1; dx += 1) {
              if (dx === 0 && dz === 0) continue
              const nextX = x + dx
              const nextZ = z + dz
              if (nextX < 0 || nextX >= pointsX || nextZ < 0 || nextZ >= pointsZ) continue
              total += previous[pointIndex(nextX, nextZ)]
              weight += 1
            }
          }
          heights[index] = total / weight
        }
      }
    }
  }

  // Lower the underlay to the minimum nearby elevation so it cannot protrude
  // through dips in the visible track between samples.
  const safetyHeights = heights.slice()
  for (let z = 0; z < pointsZ; z += 1) {
    for (let x = 0; x < pointsX; x += 1) {
      let localMinimum = Number.POSITIVE_INFINITY
      for (let dz = -1; dz <= 1; dz += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nextX = x + dx
          const nextZ = z + dz
          if (nextX < 0 || nextX >= pointsX || nextZ < 0 || nextZ >= pointsZ) continue
          localMinimum = Math.min(localMinimum, heights[pointIndex(nextX, nextZ)])
        }
      }
      safetyHeights[pointIndex(x, z)] = localMinimum - SAFETY_TERRAIN_CLEARANCE
    }
  }

  const vertices = new Float32Array(pointCount * 3)
  for (let z = 0; z < pointsZ; z += 1) {
    for (let x = 0; x < pointsX; x += 1) {
      const index = pointIndex(x, z)
      const vertexIndex = index * 3
      vertices[vertexIndex] = worldX(x)
      vertices[vertexIndex + 1] = safetyHeights[index]
      vertices[vertexIndex + 2] = worldZ(z)
    }
  }

  const indices = new Uint32Array(cellsX * cellsZ * 6)
  let indexOffset = 0
  for (let z = 0; z < cellsZ; z += 1) {
    for (let x = 0; x < cellsX; x += 1) {
      const topLeft = pointIndex(x, z)
      const topRight = pointIndex(x + 1, z)
      const bottomLeft = pointIndex(x, z + 1)
      const bottomRight = pointIndex(x + 1, z + 1)
      indices.set([topLeft, bottomLeft, topRight, topRight, bottomLeft, bottomRight], indexOffset)
      indexOffset += 6
    }
  }

  return { vertices, indices }
}

const renderCrispCar = (gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) => {
  const previousLayerMask = camera.layers.mask
  const previousBackground = scene.background
  const previousAutoClear = gl.autoClear
  const previousOverrideMaterial = scene.overrideMaterial
  scene.background = null
  gl.autoClear = false
  gl.clearDepth()
  camera.layers.set(WORLD_LAYER)
  scene.overrideMaterial = worldDepthMaterial
  gl.render(scene, camera)
  scene.overrideMaterial = null
  gl.clearDepth()
  camera.layers.set(CAR_LAYER)
  gl.render(scene, camera)
  gl.autoClear = previousAutoClear
  scene.background = previousBackground
  scene.overrideMaterial = previousOverrideMaterial
  camera.layers.mask = previousLayerMask
}

const CAR_MODELS = {
  comet: { url: modelUrl("synkro.glb"), yaw: Math.PI / 2 },
  vortex: { url: modelUrl("rd-02.glb"), yaw: Math.PI },
  titan: { url: modelUrl("piledriver.glb"), yaw: Math.PI / 2 },
} as const

const CarModel = memo(function CarModel({ car, customModel, onCustomModelReady }: Pick<SceneProps, "car" | "customModel" | "onCustomModelReady">) {
  const stockConfig = CAR_MODELS[car.id as keyof typeof CAR_MODELS]
  const config = customModel
    ? { url: customModel.url, yaw: THREE.MathUtils.degToRad(customModel.yawDegrees) }
    : stockConfig
  const { scene } = useGLTF(config.url)
  const normalized = useMemo(() => {
    const object = clone(scene)
    object.traverse((child) => {
      child.layers.set(CAR_LAYER)
      if (!(child instanceof THREE.Mesh)) return
      child.geometry = child.geometry.clone()
      child.material = Array.isArray(child.material)
        ? child.material.map((material) => material.clone())
        : child.material.clone()
    })
    object.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(object)
    const size = bounds.getSize(new THREE.Vector3())
    const center = bounds.getCenter(new THREE.Vector3())
    return {
      object,
      scale: 4.2 / Math.max(0.001, size.x, size.z),
      offset: [-center.x, -bounds.min.y, -center.z] as [number, number, number],
    }
  }, [scene])
  const customModelUrl = customModel?.url

  useEffect(() => {
    if (customModelUrl) onCustomModelReady?.()
  }, [customModelUrl, onCustomModelReady])

  return (
    <group
      name="player-car-model"
      rotation={[0, config.yaw, 0]}
      scale={normalized.scale * (customModel ? THREE.MathUtils.clamp(customModel.scale, 0.25, 3) : 1)}
      dispose={null}
    >
      <primitive object={normalized.object} position={normalized.offset} dispose={null} />
    </group>
  )
})

class ModelErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode; onError?: () => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Car model could not be loaded", error, info)
    this.props.onError?.()
  }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}

function LoadingCar({ car }: Pick<SceneProps, "car">) {
  return (
    <mesh rotation={[0, 0, Math.PI]} onUpdate={enableCarLayer}>
      <coneGeometry args={[1.12, 3.8, 4]} />
      <meshStandardMaterial color={car.color} emissive={car.color} emissiveIntensity={0.24} roughness={0.32} metalness={0.82} />
    </mesh>
  )
}

function OpenWorldTrack() {
  const { scene } = useGLTF(TRACK_URL)
  const visual = useMemo(() => {
    const object = clone(scene)
    object.traverse((child) => child.layers.set(WORLD_LAYER))
    return object
  }, [scene])
  const collisionMeshes = useMemo(() => {
    scene.updateMatrixWorld(true)
    const meshes: Array<{ name: string; kind: "terrain" | "obstacle"; vertices: Float32Array; indices: Uint32Array }> = []
    scene.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || NON_SOLID_MESH_NAMES.has(child.name)) return
      const positions = child.geometry.getAttribute("position")
      const sourceIndices = child.geometry.getIndex()
      const indices = sourceIndices
        ? Uint32Array.from({ length: sourceIndices.count }, (_, index) => sourceIndices.getX(index))
        : Uint32Array.from({ length: positions.count }, (_, index) => index)
      const appendMesh = (name: string, matrix: THREE.Matrix4) => {
        const vertices = new Float32Array(positions.count * 3)
        const point = new THREE.Vector3()
        for (let index = 0; index < positions.count; index += 1) {
          point.set(positions.getX(index), positions.getY(index), positions.getZ(index)).applyMatrix4(matrix)
          vertices[index * 3] = point.x
          vertices[index * 3 + 1] = point.y
          vertices[index * 3 + 2] = point.z
        }
        meshes.push({
          name,
          kind: TERRAIN_MESH_NAMES.has(child.name) ? "terrain" : "obstacle",
          vertices,
          indices,
        })
      }
      if (child instanceof THREE.InstancedMesh) {
        const instanceMatrix = new THREE.Matrix4()
        for (let instance = 0; instance < child.count; instance += 1) {
          child.getMatrixAt(instance, instanceMatrix)
          appendMesh(`${child.name}-${instance}`, new THREE.Matrix4().multiplyMatrices(child.matrixWorld, instanceMatrix))
        }
      } else {
        appendMesh(child.name, child.matrixWorld)
      }
    })
    return meshes
  }, [scene])
  const safetyTerrain = useMemo(() => {
    scene.updateMatrixWorld(true)
    const terrainMeshes: THREE.Mesh[] = []
    scene.traverse((child) => {
      if (child instanceof THREE.Mesh && TERRAIN_MESH_NAMES.has(child.name)) terrainMeshes.push(child)
    })
    return buildSafetyTerrain(terrainMeshes)
  }, [scene])

  return (
    <>
      <primitive object={visual} dispose={null} />
      <RigidBody type="fixed" colliders={false} friction={1.2} restitution={0}>
        {collisionMeshes.filter((mesh) => mesh.kind === "terrain").map((mesh) => (
          <TrimeshCollider key={mesh.name} args={[mesh.vertices, mesh.indices]} friction={1.2} restitution={0} collisionGroups={TERRAIN_COLLISION_GROUPS} />
        ))}
        <TrimeshCollider
          args={[safetyTerrain.vertices, safetyTerrain.indices]}
          friction={1.1}
          restitution={0}
          collisionGroups={TERRAIN_COLLISION_GROUPS}
        />
      </RigidBody>
      <RigidBody type="fixed" colliders={false} friction={0.8} restitution={0}>
        {collisionMeshes.filter((mesh) => mesh.kind === "obstacle").map((mesh) => (
          <TrimeshCollider
            key={mesh.name}
            args={[mesh.vertices, mesh.indices]}
            friction={0.8}
            restitution={0}
            collisionGroups={OBSTACLE_COLLISION_GROUPS}
          />
        ))}
      </RigidBody>
      <RigidBody type="fixed" colliders={false} friction={0.8} restitution={0}>
        <CuboidCollider
          args={[BOUNDARY_THICKNESS, BOUNDARY_HALF_HEIGHT, BOUNDARY_HALF_SIZE.z]}
          position={[PLAYABLE_BOUNDS.minX, 2, BOUNDARY_CENTER.z]}
          collisionGroups={OBSTACLE_COLLISION_GROUPS}
        />
        <CuboidCollider
          args={[BOUNDARY_THICKNESS, BOUNDARY_HALF_HEIGHT, BOUNDARY_HALF_SIZE.z]}
          position={[PLAYABLE_BOUNDS.maxX, 2, BOUNDARY_CENTER.z]}
          collisionGroups={OBSTACLE_COLLISION_GROUPS}
        />
        <CuboidCollider
          args={[BOUNDARY_HALF_SIZE.x, BOUNDARY_HALF_HEIGHT, BOUNDARY_THICKNESS]}
          position={[BOUNDARY_CENTER.x, 2, PLAYABLE_BOUNDS.minZ]}
          collisionGroups={OBSTACLE_COLLISION_GROUPS}
        />
        <CuboidCollider
          args={[BOUNDARY_HALF_SIZE.x, BOUNDARY_HALF_HEIGHT, BOUNDARY_THICKNESS]}
          position={[BOUNDARY_CENTER.x, 2, PLAYABLE_BOUNDS.maxZ]}
          collisionGroups={OBSTACLE_COLLISION_GROUPS}
        />
      </RigidBody>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[520, 0.25, 520]} position={[0, -18, -130]} friction={1.1} collisionGroups={CATCH_COLLISION_GROUPS} />
      </RigidBody>
    </>
  )
}

const ackermannAngles = (centerAngle: number, wheelbase: number, trackWidth: number) => {
  if (Math.abs(centerAngle) < 0.0001) return [0, 0] as const
  const sign = Math.sign(centerAngle)
  const radius = wheelbase / Math.tan(Math.abs(centerAngle))
  const inner = Math.atan(wheelbase / Math.max(0.1, radius - trackWidth / 2)) * sign
  const outer = Math.atan(wheelbase / (radius + trackWidth / 2)) * sign
  return sign > 0 ? [inner, outer] as const : [outer, inner] as const
}

function Vehicle({ car, telemetryRef, inputRef, physicsRef, vehicleDynamicsRef, resetVersion, customModel, onCustomModelReady, onCustomModelError }: SceneProps) {
  const body = useRef<RapierRigidBody>(null)
  const controller = useRef<VehicleController | null>(null)
  const massPropertiesSignature = useRef("")
  const steering = useRef(0)
  const previousVelocity = useRef(new THREE.Vector3())
  const previousForwardSpeed = useRef(0)
  const cameraTarget = useRef(new THREE.Vector3(START_POSITION.x, START_POSITION.y, START_POSITION.z - 5))
  const distance = useRef(0)
  const lastSafePose = useRef({
    position: { ...START_POSITION },
    rotation: { x: 0, y: Math.sin(START_YAW / 2), z: 0, w: Math.cos(START_YAW / 2) },
  })
  const recoveryCooldown = useRef(0)
  const airborneSeconds = useRef(0)
  const { world, rapier } = useRapier()
  const { camera } = useThree()

  const terrainHeightAt = useCallback((x: number, z: number, chassis?: RapierRigidBody) => {
    const originY = 80
    const ray = new rapier.Ray({ x, y: originY, z }, { x: 0, y: -1, z: 0 })
    const hit = world.castRay(
      ray,
      160,
      true,
      rapier.QueryFilterFlags.EXCLUDE_SENSORS,
      TERRAIN_RAY_GROUPS,
      undefined,
      chassis,
    )
    return hit ? originY - hit.timeOfImpact : null
  }, [rapier, world])

  const placeChassis = useCallback((chassis: RapierRigidBody, useLastSafePose = false) => {
    const saved = lastSafePose.current
    const groundY = terrainHeightAt(START_POSITION.x, START_POSITION.z, chassis)
    const spawnClearance = physicsRef.current.wheelRadiusMeters
      + vehicleDynamicsRef.current.suspensionRestLengthMeters
      + 0.4
    const position = useLastSafePose
      ? { ...saved.position }
      : { ...START_POSITION, y: groundY === null ? START_POSITION.y : groundY + spawnClearance }
    const rotation = useLastSafePose
      ? saved.rotation
      : { x: 0, y: Math.sin(START_YAW / 2), z: 0, w: Math.cos(START_YAW / 2) }
    chassis.setTranslation(position, true)
    chassis.setRotation(rotation, true)
    chassis.setLinvel({ x: 0, y: 0, z: 0 }, true)
    chassis.setAngvel({ x: 0, y: 0, z: 0 }, true)
    steering.current = 0
    previousVelocity.current.set(0, 0, 0)
    previousForwardSpeed.current = 0
    cameraTarget.current.set(position.x, position.y, position.z - 5)
    if (!useLastSafePose) lastSafePose.current = { position, rotation }
  }, [physicsRef, terrainHeightAt, vehicleDynamicsRef])

  useEffect(() => {
    if (!body.current) return
    const vehicle = world.createVehicleController(body.current)
    vehicle.indexUpAxis = 1
    vehicle.setIndexForwardAxis = 2
    for (let index = 0; index < 4; index += 1) {
      vehicle.addWheel({ x: 0, y: -0.15, z: 0 }, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, 0.16, physicsRef.current.wheelRadiusMeters)
    }
    controller.current = vehicle
    return () => {
      controller.current = null
      world.removeVehicleController(vehicle)
    }
  }, [physicsRef, world])

  useEffect(() => {
    const chassis = body.current
    if (!chassis) return
    placeChassis(chassis)
    distance.current = 0
  }, [placeChassis, resetVersion])

  useBeforePhysicsStep(() => {
    const vehicle = controller.current
    const chassis = body.current
    if (!vehicle || !chassis) return
    const tuning = vehicleDynamicsRef.current
    const powertrain = physicsRef.current
    const telemetry = telemetryRef.current
    const input = inputRef.current
    const position = chassis.translation()
    const velocity = chassis.linvel()
    const terrainY = terrainHeightAt(position.x, position.z, chassis)
    const previousGroundContacts = [0, 1, 2, 3].filter((index) => vehicle.wheelIsInContact(index)).length
    airborneSeconds.current = previousGroundContacts === 0
      ? airborneSeconds.current + PHYSICS_STEP
      : 0
    const outsidePlayableWorld = position.x < PLAYABLE_BOUNDS.minX - RECOVERY_MARGIN
      || position.x > PLAYABLE_BOUNDS.maxX + RECOVERY_MARGIN
      || position.z < PLAYABLE_BOUNDS.minZ - RECOVERY_MARGIN
      || position.z > PLAYABLE_BOUNDS.maxZ + RECOVERY_MARGIN
    const escapedUpward = terrainY !== null
      && (position.y > terrainY + MAX_HEIGHT_ABOVE_TERRAIN || velocity.y > MAX_UPWARD_SPEED)
    const strandedAboveTerrain = terrainY !== null
      && airborneSeconds.current > MAX_AIRBORNE_SECONDS
      && position.y > terrainY + 1.2
    const missingTerrainWhileAirborne = terrainY === null
      && previousGroundContacts === 0
      && airborneSeconds.current > MAX_AIRBORNE_SECONDS
    recoveryCooldown.current = Math.max(0, recoveryCooldown.current - PHYSICS_STEP)
    if (outsidePlayableWorld || missingTerrainWhileAirborne || (terrainY !== null && position.y < terrainY - 0.3) || escapedUpward || strandedAboveTerrain) {
      const canUseLastSafePose = recoveryCooldown.current <= 0
      placeChassis(chassis, canUseLastSafePose)
      recoveryCooldown.current = 1
      airborneSeconds.current = 0
      telemetryRef.current = {
        ...telemetry,
        speedMps: 0,
        signedForwardSpeedMps: 0,
        acceleration: 0,
        wheelForceNewtons: 0,
        lateralAcceleration: 0,
        slipAngle: 0,
        groundedWheels: 0,
        steering: 0,
      }
      return
    }
    const halfTrack = tuning.trackWidthMeters / 2
    const halfWheelbase = tuning.wheelbaseMeters / 2
    const wheelY = -0.13
    const wheelConnections = [
      { x: -halfTrack, y: wheelY, z: -halfWheelbase },
      { x: halfTrack, y: wheelY, z: -halfWheelbase },
      { x: -halfTrack, y: wheelY, z: halfWheelbase },
      { x: halfTrack, y: wheelY, z: halfWheelbase },
    ]

    const speedRatio = Math.abs(telemetry.speedMps) / 12
    const speedSteeringFactor = 1 / (1 + 2 * tuning.steeringSpeedSensitivity * speedRatio * speedRatio)
    const maxAngle = tuning.steeringLockRadians * (0.12 + 0.88 * speedSteeringFactor)
    const steeringAxis = Number.isFinite(input.steeringAxis) ? input.steeringAxis : 0
    const brakeAxis = Number.isFinite(input.brakeAxis) ? input.brakeAxis : 0
    const steeringInput = THREE.MathUtils.clamp(steeringAxis + Number(input.right) - Number(input.left), -1, 1)
    const targetSteering = -steeringInput * maxAngle
    steering.current = THREE.MathUtils.damp(steering.current, targetSteering, tuning.steeringResponse, PHYSICS_STEP)
    const [frontLeft, frontRight] = ackermannAngles(steering.current, tuning.wheelbaseMeters, tuning.trackWidthMeters)

    chassis.setAngularDamping(tuning.chassisAngularDamping)
    chassis.setLinearDamping(tuning.chassisLinearDamping)
    const massSignature = `${car.massKg}:${tuning.centerOfMassDropMeters}`
    if (massPropertiesSignature.current !== massSignature) {
      const width = 1.8
      const height = 0.56
      const length = 4.04
      const inertia = {
        x: car.massKg * (height * height + length * length) / 12,
        y: car.massKg * (width * width + length * length) / 12,
        z: car.massKg * (width * width + height * height) / 12,
      }
      chassis.setAdditionalMassProperties(
        car.massKg,
        { x: 0, y: -tuning.centerOfMassDropMeters, z: 0 },
        inertia,
        { x: 0, y: 0, z: 0, w: 1 },
        true,
      )
      massPropertiesSignature.current = massSignature
    }
    wheelConnections.forEach((connection, index) => {
      const front = index < 2
      vehicle.setWheelChassisConnectionPointCs(index, connection)
      vehicle.setWheelRadius(index, powertrain.wheelRadiusMeters)
      vehicle.setWheelSuspensionRestLength(index, tuning.suspensionRestLengthMeters)
      vehicle.setWheelMaxSuspensionTravel(index, tuning.maxSuspensionTravelMeters)
      vehicle.setWheelSuspensionStiffness(index, tuning.suspensionStiffness)
      vehicle.setWheelSuspensionCompression(index, tuning.compressionDamping)
      vehicle.setWheelSuspensionRelaxation(index, tuning.reboundDamping)
      vehicle.setWheelMaxSuspensionForce(index, tuning.maxSuspensionForceNewtons)
      vehicle.setWheelFrictionSlip(index, tuning.longitudinalFrictionSlip)
      vehicle.setWheelSideFrictionStiffness(index, front ? tuning.frontSideFriction : tuning.rearSideFriction)
      vehicle.setWheelSteering(index, index === 0 ? frontLeft : index === 1 ? frontRight : 0)
    })

    const brakeAmount = THREE.MathUtils.clamp(Math.max(Number(input.brake), brakeAxis), 0, 1)
    const totalForce = brakeAmount > 0.01 ? 0 : -telemetry.wheelForceNewtons * telemetry.driveDirection
    const frontDriveForce = totalForce * (1 - tuning.rearDriveBias) / 2
    const rearDriveForce = totalForce * tuning.rearDriveBias / 2
    vehicle.setWheelEngineForce(0, frontDriveForce)
    vehicle.setWheelEngineForce(1, frontDriveForce)
    vehicle.setWheelEngineForce(2, rearDriveForce)
    vehicle.setWheelEngineForce(3, rearDriveForce)

    const chassisRotation = chassis.rotation()
    const chassisForward = new THREE.Vector3(0, 0, -1).applyQuaternion(new THREE.Quaternion(
      chassisRotation.x,
      chassisRotation.y,
      chassisRotation.z,
      chassisRotation.w,
    ))
    const chassisVelocity = chassis.linvel()
    const signedForwardSpeed = chassisForward.dot(new THREE.Vector3(chassisVelocity.x, chassisVelocity.y, chassisVelocity.z))
    if (Math.abs(signedForwardSpeed) > 0.1) {
      const aerodynamicDrag = 0.5 * 1.225 * car.dragArea * signedForwardSpeed * signedForwardSpeed
      const rollingResistance = car.massKg * 9.81 * powertrain.rollingResistance
      chassis.applyImpulse(
        chassisForward.multiplyScalar(-Math.sign(signedForwardSpeed) * (aerodynamicDrag + rollingResistance) * PHYSICS_STEP),
        true,
      )
    }

    const brakeImpulse = brakeAmount * powertrain.brakeForceNewtons * PHYSICS_STEP
    const frontBrake = brakeImpulse * tuning.frontBrakeBias / 2
    const rearBrake = brakeImpulse * (1 - tuning.frontBrakeBias) / 2
    vehicle.setWheelBrake(0, frontBrake)
    vehicle.setWheelBrake(1, frontBrake)
    vehicle.setWheelBrake(2, rearBrake)
    vehicle.setWheelBrake(3, rearBrake)
    // Suspension rays may only treat authored terrain as ground. Letting a
    // wheel ray land on a fence, guardrail, or building can turn a collision
    // into an unbounded suspension launch, especially under braking.
    vehicle.updateVehicle(
      PHYSICS_STEP,
      rapier.QueryFilterFlags.EXCLUDE_SENSORS,
      TERRAIN_RAY_GROUPS,
    )
  })

  useAfterPhysicsStep(() => {
    const chassis = body.current
    const vehicle = controller.current
    if (!chassis || !vehicle) return
    const translation = chassis.translation()
    const rotation = chassis.rotation()
    const velocityValue = chassis.linvel()
    const velocity = new THREE.Vector3(velocityValue.x, velocityValue.y, velocityValue.z)
    const quaternion = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w)
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(quaternion)
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion)
    const forwardSpeed = velocity.dot(forward)
    const sideSpeed = velocity.dot(right)
    const horizontalSpeed = Math.hypot(velocity.x, velocity.z)
    const accelerationVector = velocity.clone().sub(previousVelocity.current).multiplyScalar(1 / PHYSICS_STEP)
    const longitudinalAcceleration = (forwardSpeed - previousForwardSpeed.current) / PHYSICS_STEP
    const lateralAcceleration = accelerationVector.dot(right)
    distance.current += horizontalSpeed * PHYSICS_STEP
    previousVelocity.current.copy(velocity)
    previousForwardSpeed.current = forwardSpeed
    const groundedWheels = [0, 1, 2, 3].filter((index) => vehicle.wheelIsInContact(index)).length
    const stableTerrainContacts = [0, 1, 2, 3].every((index) => {
      const normal = vehicle.wheelContactNormal(index)
      return normal !== null && normal.y > 0.45
    })
    const upright = new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion).y
    if (recoveryCooldown.current <= 0 && groundedWheels === 4 && stableTerrainContacts && upright > 0.55 && Math.abs(velocity.y) < 4) {
      lastSafePose.current = {
        position: { x: translation.x, y: translation.y, z: translation.z },
        rotation: { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w },
      }
    }
    telemetryRef.current = {
      ...telemetryRef.current,
      speedMps: horizontalSpeed,
      signedForwardSpeedMps: forwardSpeed,
      acceleration: longitudinalAcceleration,
      distance: distance.current,
      positionX: translation.x,
      positionY: translation.y,
      positionZ: translation.z,
      yaw: new THREE.Euler().setFromQuaternion(quaternion, "YXZ").y,
      lateralAcceleration,
      slipAngle: Math.atan2(sideSpeed, Math.abs(forwardSpeed) + 0.5),
      groundedWheels,
      steering: steering.current,
      lateral: translation.x,
    }
  })

  useFrame((_, delta) => {
    const chassis = body.current
    if (!chassis) return
    const p = chassis.translation()
    const q = chassis.rotation()
    const position = new THREE.Vector3(p.x, p.y, p.z)
    const quaternion = new THREE.Quaternion(q.x, q.y, q.z, q.w)
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(quaternion)
    const up = new THREE.Vector3(0, 1, 0)
    const speed = telemetryRef.current.speedMps
    const followDistance = 8.4 + Math.min(3.4, speed * 0.045)
    const desiredCamera = position.clone().addScaledVector(forward, -followDistance).addScaledVector(up, 3.5)
    camera.position.lerp(desiredCamera, 1 - Math.exp(-5.5 * delta))
    const desiredTarget = position.clone().addScaledVector(forward, 5.2).addScaledVector(up, 0.65)
    cameraTarget.current.lerp(desiredTarget, 1 - Math.exp(-7 * delta))
    camera.lookAt(cameraTarget.current)
  })

  return (
    <RigidBody
      ref={body}
      name="player-car"
      colliders={false}
      position={[START_POSITION.x, START_POSITION.y, START_POSITION.z]}
      rotation={[0, START_YAW, 0]}
      ccd
      canSleep={false}
    >
      <RoundCuboidCollider
        args={[0.78, 0.12, 1.82, 0.1]}
        position={[0, 0.05, 0]}
        mass={0}
        friction={0.35}
        restitution={0.05}
        collisionGroups={VEHICLE_COLLISION_GROUPS}
      />
      <group position={[0, -0.52, 0]} onUpdate={enableCarLayer}>
        <ModelErrorBoundary key={customModel?.url ?? car.id} fallback={<LoadingCar car={car} />} onError={onCustomModelError}>
          <Suspense fallback={<LoadingCar car={car} />}>
            <CarModel car={car} customModel={customModel} onCustomModelReady={onCustomModelReady} />
          </Suspense>
        </ModelErrorBoundary>
        <pointLight position={[0, 0.45, 1.7]} color={car.color} intensity={2.4} distance={5} onUpdate={enableCarLayer} />
      </group>
    </RigidBody>
  )
}

function CrispOverlay() {
  const { gl, scene, camera } = useThree()
  useFrame(() => renderCrispCar(gl, scene, camera), 2)
  return null
}

const Scene = memo(function Scene(props: SceneProps) {
  return (
    <>
      <color attach="background" args={["#91b9d2"]} />
      <fog attach="fog" args={["#a9c4d4", 240, 760]} />
      <ambientLight intensity={1.05} />
      <hemisphereLight args={["#dff5ff", "#64764b", 1.8]} />
      <directionalLight position={[90, 140, 70]} intensity={2.8} color="#fff5df" castShadow />
      <Physics
        gravity={[0, -9.81, 0]}
        timeStep={PHYSICS_STEP}
        interpolate
        numSolverIterations={8}
        numInternalPgsIterations={2}
        maxCcdSubsteps={4}
      >
        <Suspense fallback={null}>
          <OpenWorldTrack />
          <Vehicle {...props} />
        </Suspense>
      </Physics>
      <EffectComposer multisampling={0}>
        <SpeedMotionBlur telemetryRef={props.telemetryRef} tuningRef={props.bodyMotionRef} />
      </EffectComposer>
      <CrispOverlay />
    </>
  )
})

export const TrackScene = memo(function TrackScene(props: TrackSceneProps) {
  return (
    <Canvas
      camera={{ position: [START_POSITION.x - 10, 4.9, START_POSITION.z], fov: 61, near: 0.1, far: 1200 }}
      dpr={[1, 1.25]}
      gl={{ antialias: false, powerPreference: "high-performance" }}
      onCreated={({ scene, gl, camera }) => {
        if (!new URLSearchParams(window.location.search).has("benchmark")) return
        ;(window as BenchmarkWindow).__torqueZeroBenchmark = { scene, renderer: gl, camera }
      }}
    >
      <Scene {...props} />
    </Canvas>
  )
})

useGLTF.preload(TRACK_URL)
