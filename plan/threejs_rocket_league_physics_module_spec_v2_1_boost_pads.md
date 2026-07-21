# Three.js + Rapier Rocket-League-Style Car and Ball Physics
## Implementation, Automated Testing, Calibration, and Iteration Specification

**Document version:** 2.1  
**Module ID:** `PHYSICS`  
**Primary audience:** A Sonnet-level coding LLM implementing the module with minimal human intervention  
**Runtime:** Browser, local 1v1 mode  
**Rendering integration:** Three.js  
**Physics foundation:** Rapier 3D WebAssembly  
**Build tooling:** Vite + TypeScript  
**Automated browser testing:** Playwright Test  
**Target physics rate:** Fixed 120 Hz  
**Supported dynamic entities:** Two Octane-style cars and one standard ball  
**Module scope:** Deterministic rigid-body simulation, car controllers, ball physics, car-car contacts, car-ball contacts, boost-pad pickup and respawn simulation, arena contact interfaces, telemetry, and physics calibration

---

# 0. Instructions to the Implementing LLM

Read this entire document before changing code.

Your task is not to create a realistic motor vehicle. Your task is to create a controllable rigid-body car whose **observable behaviour** closely resembles Rocket League.

Follow these rules:

1. Implement the project in phases in the order specified.
2. Do not skip automated tests to move faster.
3. Do not use Rapier's built-in vehicle controller.
4. Do not use four physical wheel bodies or wheel joints.
5. Do not directly move dynamic rigid-body transforms during ordinary gameplay.
6. Do not use frame delta as the physics timestep.
7. Do not mix centimetres and metres inside the physics world.
8. Do not let both Rapier and custom code apply the same collision response.
9. Keep measured constants separate from calibration parameters.
10. Expose all calibration parameters through one typed registry.
11. Add deterministic test hooks before implementing advanced mechanics.
12. When a benchmark fails, diagnose the responsible subsystem rather than changing unrelated values.
13. After each phase, run the required Playwright test group.
14. Preserve passing regression tests while tuning new behaviour.
15. Record any deliberate deviation from this specification in `docs/physics-deviations.md`.
16. Never implement the car as a global singleton; every car system must operate by `CarId` or `CarEntity` reference.
17. Never make physics depend on whether a car is human-controlled or AI-controlled.
18. Resolve cars and collision pairs in a stable deterministic order.
19. Treat arena geometry, scoring rules, spawn selection, teams, cameras, audio, and AI decisions as external modules.
20. Expose narrow typed interfaces for those future modules rather than importing them into the physics core.

The implementation is complete only when:

- The deterministic automated benchmarks pass.
- Both cars can independently drive, turn, powerslide, jump, double-jump, dodge, boost and fly.
- The ball bounces and rolls reliably.
- Car-ball hits are directional and satisfying.
- Car-car bumps are stable, readable and physically consequential.
- Two cars can contact the ball during the same physics tick without losing or duplicating either interaction.
- Small and full boost pads can be collected, contested, depleted, respawned, reset, observed, and tested deterministically.
- The game remains stable across render frame rates.
- Manual playtesting rates the controller as responsive and fun.
- Calibration can continue without rewriting the architecture.

---

# 1. Project Goal

Create the reusable **physics module** for a local Rocket-League-style 1v1 game.

The physics world must support:

- Two independently controlled Octane-style cars
- One standard dynamic ball
- Car-versus-arena contacts
- Ball-versus-arena contacts
- Car-versus-car collisions
- Either or both cars contacting the ball during the same physics tick
- Independent boost, jump, dodge, suspension and controller state per car
- Deterministic tests and repeatable scenario simulation

This document is **not** the complete game specification. It is one module that will later be combined with separate specifications for:

- Enemy AI and decision-making
- Stadium geometry and visual design
- Match rules, scoring and kickoffs
- User interface and HUD
- Cameras
- Audio and effects
- Menus and game flow
- Visual assets and animation
- Input mapping and accessibility

The first implementation is expected to be imperfect.

The architecture must support a deliberate development loop:

```text
Implement
  -> measure
  -> compare
  -> diagnose
  -> change a small parameter group
  -> rerun deterministic tests
  -> run two-car interaction regressions
  -> playtest
  -> save a calibrated preset
  -> repeat
```

The physics module must optimise for:

- Predictability
- Responsiveness
- Mechanical depth
- Stable simultaneous contacts
- Stable car-car collision behaviour
- Independent per-car state
- Easy measurement
- Easy calibration
- Fast regression testing
- Fun local 1v1 play
- Clean integration with future modules

The physics module does not need:

- Networking
- Server authority
- Rollback
- Client prediction
- Matchmaking
- More than two active cars
- Demolitions
- Team logic beyond opaque metadata
- Goal scoring logic
- AI decision-making
- Camera behaviour
- Competitive anti-cheat
- Cross-machine bitwise determinism
- A complete regulation stadium

Although the supported game mode is 1v1, avoid algorithms that only work because there are exactly two cars. Collections, pair generation, telemetry and contact tracking should be entity-based so expanding the maximum car count later would not require a rewrite.

---

# 2. Physics Module Boundary and Integration Contract

## 2.1 Module responsibility

The physics module owns:

- Rapier world creation and fixed stepping
- Car rigid bodies and colliders
- Ball rigid body and collider
- Per-car mechanical state
- Suspension and support queries
- Ground movement and steering
- Grip and powerslide
- Boost mechanics
- Jump, second-jump and dodge mechanics
- Aerial rotational control
- Car-arena, ball-arena, car-car and car-ball physical response
- Speed and angular-speed limits
- Contact lifecycle tracking
- Boost-pad overlap resolution, pickup state, respawn timers, and collection events
- Physics resets and teleports
- Deterministic scenario execution
- Physics events, diagnostics and telemetry

The physics module does not own:

- Which car is the player
- Which car is controlled by AI
- AI target selection or planning
- Teams, scores or match timers
- Goal detection as a game rule
- Kickoff sequencing
- Stadium art or render meshes
- Camera selection or following
- Audio playback
- Particle effects
- HUD presentation
- Controller or keyboard binding policy

## 2.2 Input-provider contract

Every car consumes the same normalised `CarInput` structure.

```ts
export type CarId = string;

export interface CarInputProvider {
  sampleInput(context: CarInputContext): CarInput;
}

export interface CarInputContext {
  tick: number;
  simulationTime: number;
  carId: CarId;
  car: Readonly<CarObservation>;
  ball: Readonly<BallObservation>;
  otherCars: readonly CarObservation[];
}
```

Examples of future providers:

```text
HumanInputProvider
EnemyAiInputProvider
ReplayInputProvider
PlaywrightInputProvider
ScriptedScenarioInputProvider
```

Physics must not branch on provider type.

AI is allowed to observe serialisable physics state and return `CarInput`. AI must not:

- Apply Rapier impulses directly
- Set body transforms directly
- Modify boost or jump state directly
- Call private controller methods
- Override collision results

## 2.3 Arena contract

A future stadium module supplies collision-ready arena data through a narrow interface.

```ts
export interface PhysicsArenaDefinition {
  id: string;
  colliders: readonly ArenaColliderDefinition[];
  spawnPoints?: readonly PhysicsSpawnPoint[];
  surfaceTags?: readonly SurfaceTagDefinition[];
  sensorVolumes?: readonly PhysicsSensorDefinition[];
  boostPads: readonly BoostPadDefinition[];
}
```

Physics may use:

- Fixed collider geometry
- Surface normals
- Material identifiers
- Optional sensor-volume overlap events
- Spawn transforms for resets

Physics must not assume:

- A specific stadium mesh hierarchy
- A specific goal shape
- A specific scoring rule
- A specific visual scale outside the metre-based contract

Goal sensors may report overlap events, but the future match-rules module decides whether an overlap counts as a goal.

## 2.4 Match-rules contract

The future match-rules module may call:

```ts
physics.resetMatchState(reset: PhysicsResetCommand): void;
physics.teleportCar(carId, transform, resetVelocity): void;
physics.teleportBall(transform, resetVelocity): void;
physics.setSimulationEnabled(enabled): void;
```

Physics emits facts, not match decisions:

```ts
export type PhysicsEvent =
  | CarCarContactStartedEvent
  | CarCarContactEndedEvent
  | CarBallContactStartedEvent
  | CarBallContactEndedEvent
  | BallArenaContactEvent
  | CarArenaContactEvent
  | SensorEnteredEvent
  | SensorExitedEvent
  | JumpEvent
  | DodgeEvent;
```

## 2.5 Rendering contract

Rendering reads immutable snapshots:

```ts
export interface PhysicsRenderSnapshot {
  tick: number;
  alpha: number;
  cars: readonly CarRenderState[];
  ball: BallRenderState;
}
```

Rendering must not mutate physics.

## 2.6 Entity identity

Every dynamic entity has a stable ID.

```ts
type PhysicsEntityId = string;
type CarId = PhysicsEntityId;
type BallId = PhysicsEntityId;
```

Required default IDs:

```text
car-player
car-opponent
ball-main
```

IDs are labels only. Physics behaviour must be identical for both cars.

## 2.7 Stable ordering

At every tick:

- Sort cars by stable `CarId`, or preserve a stable registry insertion index.
- Generate unordered car pairs once: `(minId, maxId)`.
- Process contact events in a stable entity-pair order.
- Never depend on JavaScript object-key order for physical outcomes.
- Never process “player car first” as a special rule.

Deterministic ordering matters when both cars contact the ball or each other during the same tick.

---

# 3. Technology Decision

## 2.1 Required libraries

Install:

```bash
npm install three @dimforge/rapier3d-compat
npm install -D typescript vite @types/three @playwright/test
npx playwright install chromium
```

Recommended optional development dependencies:

```bash
npm install lil-gui stats.js
```

Use:

- **Three.js** for rendering, cameras, debug geometry, visual interpolation and assets.
- **Rapier 3D** for rigid bodies, colliders, broad phase, narrow phase, contact generation, integration and continuous collision detection.
- **Custom TypeScript** for all Rocket-League-specific handling.
- **Playwright Test** for deterministic browser integration tests, trajectory regression tests, input tests, screenshots, traces and videos.
- **Vite** for the local server and browser build.
- **lil-gui** only in development for live parameter tuning.
- **stats.js** only for performance diagnostics.

## 2.2 Why Rapier

Rapier provides the capabilities required by this project:

- Dynamic cuboid and sphere bodies
- Forces, impulses and torques
- Impulses at arbitrary points
- Custom mass properties
- Ray and shape queries
- Contact manifolds
- Collision events
- Collision and solver groups
- Physics hooks
- Continuous collision detection
- Fixed-timestep stepping
- WebAssembly performance

Rapier must be treated as the **rigid-body and collision foundation**, not as the game-design layer.

## 2.3 Explicitly rejected approaches

Do not use:

- Three.js raycasting as the main collision system
- AABB-only car collision
- A normal racing-game raycast vehicle
- Rapier's vehicle controller
- Cannon-es RaycastVehicle
- Four dynamic wheels connected by joints
- High generic friction as a substitute for custom grip
- Variable timestep physics
- Manual position integration in parallel with Rapier
- Keyboard automation as the main quantitative physics test method

---

# 4. Proposed Repository Structure

The physics module must remain separable from future game modules.

```text
/
├─ index.html
├─ package.json
├─ tsconfig.json
├─ vite.config.ts
├─ playwright.config.ts
├─ README.md
│
├─ docs/
│  ├─ modules/
│  │  ├─ physics.md
│  │  ├─ ai.md                 # future separate module
│  │  ├─ stadium.md            # future separate module
│  │  ├─ match-rules.md        # future separate module
│  │  └─ integration.md        # final combined system contract
│  ├─ physics-deviations.md
│  ├─ calibration-log.md
│  └─ playtest-log.md
│
├─ public/
│  └─ assets/
│
├─ src/
│  ├─ main.ts
│  ├─ app/
│  │  ├─ GameApp.ts
│  │  ├─ GameMode.ts
│  │  └─ InputManager.ts
│  │
│  ├─ physics/
│  │  ├─ index.ts
│  │  ├─ PhysicsModule.ts
│  │  ├─ PhysicsWorld.ts
│  │  ├─ PhysicsFacade.ts
│  │  ├─ FixedStepRunner.ts
│  │  ├─ PhysicsConstants.ts
│  │  ├─ PhysicsParameters.ts
│  │  ├─ PhysicsTypes.ts
│  │  ├─ PhysicsEvents.ts
│  │  ├─ PhysicsEventQueue.ts
│  │  ├─ CoordinateSystem.ts
│  │  ├─ RapierAdapters.ts
│  │  ├─ CollisionLayers.ts
│  │  ├─ PhysicsTelemetry.ts
│  │  ├─ PhysicsRenderSnapshot.ts
│  │  │
│  │  ├─ entities/
│  │  │  ├─ PhysicsEntityRegistry.ts
│  │  │  ├─ CarRegistry.ts
│  │  │  ├─ CarId.ts
│  │  │  └─ BallId.ts
│  │  │
│  │  ├─ input/
│  │  │  ├─ CarInput.ts
│  │  │  ├─ CarInputProvider.ts
│  │  │  └─ CarInputBuffer.ts
│  │  │
│  │  ├─ car/
│  │  │  ├─ CarEntity.ts
│  │  │  ├─ CarState.ts
│  │  │  ├─ CarController.ts
│  │  │  ├─ CarBodyFactory.ts
│  │  │  ├─ SuspensionController.ts
│  │  │  ├─ GroundDriveController.ts
│  │  │  ├─ GroundSteeringController.ts
│  │  │  ├─ GripController.ts
│  │  │  ├─ BoostController.ts
│  │  │  ├─ JumpController.ts
│  │  │  ├─ DodgeController.ts
│  │  │  ├─ AerialController.ts
│  │  │  └─ CarSpeedLimiter.ts
│  │  │
│  │  ├─ boost/
│  │  │  ├─ BoostPadTypes.ts
│  │  │  ├─ BoostPadRegistry.ts
│  │  │  ├─ BoostPadSystem.ts
│  │  │  ├─ BoostPadClaimResolver.ts
│  │  │  └─ BoostPadEvents.ts
│  │  │
│  │  ├─ ball/
│  │  │  ├─ BallEntity.ts
│  │  │  ├─ BallState.ts
│  │  │  ├─ BallBodyFactory.ts
│  │  │  ├─ BallWorldResponse.ts
│  │  │  └─ BallSpeedLimiter.ts
│  │  │
│  │  ├─ collision/
│  │  │  ├─ ContactPairKey.ts
│  │  │  ├─ ContactLifecycleTracker.ts
│  │  │  ├─ CarArenaCollision.ts
│  │  │  ├─ BallArenaCollision.ts
│  │  │  ├─ CarCarCollision.ts
│  │  │  ├─ CarBallCollision.ts
│  │  │  ├─ MultiCarBallContactResolver.ts
│  │  │  ├─ CustomImpulseSolver.ts
│  │  │  └─ ExtraBallHitImpulse.ts
│  │  │
│  │  ├─ arena/
│  │  │  ├─ PhysicsArenaDefinition.ts
│  │  │  ├─ ArenaColliderFactory.ts
│  │  │  └─ TestArenaPresets.ts
│  │  │
│  │  └─ testing/
│  │     ├─ BrowserPhysicsTestApi.ts
│  │     ├─ PhysicsScenarioRunner.ts
│  │     ├─ PhysicsScenarioDefinitions.ts
│  │     └─ TestStateSerialisation.ts
│  │
│  ├─ ai/                      # future module; depends on public physics observations
│  ├─ stadium/                 # future module; supplies PhysicsArenaDefinition
│  ├─ match-rules/             # future module; consumes PhysicsEvents
│  │
│  ├─ rendering/
│  │  ├─ SceneRenderer.ts
│  │  ├─ CarVisual.ts
│  │  ├─ BallVisual.ts
│  │  ├─ ArenaVisual.ts
│  │  ├─ ChaseCamera.ts
│  │  └─ TransformInterpolator.ts
│  │
│  └─ debug/
│     ├─ DebugPanel.ts
│     ├─ PhysicsDebugDraw.ts
│     ├─ TelemetryOverlay.ts
│     ├─ TrajectoryRenderer.ts
│     └─ GhostRenderer.ts
│
├─ tests/
│  ├─ helpers/
│  │  ├─ physicsPage.ts
│  │  ├─ stateMatchers.ts
│  │  ├─ telemetryMatchers.ts
│  │  └─ scenarioSnapshots.ts
│  │
│  ├─ smoke/
│  │  └─ app-loads.spec.ts
│  │
│  ├─ deterministic/
│  │  ├─ fixed-step.spec.ts
│  │  ├─ reset-repeatability.spec.ts
│  │  ├─ entity-order-independence.spec.ts
│  │  └─ frame-rate-independence.spec.ts
│  │
│  ├─ car/
│  │  ├─ throttle.spec.ts
│  │  ├─ brake-coast.spec.ts
│  │  ├─ steering.spec.ts
│  │  ├─ powerslide.spec.ts
│  │  ├─ boost.spec.ts
│  │  ├─ jump.spec.ts
│  │  ├─ aerial.spec.ts
│  │  └─ dodge.spec.ts
│  │
│  ├─ ball/
│  │  ├─ gravity.spec.ts
│  │  ├─ bounce.spec.ts
│  │  ├─ rolling.spec.ts
│  │  └─ speed-limits.spec.ts
│  │
│  ├─ multicar/
│  │  ├─ independent-input.spec.ts
│  │  ├─ independent-state.spec.ts
│  │  ├─ car-car-head-on.spec.ts
│  │  ├─ car-car-glancing.spec.ts
│  │  ├─ car-car-resting-contact.spec.ts
│  │  ├─ simultaneous-ball-contact.spec.ts
│  │  └─ three-body-pileup.spec.ts
│  │
│  ├─ collision/
│  │  ├─ sphere-obb.spec.ts
│  │  ├─ car-ball-direction.spec.ts
│  │  ├─ car-ball-power.spec.ts
│  │  └─ contact-onset.spec.ts
│  │
│  ├─ gameplay/
│  │  ├─ dribble.spec.ts
│  │  ├─ contested-ball.spec.ts
│  │  ├─ kickoff-collision.spec.ts
│  │  ├─ shot.spec.ts
│  │  ├─ wall-drive.spec.ts
│  │  └─ recovery.spec.ts
│  │
│  └─ visual/
│     ├─ debug-hitbox.spec.ts
│     ├─ suspension.spec.ts
│     ├─ two-car-debug.spec.ts
│     └─ trajectory.spec.ts
│
└─ test-results/
```

The future AI module may import only the public observation/input types exported from `src/physics/index.ts`. It must not import private Rapier body handles or controller classes.

---

# 5. Units and Coordinate System

## 4.1 Physics units

Use metres internally.

Rocket League measurements are commonly represented in Unreal units where:

```text
1 uu = 1 centimetre
1 uu = 0.01 metres
```

Conversion:

```ts
export const UU_TO_METRES = 0.01;

export function uu(value: number): number {
  return value * UU_TO_METRES;
}
```

Convert constants once when declaring them.

Never:

- Store some physics values in uu and others in metres.
- Convert inside every controller.
- Scale Rapier body transforms separately from Three.js transforms.
- Apply a visual scale to a parent containing a physics-synchronised object.

## 4.2 Axes

Use a conventional Three.js Y-up world:

```text
World +X = right
World +Y = up
World +Z = backward
World -Z = default forward
```

Car local axes:

```text
Local +X = right
Local +Y = roof/up
Local -Z = forward/nose
```

Constants:

```ts
export const LOCAL_FORWARD = new THREE.Vector3(0, 0, -1);
export const LOCAL_RIGHT = new THREE.Vector3(1, 0, 0);
export const LOCAL_UP = new THREE.Vector3(0, 1, 0);
```

Derive axes from the Rapier orientation every physics tick:

```ts
function deriveCarAxes(
  quaternion: THREE.Quaternion,
  forward: THREE.Vector3,
  right: THREE.Vector3,
  up: THREE.Vector3
): void {
  forward.copy(LOCAL_FORWARD).applyQuaternion(quaternion).normalize();
  right.copy(LOCAL_RIGHT).applyQuaternion(quaternion).normalize();
  up.copy(LOCAL_UP).applyQuaternion(quaternion).normalize();
}
```

Three.js quaternions must stay normalised.

## 4.3 Visual model orientation

The imported car model may use any forward axis.

Required structure:

```text
carPhysicsRoot
└─ carVisualAlignmentNode
   └─ importedCarModel
```

`carPhysicsRoot` follows the Rapier body exactly.

Rotate or scale only `carVisualAlignmentNode`, never the physics root.

---

# 6. Fixed Physics Stepping

## 5.1 Required timestep

```ts
export const PHYSICS_HZ = 120;
export const PHYSICS_DT = 1 / PHYSICS_HZ;
```

The simulation must be stepped exactly at 120 Hz.

## 5.2 Runtime accumulator

```ts
export class FixedStepRunner {
  private accumulator = 0;
  private readonly dt = 1 / 120;
  private readonly maxCatchupSteps = 12;

  update(frameDeltaSeconds: number, step: (dt: number) => void): number {
    const clampedFrameDelta = Math.min(frameDeltaSeconds, 0.1);
    this.accumulator += clampedFrameDelta;

    let executed = 0;

    while (
      this.accumulator >= this.dt &&
      executed < this.maxCatchupSteps
    ) {
      step(this.dt);
      this.accumulator -= this.dt;
      executed++;
    }

    if (executed === this.maxCatchupSteps) {
      this.accumulator = Math.min(this.accumulator, this.dt);
    }

    return this.accumulator / this.dt;
  }
}
```

## 5.3 Test stepping

Automated quantitative tests must not depend on animation frames.

Expose:

```ts
stepTicks(count: number): void
```

This calls the exact physics tick function synchronously `count` times.

During deterministic test stepping:

- Pause `requestAnimationFrame`-driven physics.
- Do not read real time.
- Do not poll physical keyboard state.
- Do not interpolate physics state.
- Do not introduce random forces.
- Do not allow the car or ball to sleep.

## 5.4 Render interpolation

Store previous and current transforms around every physics step.

Render:

```ts
visual.position.lerpVectors(previousPosition, currentPosition, alpha);
visual.quaternion.slerpQuaternions(
  previousQuaternion,
  currentQuaternion,
  alpha
);
```

Interpolation is visual only. Never feed interpolated transforms back into physics.

---

# 7. Physics Constants and Confidence Classes

Create two separate files:

```text
PhysicsConstants.ts
PhysicsParameters.ts
```

`PhysicsConstants.ts` contains measured or strongly reverse-engineered values.

`PhysicsParameters.ts` contains values expected to be tuned.

## 6.1 Baseline constants in metres

```ts
export const RL_CONSTANTS = {
  physicsHz: 120,
  physicsDt: 1 / 120,

  gravity: 6.5,

  carMass: 180,
  ballMass: 30,

  carMaxSpeed: 23.0,
  noBoostDriveSpeed: 14.1,
  supersonicThreshold: 22.0,
  carMaxAngularSpeed: 5.5,

  ballRadius: 0.9125,
  ballMaxSpeed: 60.0,
  ballMaxAngularSpeed: 6.0,

  boostConsumptionPerSecond: 33.3,
  boostAccelerationGround: 9.91666,
  boostAccelerationAir: 10.58333,

  kickoffBoostAmount: 33,
  maximumBoostAmount: 100,

  smallBoostPadAmount: 12,
  smallBoostPadRespawnSeconds: 4,
  fullBoostPadRespawnSeconds: 10,

  brakeDeceleration: 35.0,
  coastDeceleration: 5.25,

  airThrottleForwardAcceleration: 0.66667,
  airThrottleReverseAcceleration: 0.33334,

  jumpDeltaVelocity: 2.92,
  jumpHoldAcceleration: 14.60,
  jumpHoldMaximumTime: 0.2,
  jumpHoldMinimumTicks: 3,

  stickyAcceleration: 3.25,
  stickyTicks: 3,

  maxYawAngularAcceleration: 9.11,
  maxPitchAngularAcceleration: 12.46,
  maxRollAngularAcceleration: 38.34,

  ballWorldRestitution: 0.6
} as const;
```

## 6.2 Calibration parameters

```ts
export interface PhysicsParameters {
  suspension: {
    restLength: number;
    maximumLength: number;
    probeRadius: number;
    springStrength: number;
    dampingStrength: number;
    maximumAcceleration: number;
    requiredGroundContacts: number;
  };

  grip: {
    normalRate: number;
    normalMaxAcceleration: number;
    powerslideRate: number;
    powerslideMaxAcceleration: number;
    blendTime: number;
  };

  steering: {
    response: number;
    maximumYawAcceleration: number;
    powerslideYawMultiplier: number;
    uprightStrength: number;
    uprightDamping: number;
  };

  carWorld: {
    friction: number;
    restitution: number;
  };

  ballWorld: {
    friction: number;
    restNormalSpeed: number;
    rollingDrag: number;
  };

  jump: {
    secondJumpWindow: number;
    resetNormalThreshold: number;
  };

  dodge: {
    inputDeadzone: number;
    linearImpulse: number;
    activeDuration: number;
    recoveryDuration: number;
    angularAcceleration: number;
    flipCancelPitchDeceleration: number;
    explicitBallHitBonus: number;
  };

  aerial: {
    rollDamping: number;
    pitchDamping: number;
    yawDamping: number;
    dampingInputReduction: number;
  };

  carBall: {
    baseFriction: number;
    extraHitBaseScale: number;
    extraHitForwardScale: number;
    extraHitMinimumPunch: number;
    extraHitMaximumDeltaSpeed: number;
    recontactSeparation: number;
  };
}
```

Initial preset:

```ts
export const DEFAULT_PHYSICS_PARAMETERS: PhysicsParameters = {
  suspension: {
    restLength: 0.17,
    maximumLength: 0.22,
    probeRadius: 0.03,
    springStrength: 70,
    dampingStrength: 10,
    maximumAcceleration: 25,
    requiredGroundContacts: 3
  },

  grip: {
    normalRate: 12,
    normalMaxAcceleration: 60,
    powerslideRate: 2,
    powerslideMaxAcceleration: 18,
    blendTime: 0.075
  },

  steering: {
    response: 12,
    maximumYawAcceleration: 25,
    powerslideYawMultiplier: 1.35,
    uprightStrength: 35,
    uprightDamping: 8
  },

  carWorld: {
    friction: 0.1,
    restitution: 0.05
  },

  ballWorld: {
    friction: 0.285,
    restNormalSpeed: 0.20,
    rollingDrag: 0
  },

  jump: {
    secondJumpWindow: 1.25,
    resetNormalThreshold: 0.65
  },

  dodge: {
    inputDeadzone: 0.5,
    linearImpulse: 5.0,
    activeDuration: 0.65,
    recoveryDuration: 0.15,
    angularAcceleration: 35,
    flipCancelPitchDeceleration: 45,
    explicitBallHitBonus: 1.8
  },

  aerial: {
    rollDamping: 3,
    pitchDamping: 2,
    yawDamping: 2,
    dampingInputReduction: 0.65
  },

  carBall: {
    baseFriction: 0.3,
    extraHitBaseScale: 0.55,
    extraHitForwardScale: 0.35,
    extraHitMinimumPunch: 1.2,
    extraHitMaximumDeltaSpeed: 25,
    recontactSeparation: 0.02
  }
};
```

The values above are starting points, not final truth.

---

# 8. Rapier World Initialisation

## 7.1 Initialisation

```ts
import RAPIER from "@dimforge/rapier3d-compat";

await RAPIER.init();

const gravity = {
  x: 0,
  y: -RL_CONSTANTS.gravity,
  z: 0
};

const world = new RAPIER.World(gravity);
world.timestep = RL_CONSTANTS.physicsDt;
world.integrationParameters.maxCcdSubsteps = 2;
```

If the installed Rapier API differs slightly, consult the installed package types rather than inventing method names.

## 7.2 Event queue

Create an event queue if using collision events:

```ts
const eventQueue = new RAPIER.EventQueue(true);
```

Drain it after every step.

## 7.3 Sleeping

Disable sleeping for the car and ball during development and automated tests.

This avoids hidden state changes that make calibration confusing.

Sleeping may be reconsidered later for static or decorative objects, but it provides little benefit in a one-car/one-ball game.

## 7.4 CCD

Enable CCD on:

- Car
- Ball

Do not enable CCD on fixed arena bodies.

Use additional CCD substeps if high-speed tests show tunnelling.

---

# 9. Collision Layers

Create named bitmasks:

```ts
export const CollisionLayer = {
  ARENA: 1 << 0,
  CAR: 1 << 1,
  BALL: 1 << 2,
  SENSOR: 1 << 3,
  BOOST_PAD_SENSOR: 1 << 4
} as const;
```

Required interactions:

```text
CAR <-> ARENA
CAR <-> CAR
CAR <-> BALL
BALL <-> ARENA
SENSOR queries CAR, BALL and optionally ARENA
BOOST_PAD_SENSOR overlaps CAR only
```

Collision layers describe entity categories, not teams. Both 1v1 cars use the same `CAR` layer.

Associate each collider with stable metadata:

```ts
export interface PhysicsColliderUserData {
  entityId: PhysicsEntityId;
  entityType: "car" | "ball" | "arena" | "sensor" | "boost-pad";
  surfaceTag?: string;
  sensorTag?: string;
}
```

Keep collision filtering and solver filtering conceptually separate.

For the first implementation:

- Let Rapier solve car-arena.
- Let Rapier solve ball-arena.
- Let Rapier solve car-car.
- Let Rapier solve car-ball.
- Add only the onset-based extra car-to-ball impulse.
- Track each unordered pair independently.

For the higher-fidelity implementation:

- Continue generating car-ball contacts.
- Disable Rapier's solver impulse specifically for car-ball.
- Apply the complete custom car-ball impulse manually.
- Continue allowing Rapier to solve car-car unless tests prove a custom response is required.

Do not disable all `CAR <-> BALL` solver interactions globally and then resolve only one car. The custom path must enumerate every active car-ball contact manifold in the current tick.

---

# 10. Multi-Car Entity Architecture

## 10.1 Car registry

Never store one global `car`.

```ts
export class CarRegistry {
  private readonly cars = new Map<CarId, CarEntity>();

  add(car: CarEntity): void;
  remove(carId: CarId): void;
  get(carId: CarId): CarEntity;
  tryGet(carId: CarId): CarEntity | undefined;
  getAllStable(): readonly CarEntity[];
}
```

`getAllStable()` must return cars in stable order.

## 10.2 Car entity

```ts
export interface CarEntity {
  readonly id: CarId;
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  readonly controller: CarController;
  readonly runtime: CarRuntimeState;
  readonly inputBuffer: CarInputBuffer;
}
```

Every mutable gameplay value belongs to one car entity:

- Boost
- Previous input
- Grounded state
- Wheel contacts
- Jump state
- Dodge state
- Powerslide blend
- Supersonic state
- Contact cooldowns that are specific to that car

No mutable value may be shared accidentally between the two controllers.

## 10.3 Creation

```ts
physics.spawnCar({
  id: "car-player",
  transform: playerSpawn,
  initialBoost: 33
});

physics.spawnCar({
  id: "car-opponent",
  transform: opponentSpawn,
  initialBoost: 33
});
```

Reject duplicate IDs.

The body and controller configuration are identical unless a future game mode deliberately supplies a different preset.

## 10.4 Removal

Removing a car must:

- Remove its collider and rigid body from Rapier.
- Remove its controller state.
- Remove all pair-contact lifecycle records containing its ID.
- Remove its telemetry buffers.
- Emit no stale events on later ticks.

## 10.5 Per-car controller update

Conceptually:

```ts
for (const car of carRegistry.getAllStable()) {
  const input = car.inputBuffer.readForTick(currentTick);
  car.controller.prePhysicsTick(input, dt, sharedObservation);
}

world.step(eventQueue);

for (const car of carRegistry.getAllStable()) {
  car.controller.postPhysicsTick(dt);
}
```

## 10.6 Pair generation

Generate unordered car pairs:

```ts
for (let i = 0; i < cars.length; i++) {
  for (let j = i + 1; j < cars.length; j++) {
    const carA = cars[i];
    const carB = cars[j];
    processCarPair(carA, carB);
  }
}
```

For 1v1 this produces one pair, but the implementation remains generic.

---

# 11. Car Rigid Body

## 9.1 Octane-style dimensions

Converted dimensions:

```text
Length: 1.1801 m
Width:  0.8420 m
Height: 0.3616 m
```

Rapier cuboid half-extents using local X-right, Y-up, Z-forward:

```ts
export const CAR_HALF_EXTENTS = {
  x: 0.4210,
  y: 0.1808,
  z: 0.59005
};
```

Approximate hitbox-centre offset:

```ts
export const CAR_HITBOX_OFFSET = {
  x: 0,
  y: 0.2075,
  z: -0.1388
};
```

Keep this offset configurable.

## 9.2 Body creation

Conceptual implementation:

```ts
const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
  .setTranslation(spawn.x, spawn.y, spawn.z)
  .setCanSleep(false)
  .setCcdEnabled(true)
  .setLinearDamping(0)
  .setAngularDamping(0);

const body = world.createRigidBody(bodyDesc);

const colliderDesc = RAPIER.ColliderDesc.cuboid(
  CAR_HALF_EXTENTS.x,
  CAR_HALF_EXTENTS.y,
  CAR_HALF_EXTENTS.z
)
  .setTranslation(
    CAR_HITBOX_OFFSET.x,
    CAR_HITBOX_OFFSET.y,
    CAR_HITBOX_OFFSET.z
  )
  .setFriction(parameters.carWorld.friction)
  .setRestitution(parameters.carWorld.restitution)
  .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);

const collider = world.createCollider(colliderDesc, body);
```

## 9.3 Mass

Ensure total body mass is `180`.

Rapier can derive mass from collider density or use explicit mass properties.

Do not accidentally create:

```text
180 body mass + collider-generated mass
```

Verify in a development assertion:

```ts
assertApproximately(body.mass(), 180, 0.001);
```

## 9.4 Inertia

Begin with Rapier's cuboid-derived inertia.

Later, if collision rotation or aerial behaviour requires it:

- Set explicit principal angular inertia.
- Keep inertia tuning isolated from aerial input angular acceleration.
- Record inertia changes in `calibration-log.md`.

## 9.5 Body transform authority

Rapier is authoritative.

Allowed transform writes:

- Initial spawn
- Test reset
- Goal reset
- Explicit developer teleport

Not allowed during normal simulation:

- Copying Three.js mesh position into Rapier
- Calling `setTranslation` every frame
- Calling `setRotation` to implement steering
- Directly rotating the body for aerial input

---

# 12. Ball Rigid Body

## 10.1 Ball dimensions

```ts
const radius = 0.9125;
const mass = 30;
```

## 10.2 Creation

```ts
const body = world.createRigidBody(
  RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(spawn.x, spawn.y, spawn.z)
    .setCanSleep(false)
    .setCcdEnabled(true)
    .setLinearDamping(0)
    .setAngularDamping(0)
);

const collider = world.createCollider(
  RAPIER.ColliderDesc.ball(radius)
    .setRestitution(RL_CONSTANTS.ballWorldRestitution)
    .setFriction(parameters.ballWorld.friction)
    .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
  body
);
```

Ensure total mass equals `30`.

## 10.3 Ball flight

Normal ball flight contains:

- Gravity
- No intentional Magnus force
- No significant custom aerodynamic drag
- Maximum linear speed of `60 m/s`
- Maximum angular speed of `6 rad/s`

Do not curve the ball through air because of spin.

---

# 13. Arena

## 11.1 Initial test arena

Implement a physics-test arena before building a styled stadium.

Required surfaces:

1. Flat floor
2. Straight side wall
3. Smooth floor-to-wall quarter-pipe
4. Back wall
5. Ceiling
6. Simple goal opening later

## 11.2 Collider strategy

Prefer compound primitive colliders where practical:

- Cuboids for floor/walls
- Convex or trimesh curved transitions
- Trimesh only for fixed geometry

Do not use a render mesh automatically as the collider without checking:

- Triangle winding
- Surface normals
- Holes
- Scale
- Duplicate/internal triangles
- Sharp seams

## 11.3 Test surfaces

Expose presets:

```ts
type ArenaPreset =
  | "flat-plane"
  | "flat-wall"
  | "quarter-pipe"
  | "box-arena"
  | "goal-test";
```

Automated tests should use the smallest suitable arena.

---

# 14. Input System

## 13.1 Normalised input

```ts
export interface CarInput {
  throttle: number;   // [-1, 1]
  steer: number;      // [-1, 1]
  pitch: number;      // [-1, 1]
  yaw: number;        // [-1, 1]
  roll: number;       // [-1, 1]

  jump: boolean;
  boost: boolean;
  powerslide: boolean;
}
```

## 13.2 Per-car input buffers

Inputs are keyed by `CarId`.

```ts
export interface CarInputFrame {
  tick: number;
  carId: CarId;
  input: CarInput;
}
```

The physics facade must support:

```ts
setCarInput(carId: CarId, input: Partial<CarInput>): void;
clearCarInput(carId: CarId): void;
clearAllInputs(): void;
```

Each car stores its own previous input for edge detection.

## 13.3 Edge detection

Per car:

```ts
jumpPressed = current.jump && !previous.jump;
jumpReleased = !current.jump && previous.jump;
```

A jump edge on one car must not affect the other car.

## 13.4 Input providers

The runtime game layer may bind providers:

```ts
physics.bindInputProvider("car-player", humanProvider);
physics.bindInputProvider("car-opponent", enemyAiProvider);
```

The future enemy AI document defines how `enemyAiProvider` chooses inputs. This physics document defines only the `CarInputProvider` contract.

## 13.5 Keyboard mapping

Recommended human controls:

```text
W / S     throttle
A / D     steer on ground, yaw in air
Space     jump
Shift     boost
Ctrl      powerslide / normal air roll modifier
Q / E     directional air roll
R         reset controlled car in development mode
T         reset ball in development mode
```

Input mapping is not physics. Keep it outside the physics module.

## 13.6 Test input

Automated physics tests inject `CarInput` directly by `CarId`.

Do not use `page.keyboard.down()` for quantitative acceleration, collision or jump timing tests.

Use real keyboard actions only for:

- Human input-provider integration tests
- Focus tests
- Key rollover tests
- Smoke-level gameplay interaction tests

---

# 15. Per-Car State Machine

Every car owns a separate instance of this state.

```ts
export interface CarRuntimeState {
  grounded: boolean;
  wheelContactCount: number;
  supportNormal: Vec3Data;
  ticksSinceGrounded: number;

  firstJumpUsed: boolean;
  secondJumpAvailable: boolean;
  jumpHoldElapsed: number;
  jumpElapsed: number;
  stickyTicksRemaining: number;

  dodgeState: "none" | "active" | "recovery";
  dodgeElapsed: number;
  dodgeDirection: { x: number; y: number };

  powerslideBlend: number;
  boostAmount: number;
  supersonic: boolean;

  previousInput: CarInput;
}
```

State transitions must be explicit and testable.

Do not infer every gameplay state indirectly from current velocity.

---

# 16. Suspension and Ground Detection

## 14.1 No physical wheels

Use four sphere-cast suspension probes.

Initial local anchors:

```ts
const FRONT_AXLE_Z = -0.38;
const REAR_AXLE_Z = 0.33;
const HALF_TRACK_X = 0.29;
const WHEEL_ANCHOR_Y = -0.10;

const WHEEL_ANCHORS_LOCAL = [
  { x: -HALF_TRACK_X, y: WHEEL_ANCHOR_Y, z: FRONT_AXLE_Z },
  { x:  HALF_TRACK_X, y: WHEEL_ANCHOR_Y, z: FRONT_AXLE_Z },
  { x: -HALF_TRACK_X, y: WHEEL_ANCHOR_Y, z: REAR_AXLE_Z },
  { x:  HALF_TRACK_X, y: WHEEL_ANCHOR_Y, z: REAR_AXLE_Z }
];
```

These are calibration values.

## 14.2 Cast direction

Cast from each world anchor along local `-up`.

```ts
castDirection = carUp.clone().multiplyScalar(-1);
```

Use a sphere cast with radius `0.03 m`.

Ignore the car's own collider.

Detect:

- Arena
- Ball, for flip resets

## 14.3 Suspension force

For each valid surface contact:

```text
compression = restLength - hitDistance
pointVelocity = linearVelocity + angularVelocity × leverArm
compressionVelocity = -dot(pointVelocity, contactNormal)
```

Acceleration:

```text
springAcceleration =
  springStrength * compression
  + dampingStrength * compressionVelocity
```

Clamp:

```text
0 <= springAcceleration <= maximumAcceleration
```

Impulse:

```text
impulse = normal * carMass * springAcceleration * dt
```

Apply at wheel anchor or contact point.

## 14.4 Ground state

Use:

```text
grounded = validWheelContacts >= 3
```

Use all four contacts for jump reset eligibility.

## 14.5 Support normal

Weighted average:

```ts
supportNormal = normalize(
  sum(contactNormal * max(compression, 0.001))
);
```

## 14.6 Suspension debug requirements

Draw:

- Anchor point
- Cast line
- Probe radius
- Hit point
- Contact normal
- Compression amount
- Force vector
- Contact validity colour

Do not tune suspension without this visualisation.

---

# 17. Ground Drive

## 15.1 Forward vector projected onto support plane

```ts
forwardOnSurface = normalize(
  forward - supportNormal * dot(forward, supportNormal)
);
```

Right on surface:

```ts
rightOnSurface = normalize(
  cross(forwardOnSurface, supportNormal)
);
```

Check signs visually.

## 15.2 Forward speed

```ts
forwardSpeed = dot(linearVelocity, forwardOnSurface);
```

## 15.3 Throttle acceleration curve

In metres:

```ts
export function throttleAcceleration(speedAbs: number): number {
  const v = Math.max(0, speedAbs);

  if (v < 14.0) {
    return 16.0 - (16.0 / 14.0) * v;
  }

  if (v < 14.1) {
    return 1.6 - 16.0 * (v - 14.0);
  }

  return 0;
}
```

## 15.4 Drive mode selection

```ts
if (abs(throttle) < epsilon) {
  coast();
} else if (
  abs(forwardSpeed) > brakeSwitchSpeed &&
  sign(throttle) !== sign(forwardSpeed)
) {
  brake();
} else {
  accelerate();
}
```

Initial:

```ts
brakeSwitchSpeed = 0.25;
```

## 15.5 Applying acceleration

Use an impulse:

```ts
deltaVelocity = acceleration * dt;
impulse = direction * body.mass() * deltaVelocity;
body.applyImpulse(rapierVector(impulse), true);
```

Do not manually update position.

## 15.6 Coasting

Move forward velocity toward zero at:

```text
5.25 m/s²
```

Do not remove lateral velocity here; grip handles lateral movement.

## 15.7 Braking

Move forward velocity toward zero at:

```text
35 m/s²
```

Avoid crossing through zero incorrectly in one tick.

## 15.8 No-boost speed limit

Throttle should naturally approach `14.1 m/s`.

Do not clamp the entire car to `14.1 m/s`, because:

- Slopes
- Collisions
- Dodges
- Boost

may produce greater speed.

Only the throttle acceleration curve goes to zero.

---

# 18. Ground Steering

## 16.1 Curvature function converted to metres

The original curvature values are per uu. Multiplying by 100 converts them to per metre.

```ts
export function maxCurvature(speed: number): number {
  const vUu = Math.max(0, Math.min(speed * 100, 2500));

  let curvaturePerUu: number;

  if (vUu < 500) {
    curvaturePerUu = 0.006900 - 5.84e-6 * vUu;
  } else if (vUu < 1000) {
    curvaturePerUu = 0.005610 - 3.26e-6 * vUu;
  } else if (vUu < 1500) {
    curvaturePerUu = 0.004300 - 1.95e-6 * vUu;
  } else if (vUu < 1750) {
    curvaturePerUu = 0.003025 - 1.10e-6 * vUu;
  } else {
    curvaturePerUu = 0.001800 - 4.00e-7 * vUu;
  }

  return Math.max(0, curvaturePerUu * 100);
}
```

## 16.2 Desired yaw rate

```ts
desiredYawRate =
  steer *
  maxCurvature(abs(forwardSpeed)) *
  abs(forwardSpeed) *
  signOrOne(forwardSpeed);
```

## 16.3 Servo

```ts
currentYawRate = dot(angularVelocity, supportNormal);
error = desiredYawRate - currentYawRate;

yawAcceleration = clamp(
  error * steering.response,
  -steering.maximumYawAcceleration,
  steering.maximumYawAcceleration
);
```

Apply torque impulse around `supportNormal`.

## 16.4 Powerslide steering

When powerslide blend is active:

```ts
yawAcceleration *= lerp(
  1,
  powerslideYawMultiplier,
  powerslideBlend
);
```

## 16.5 Upright alignment

Apply a soft orientation servo to align local up with support normal.

```text
alignmentAxis = cross(carUp, supportNormal)
```

Apply:

```text
alignment angular acceleration =
  alignmentAxis * uprightStrength
  - tangentAngularVelocity * uprightDamping
```

Do not snap rotation.

---

# 19. Lateral Grip and Powerslide

## 17.1 Lateral speed

```ts
lateralSpeed = dot(linearVelocity, rightOnSurface);
```

## 17.2 Normal grip

```ts
desiredDeltaLateralVelocity = clamp(
  -lateralSpeed * gripRate * dt,
  -maxGripAcceleration * dt,
  maxGripAcceleration * dt
);
```

Impulse:

```ts
lateralImpulse =
  rightOnSurface *
  body.mass() *
  desiredDeltaLateralVelocity;
```

## 17.3 Powerslide blend

```ts
target = input.powerslide ? 1 : 0;
powerslideBlend = moveToward(
  powerslideBlend,
  target,
  dt / blendTime
);
```

Interpolate grip parameters:

```ts
gripRate = lerp(normalRate, powerslideRate, powerslideBlend);
maxGripAcceleration = lerp(
  normalMaxAcceleration,
  powerslideMaxAcceleration,
  powerslideBlend
);
```

## 17.4 Behavioural goal

Normal grip:

- Car travel direction quickly follows heading.
- Turns feel planted.
- Landing sideways can produce a firm correction.

Powerslide:

- Heading can rotate independently from momentum.
- Car carries speed through tight turns.
- Releasing powerslide causes a controlled catch.
- Sideways landings are less violently corrected.

---

# 20. Boost

## 18.1 Activation

```text
boost active if:
input.boost && boostAmount > 0
```

## 18.2 Consumption

```ts
boostAmount = Math.max(
  0,
  boostAmount - 33.3 * dt
);
```

## 18.3 Acceleration

```ts
boostAcceleration =
  grounded
    ? 9.91666
    : 10.58333;
```

Apply along current local forward.

Boost does not instantly redirect existing velocity.

## 18.4 Car speed cap

After all collision and control impulses:

```ts
velocity = clampMagnitude(velocity, 23.0);
body.setLinvel(velocity, true);
```

Use velocity writing only for final clamping or carefully defined correction, not ordinary movement.

---


# 21. Boost Pad System

Boost pads are mandatory gameplay entities.

The physics module owns boost-pad runtime state because pickup eligibility, simultaneous overlap resolution, boost mutation, and respawn timing must be deterministic and aligned with the 120 Hz physics tick.

The stadium module supplies pad definitions and positions. Rendering and VFX consume pad state and events but do not decide pickup results.

## 21.1 Pad types and constants

```ts
export type BoostPadType = "small" | "full";

export const BOOST_PAD_CONSTANTS = {
  kickoffBoostAmount: 33,
  maximumBoostAmount: 100,

  smallPickupAmount: 12,
  smallRespawnSeconds: 4,

  fullRespawnSeconds: 10
} as const;
```

At 120 Hz:

```text
Small respawn: 480 ticks
Full respawn: 1,200 ticks
```

Behaviour:

- A small pad adds 12 boost, capped at 100.
- A full pad fills the collecting car to 100.
- A car at 100 boost cannot consume either pad.
- A pad is active at the beginning of a match and after every kickoff reset.
- A collected pad becomes inactive immediately for the winning claimant.
- An inactive pad cannot be collected.
- Respawn time advances only while active gameplay simulation advances.
- Pausing freezes pad respawn timers.
- Goal celebration and kickoff reset do not accidentally advance timers.
- Kickoff reset explicitly restores every pad to active.

## 21.2 Definition supplied by stadium

```ts
export interface BoostPadDefinition {
  id: BoostPadId;
  type: BoostPadType;

  position: Vec3Data;
  rotation?: QuaternionData;

  pickupRadius: number;
  pickupHalfHeight: number;

  surfaceTag?: string;
}

export type BoostPadId = string;
```

Recommended sensor sizes:

```ts
const SMALL_PAD_SENSOR = {
  pickupRadius: 0.95,
  pickupHalfHeight: 0.75
};

const FULL_PAD_SENSOR = {
  pickupRadius: 1.35,
  pickupHalfHeight: 0.90
};
```

Use a Rapier sensor collider such as a cylinder or rounded cylinder.

The sensor:

- Is fixed to the arena.
- Generates intersection data.
- Produces no solver impulse.
- Interacts with `CAR`.
- Does not interact with the ball.
- Does not make a car grounded.
- Does not participate in suspension probes.
- Does not block movement.

## 21.3 Runtime state

```ts
export interface BoostPadRuntimeState {
  id: BoostPadId;
  type: BoostPadType;

  active: boolean;

  collectedAtTick: number | null;
  respawnAtTick: number | null;
  respawnTicksRemaining: number;

  lastCollectedByCarId: CarId | null;
}
```

Registry:

```ts
export class BoostPadRegistry {
  add(definition: BoostPadDefinition): void;
  get(id: BoostPadId): BoostPadRuntimeState;
  getDefinition(id: BoostPadId): BoostPadDefinition;
  getAllStable(): readonly BoostPadRuntimeState[];
  resetAllActive(): void;
}
```

Return pads in stable `BoostPadId` order.

## 21.4 Pickup eligibility

A claim is eligible when:

```text
pad.active
AND car.boostAmount < 100 - epsilon
AND car collider overlaps pad sensor
AND match/game-flow has enabled active physics pickups
```

Recommended:

```ts
boostFullEpsilon = 0.001;
```

Do not consume a pad for a full car.

Do not consume a pad from a visual mesh intersection.

## 21.5 Claim collection

After the Rapier world step:

1. Gather all active car-pad overlaps.
2. Group claims by pad ID.
3. Remove ineligible claims.
4. Resolve at most one winning car for each pad.
5. Apply boost to the winner.
6. Mark pad inactive.
7. Set exact respawn tick.
8. Emit collection event.
9. Leave losing cars unchanged.

## 21.6 Simultaneous two-car claims

Two cars may overlap the same pad during one tick.

Resolve fairly and deterministically:

1. Prefer the claim with an earlier time of impact when reliable query data exists.
2. Otherwise compare each car's squared distance to the pad centre using the post-step transform.
3. If distances differ by more than the tie epsilon, nearest car wins.
4. If effectively tied, prefer the car with the greater velocity component toward the pad centre.
5. If still tied, use stable lexical `CarId` only as a final deterministic tie-break.

```ts
export interface BoostPadClaim {
  padId: BoostPadId;
  carId: CarId;

  distanceSquared: number;
  velocityTowardPad: number;
  timeOfImpact?: number;
}
```

The lexical tie-break is not a player advantage in ordinary play; it exists only for an exact unresolved tie.

Add an entity-order-independence test proving that registry insertion order does not alter the result.

## 21.7 Boost application

Small:

```ts
newBoost = Math.min(
  100,
  currentBoost + 12
);
```

Full:

```ts
newBoost = 100;
```

Boost mutation occurs through a public method on the car's boost subsystem:

```ts
car.controller.boost.addFromPad(amountOrFillCommand);
```

Do not expose direct mutable state to stadium, rendering, AI, or UI.

## 21.8 Respawn

On collection:

```ts
respawnTicks =
  type === "small"
    ? 4 * 120
    : 10 * 120;
```

Store an absolute tick where practical:

```ts
respawnAtTick = currentTick + respawnTicks;
```

At the end of each enabled simulation tick:

```ts
if (!pad.active && currentTick >= pad.respawnAtTick) {
  pad.active = true;
  pad.respawnAtTick = null;
  pad.respawnTicksRemaining = 0;
  emit respawn event;
}
```

Absolute ticks avoid accumulated floating-point drift.

## 21.9 Match and kickoff reset

Atomic match reset must support:

```ts
interface PhysicsResetCommand {
  // existing reset fields...
  resetBoostPads: boolean;
  kickoffBoostAmount?: number;
}
```

Default kickoff:

```text
Both cars: 33 boost
All pads: active
```

On a normal kickoff reset after a goal:

- Both cars receive 33 boost.
- Every small and full pad becomes active.
- All pad timers and claim state are cleared.
- Collection and respawn events from the previous play cannot fire afterward.

## 21.10 Events

```ts
export interface BoostPadCollectedEvent {
  type: "boost-pad-collected";
  tick: number;

  padId: BoostPadId;
  padType: BoostPadType;

  carId: CarId;

  boostBefore: number;
  boostAfter: number;
  boostGranted: number;

  respawnAtTick: number;
}

export interface BoostPadRespawnedEvent {
  type: "boost-pad-respawned";
  tick: number;

  padId: BoostPadId;
  padType: BoostPadType;
}
```

Rendering, VFX, audio, UI, AI observation, and analytics may consume these events.

## 21.11 Public observation

```ts
export interface BoostPadObservation {
  id: BoostPadId;
  type: BoostPadType;

  position: Vec3Data;

  active: boolean;
  respawnSecondsRemaining: number;

  pickupAmount: number;
}
```

The physics render/test snapshot includes all pad observations.

The future AI may observe this public state after its configured reaction delay.

## 21.12 Telemetry

Record:

- Active state
- Respawn tick
- Respawn time remaining
- Overlapping cars
- Eligible claims
- Winning claimant
- Boost before/after
- Contested-pickup flag

## 21.13 Required automated tests

### Small pad

Start car at 20 boost.

Collect small pad.

Assert:

```text
boost becomes 32
pad inactive
one collection event
respawn in exactly 480 enabled ticks
```

### Small pad near cap

Start at 95.

Assert:

```text
boost becomes 100
granted amount reported as 5
```

### Full pad

Start at 18.

Assert:

```text
boost becomes 100
respawn in exactly 1,200 enabled ticks
```

### Full car

Start at 100 and overlap.

Assert:

```text
pad remains active
no collection event
```

### Inactive pad

Overlap during cooldown.

Assert no boost change.

### Pause

Collect pad, pause, advance application ticks without physics simulation, resume.

Assert respawn timer did not advance while paused.

### Simultaneous claim

Both cars enter same active pad on the same tick.

Assert:

- One winner only.
- One event only.
- Pad inactive once.
- Registry insertion order does not change result.
- Deterministic tie-break is documented in telemetry.

### Reset

Collect multiple pads, then execute kickoff reset.

Assert all pads active and both cars at 33 boost.

### No ball interaction

Roll ball through active pad.

Assert no pickup and no collision impulse.

# 22. Jumping

## 19.1 First jump

On jump press while eligible:

```text
delta velocity = 2.92 m/s along current car up
```

Impulse:

```ts
jumpImpulse = carUp * carMass * 2.92;
```

State changes:

```ts
firstJumpUsed = true;
secondJumpAvailable = true;
jumpHoldElapsed = 0;
jumpElapsed = 0;
stickyTicksRemaining = 3;
```

## 19.2 Held jump

While the initial jump button remains held:

```text
acceleration = 14.60 m/s²
maximum time = 0.2 s
minimum application = 3 ticks
```

Apply along current car up, not the up direction at jump start.

## 19.3 Sticky force

For exactly three ticks after first jump:

```text
acceleration = 3.25 m/s² along local down
```

## 19.4 Neutral second jump

If second jump is activated without sufficient directional input:

```text
delta velocity = 2.92 m/s along current car up
```

No held-jump force applies.

## 19.5 Second jump window

Begin with:

```text
1.25 seconds
```

Keep configurable.

Use Playwright timing tests to prevent accidental changes.

---

# 23. Airborne Throttle

While airborne:

```ts
if (throttle > 0) {
  acceleration = forward * 0.66667 * throttle;
} else if (throttle < 0) {
  acceleration = forward * 0.33334 * throttle;
}
```

Air throttle and boost can act simultaneously.

---

# 24. Aerial Rotation

## 21.1 Inputs

Map:

- Pitch around local X or local right axis, depending on internal axis convention
- Yaw around local up
- Roll around local forward

The exact component mapping must be fixed through unit tests and debug axes.

## 21.2 Maximum angular accelerations

```text
Yaw:   9.11 rad/s²
Pitch: 12.46 rad/s²
Roll:  38.34 rad/s²
```

## 21.3 Local-space control

1. Read world angular velocity from Rapier.
2. Rotate it into local car space.
3. Apply input acceleration and damping per local axis.
4. Rotate angular acceleration back to world space.
5. Convert it to a torque impulse.
6. Apply it.
7. Clamp total angular speed to `5.5 rad/s`.

## 21.4 Damping

```ts
axisDamping =
  baseDamping *
  (1 - dampingInputReduction * abs(axisInput));
```

Opposite input must stop rotation faster than releasing input.

## 21.5 No direct orientation writes

Do not set the quaternion to implement aerial input.

---

# 25. Dodge and Flip

This is a calibration-heavy subsystem.

## 22.1 Trigger

On second jump press:

```ts
direction = {
  forward: -input.pitch,
  right: input.yaw
};
```

If magnitude is below deadzone, use neutral second jump.

Otherwise begin dodge.

## 22.2 World direction

```ts
dodgeDirectionWorld =
  carForward * direction.forward +
  carRight * direction.right;
```

Normalise.

## 22.3 Initial linear impulse

Start with:

```text
delta velocity = 5.0 m/s
```

Apply in dodge direction with the global speed cap.

## 22.4 Rotation profile

During active dodge:

- Drive local pitch and roll angular velocity toward a dodge profile.
- Restrict ordinary aerial controls.
- Allow opposite pitch input to cancel the pitch component.
- Transition to recovery.
- Restore ordinary aerial controls gradually.

## 22.5 State phases

```text
none
 -> active
 -> recovery
 -> none
```

Initial durations:

```text
active: 0.65 s
recovery: 0.15 s
```

## 22.6 Flip cancellation

Opposite pitch input should strongly reduce dodge pitch without necessarily cancelling roll.

## 22.7 Required dodge scenarios

- Front flip from rest
- Side flip from rest
- Diagonal flip
- Flip at 10 m/s
- Flip near 23 m/s
- Backflip while travelling forward
- Immediate front-flip cancel
- Diagonal speed-flip sequence
- Wall jump into flip
- Ball reset into flip

---

# 26. Ball vs Arena Physics

## 23.1 Phase-one implementation

Use Rapier:

```text
restitution = 0.6
friction = calibration parameter
CCD enabled
```

This should be implemented first.

## 23.2 High-fidelity replacement

Only replace Rapier's response if measured tests demonstrate unacceptable mismatch.

Reverse-engineered response values:

```ts
const BALL_BOUNCE = {
  radius: 0.9125,
  y: 2.0,
  mu: 0.285,
  restitution: 0.6,
  angularCoupling: 0.0003
};
```

Because the original angular-coupling formula is expressed using uu-scale radius, preserve unit consistency carefully when porting. Validate against reference bounce trajectories rather than assuming a direct blind conversion.

## 23.3 Resting behaviour

Prevent low-speed infinite bouncing.

When:

- Ball is in shallow floor contact
- Normal approach speed is below threshold
- Gravity pushes into the floor

Set normal velocity toward zero and preserve tangential rolling.

## 23.4 Ball speed limits

After each physics step:

```text
linear speed <= 60 m/s
angular speed <= 6 rad/s
```

---

# 27. Car vs Ball Collision

All car-ball logic must operate per unordered pair:

```text
(car-player, ball-main)
(car-opponent, ball-main)
```

Never use a single global `carBallTouching` flag.

## 25.1 Phase one: Rapier base plus extra impulse

First playable implementation:

1. Let Rapier solve ordinary contact for every active car-ball pair.
2. Collect all current car-ball contact manifolds for the tick.
3. Detect new contact onset separately for each pair.
4. Calculate a Rocket-League-style extra hit normal per contacting car.
5. Calculate the contribution from that car's actual contact-point velocity.
6. Apply one one-sided extra impulse contribution per eligible pair.
7. Prevent repeated application during one continuous overlap for that pair.
8. Sum or sequentially apply all eligible contributions in stable pair order.
9. Clamp ball speed once after all contributions.
10. Clamp each car independently.

## 25.2 Contact-pair key

```ts
export interface ContactPairState {
  pairKey: string;
  entityA: PhysicsEntityId;
  entityB: PhysicsEntityId;
  touching: boolean;
  lastTouchTick: number;
  lastExtraImpulseTick: number;
  hasSeparatedSinceExtraImpulse: boolean;
  maximumSeparationSinceHit: number;
}
```

Canonical key:

```ts
function makePairKey(
  a: PhysicsEntityId,
  b: PhysicsEntityId
): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}
```

## 25.3 Contact onset tracking

The extra hit impulse for one car-ball pair applies only when:

- That pair begins contact, or
- That pair separated by the configured minimum and re-contacted.

The opponent touching the ball must not reset the first car's contact lifecycle.

## 25.4 Extra hit normal

For each contacting car, using its forward vector `f`:

```ts
let n = ballPosition - carPosition;
n.y *= 0.35;

n = normalize(
  n - f * (0.35 * dot(n, f))
);
```

This is the Y-up conversion of the reverse-engineered normal shaping.

## 25.5 Contact-point velocity

For each car:

```ts
vCarPoint =
  carLinearVelocity +
  cross(carAngularVelocity, contactPoint - carPosition);
```

This is essential. The rotating nose of a flipping car should produce a stronger hit.

## 25.6 Provisional extra delta speed

For one car-ball pair:

```ts
relativeClosing =
  max(0, dot(vCarPoint - ballVelocityAtEvaluation, extraNormal));

forwardContribution =
  max(0, dot(carLinearVelocity, extraNormal));

extraDeltaSpeed =
  extraHitBaseScale * relativeClosing
  + extraHitForwardScale * forwardContribution;

if (relativeClosing > 0.5) {
  extraDeltaSpeed += extraHitMinimumPunch;
}

if (car.dodgeState === "active") {
  extraDeltaSpeed += explicitDodgeBonus;
}

extraDeltaSpeed = clamp(
  extraDeltaSpeed,
  0,
  extraHitMaximumDeltaSpeed
);
```

Contribution:

```ts
deltaVelocityContribution =
  extraNormal * extraDeltaSpeed;
```

This curve is provisional and must be calibrated.

## 25.7 Multiple cars hitting the ball in one tick

This case is mandatory.

Examples:

- Head-on 50/50
- Both cars striking from adjacent angles
- One car striking while the other is already touching
- Two flip hitboxes contacting within one 120 Hz tick
- Ball pinched between both cars
- Ball pinched between a car and arena surface

Required algorithm for phase one:

```text
1. Let Rapier complete its base solver step.
2. Gather all newly eligible car-ball extra-hit contributions.
3. Sort contributions by stable CarId.
4. Evaluate each contribution from the same post-Rapier/pre-extra snapshot
   where practical.
5. Sum the contribution vectors.
6. Apply the combined extra velocity to the ball once.
7. Clamp ball speed once.
8. Mark each contributing pair's lifecycle independently.
```

Preferred implementation:

```ts
const baseBallVelocity = readBallVelocity();

const contributions = eligibleContacts
  .sort(byStableCarId)
  .map(contact =>
    calculateExtraBallDeltaVelocity(
      contact,
      baseBallVelocity
    )
  );

const combinedDelta = sum(contributions);

setBallVelocity(
  clampMagnitude(baseBallVelocity + combinedDelta, 60)
);
```

Using one shared `baseBallVelocity` prevents the first processed car from artificially weakening or strengthening the second contribution solely because of loop order.

If the final higher-fidelity solver requires sequential impulses, ordering must still be stable and covered by an entity-order-independence regression.

## 25.8 Opposing simultaneous hits

A symmetrical head-on hit should approximately cancel lateral contribution and primarily produce the physically expected remaining direction.

Do not enforce artificial cancellation. It should emerge from vector contributions and base contact response.

## 25.9 Pinches

A ball compressed between two cars or between a car and the arena can gain substantial speed.

Requirements:

- Never exceed `60 m/s`.
- Never apply repeated onset bonuses every overlap tick.
- Never produce NaN from near-zero normals.
- Preserve a clear diagnostic event indicating a multi-contact or pinch tick.
- Allow strong results, but tune extreme energy through the extra-hit caps and base solver settings.

## 25.10 Phase two: custom full response

After phase one is stable:

1. Disable Rapier solver impulses for all car-ball contacts only.
2. Keep all contact manifolds active.
3. Gather every car-ball manifold in the tick.
4. Construct one contact constraint per manifold/contact point.
5. Solve the shared multi-body system iteratively rather than pretending each car-ball contact is isolated.
6. Apply equal-and-opposite base impulses to the relevant car and ball.
7. Apply each eligible authored one-sided extra contribution.
8. Correct penetration without teleporting the ball through the other car.
9. Compare against phase one using multi-car scenarios.

For the custom shared solver, use sequential impulses over all active constraints for several iterations:

```text
for iteration in 0..<solverIterations:
  for constraint in stableConstraintOrder:
    solve constraint incrementally
```

This allows two cars to affect one ball in the same solve.

Do not implement this phase until:

- Single-car custom response tests pass.
- Simultaneous-contact tests exist.
- Pair ordering is stable.
- Phase-one behaviour is already playable.

---

# 28. Car vs Car Collision

Car-car collision support is mandatory for 1v1.

## 26.1 Initial strategy

Use Rapier's normal rigid-body collision solver for car-car contacts.

Both cars use:

- Dynamic rigid bodies
- The same Octane-style OBB
- CCD
- Low restitution
- Calibrated friction
- Independent controller state

Do not add a custom bump impulse in the first implementation.

## 26.2 Collision response goals

Car-car contacts must support:

- Head-on collisions
- Rear bumps
- Side impacts
- Glancing impacts
- One grounded and one airborne car
- Both airborne
- One car landing on another
- Cars contesting the ball
- Brief resting contact without explosive jitter

Expected behaviour:

- Off-centre impacts create angular velocity.
- Faster cars transfer more momentum.
- A car can disrupt another car's line.
- Contacts remain readable rather than sticky or explosive.
- No collision outcome depends on which car is labelled player or opponent.

## 26.3 Material settings

Start with:

```ts
carCarFriction = 0.3;
carCarRestitution = 0.05;
```

Keep these separate from car-arena material parameters.

If one collider material must serve multiple pair types, use Rapier contact hooks or pair-specific solver configuration.

## 26.4 Controller interaction during contact

The control systems continue to apply while cars touch.

However:

- Ground grip must be based on wheel/arena support, not the other car's side.
- A car collider contact alone must not mark the car grounded.
- The other car must not become a valid suspension surface.
- Car-car contact must not reset jumps or dodges.
- A car may physically stand briefly on another car, but this does not grant a gameplay flip reset unless deliberately added by a later game-rules change.

Suspension probes should ignore `CAR` colliders by default.

## 26.5 Pair lifecycle

Track contact start/end per unordered car pair.

Emit:

```ts
interface CarCarContactStartedEvent {
  type: "car-car-contact-started";
  tick: number;
  carA: CarId;
  carB: CarId;
  contactPoints: readonly Vec3Data[];
  normalFromAToB: Vec3Data;
  relativeSpeed: number;
}

interface CarCarContactEndedEvent {
  type: "car-car-contact-ended";
  tick: number;
  carA: CarId;
  carB: CarId;
}
```

Future audio and effects modules may consume these events.

## 26.6 Optional bump classification

Physics may provide descriptive metrics without deciding gameplay outcomes:

```ts
interface CarCarImpactMetrics {
  normalRelativeSpeed: number;
  tangentialRelativeSpeed: number;
  impulseMagnitude: number;
  contactOffsetA: Vec3Data;
  contactOffsetB: Vec3Data;
}
```

Do not implement demolitions in this module version.

## 26.7 Required tests

- Equal-speed head-on impact
- Stationary target rear-ended by moving car
- Glancing side impact
- Airborne collision
- One car landing on another
- Sustained side-by-side contact
- Cars spawned in reversed registry order
- No jump reset from car contact
- No suspension support from car contact
- No NaN during 100 repeated collisions

---

# 29. Physics Tick Order

Use this order:

```text
1. Read or sample one input for every car by stable CarId.
2. Calculate per-car input edges.
3. Cache previous transforms for every car and the ball.
4. Query suspension probes for every car.
5. Determine provisional grounded state independently per car.
6. Process first jump, second jump and dodge triggers per car.
7. Apply world gravity through Rapier.
8. Apply sticky force per eligible car.
9. Apply first-jump hold force per eligible car.
10. Apply ground throttle/brake/coast or airborne throttle per car.
11. Apply boost per car.
12. Apply ground steering per car.
13. Apply lateral or powerslide grip per car.
14. Apply upright/support alignment per car.
15. Apply aerial rotation controls per car.
16. Apply active dodge rotation per car.
17. Step Rapier exactly once for the whole shared world.
18. Drain and canonicalise all collision and sensor events.
19. Update car-arena, ball-arena, car-car and car-ball pair lifecycles.
20. Gather and resolve all active car-to-boost-pad claims per pad.
21. Apply winning pad pickups, deactivate collected pads, and emit events.
22. Gather every eligible car-ball extra-hit contribution.
23. Resolve simultaneous car-ball contributions in stable order or as one sum.
24. Apply the resulting ball velocity change.
25. Clamp every car independently.
26. Clamp the ball once after all contact contributions.
27. Re-query final wheel/reset contacts where required.
28. Process jump/flip resets independently per car.
29. Advance all per-car timers and all inactive boost-pad respawn timers.
30. Reactivate pads whose exact respawn tick has arrived and emit events.
31. Store previous input independently per car.
32. Record one world telemetry frame containing all cars and boost pads.
```

The Rapier world is stepped once per tick, not once per car.

Do not:

- Step the world inside a car loop.
- Clamp the ball after the first car and before evaluating the second without a deliberate shared-solver design.
- Reuse one car's scratch state for another car without fully overwriting it.
- Let collection iteration order change physical outcomes.

---

# 30. Browser Physics Test API

This API is mandatory.

Expose it only in development and test builds:

```ts
declare global {
  interface Window {
    __PHYSICS_TEST__?: BrowserPhysicsTestApi;
  }
}
```

## 28.1 Required API

```ts
export interface BrowserPhysicsTestApi {
  ready(): boolean;

  pauseRuntime(): void;
  resumeRuntime(): void;

  resetWorld(options?: ResetWorldOptions): void;

  setArenaPreset(preset: ArenaPreset): void;
  setPhysicsParameters(
    partial: DeepPartial<PhysicsParameters>
  ): void;
  getPhysicsParameters(): PhysicsParameters;

  spawnCar(options: SpawnCarOptions): CarId;
  removeCar(carId: CarId): void;
  getCarIds(): CarId[];

  setCarState(
    carId: CarId,
    state: Partial<CarSerializableState>
  ): void;

  getCarState(carId: CarId): CarSerializableState;
  getAllCarStates(): CarSerializableState[];

  getBoostPadStates(): BoostPadObservation[];
  setBoostPadState(
    padId: BoostPadId,
    state: Partial<BoostPadRuntimeState>
  ): void;
  collectBoostPadForCar(
    padId: BoostPadId,
    carId: CarId
  ): void;

  setBallState(state: Partial<BallSerializableState>): void;
  getBallState(): BallSerializableState;
  getWorldState(): WorldSerializableState;

  setCarInput(
    carId: CarId,
    input: Partial<CarInput>
  ): void;

  clearCarInput(carId: CarId): void;
  clearAllInputs(): void;

  stepTicks(count: number): void;
  stepSeconds(seconds: number): void;

  runInputSequence(
    sequencesByCar: Record<CarId, InputSequenceSegment[]>
  ): ScenarioResult;

  runScenario(
    id: PhysicsScenarioId,
    overrides?: ScenarioOverrides
  ): ScenarioResult;

  startTelemetry(options?: TelemetryOptions): void;
  stopTelemetry(): PhysicsTelemetryFrame[];
  clearTelemetry(): void;

  getPhysicsEvents(): PhysicsEventRecord[];
  clearPhysicsEvents(): void;

  setDebugMode(mode: DebugMode): void;
  setCameraPreset(preset: CameraPreset): void;
  setFocusedCar(carId: CarId | null): void;

  getDiagnostics(): PhysicsDiagnostics;
}
```

Optional convenience methods may target `car-player`, but tests for core physics must use explicit IDs.

## 28.2 Serializable car state

Never return Three.js or Rapier class instances through the API.

Return plain JSON:

```ts
interface CarSerializableState {
  id: CarId;

  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number; w: number };
  linearVelocity: { x: number; y: number; z: number };
  angularVelocity: { x: number; y: number; z: number };

  speed: number;
  forwardSpeed: number;
  grounded: boolean;
  wheelContactCount: number;
  supportNormal: { x: number; y: number; z: number };

  boostAmount: number;
  firstJumpUsed: boolean;
  secondJumpAvailable: boolean;
  dodgeState: string;
}
```

## 28.3 World state

```ts
interface WorldSerializableState {
  tick: number;
  simulationTime: number;
  cars: CarSerializableState[];
  ball: BallSerializableState;
  boostPads: BoostPadObservation[];
}
```

Cars must be serialised in stable `CarId` order.

## 28.4 Input sequences

```ts
interface InputSequenceSegment {
  ticks: number;
  input: Partial<CarInput>;
}
```

Example 1v1 sequence:

```ts
{
  "car-player": [
    { ticks: 120, input: { throttle: 1 } },
    { ticks: 30, input: { throttle: 1, steer: 0.4 } }
  ],
  "car-opponent": [
    { ticks: 80, input: { throttle: 1, boost: true } },
    { ticks: 1, input: { throttle: 1, jump: true } },
    { ticks: 69, input: { throttle: 1 } }
  ]
}
```

The scenario runner advances all car timelines concurrently.

If one sequence ends early, that car receives neutral input unless the scenario explicitly requests hold-last-input semantics.

## 28.5 Scenario result

```ts
interface ScenarioResult {
  scenarioId: string;
  ticks: number;
  finalState: WorldSerializableState;
  telemetry: PhysicsTelemetryFrame[];
  events: PhysicsEventRecord[];
  metrics: Record<string, number>;
}
```

## 28.6 Test-only entity ordering

Expose a reset option that creates the same two cars in different registry insertion orders.

This supports entity-order-independence tests:

```ts
resetWorld({
  carCreationOrder: [
    "car-opponent",
    "car-player"
  ]
});
```

The resulting trajectories should remain equivalent within tolerance.

---

# 31. Telemetry

## 29.1 Record per tick

```ts
interface PhysicsTelemetryFrame {
  tick: number;
  simulationTime: number;

  cars: Array<{
    id: CarId;
    input: CarInput;

    position: Vec3Data;
    rotation: QuaternionData;
    velocity: Vec3Data;
    angularVelocity: Vec3Data;

    speed: number;
    forwardSpeed: number;
    lateralSpeed: number;

    grounded: boolean;
    wheelContactCount: number;
    supportNormal: Vec3Data;

    boostAmount: number;
    powerslideBlend: number;
    dodgeState: string;
  }>;

  ball: {
    position: Vec3Data;
    velocity: Vec3Data;
    angularVelocity: Vec3Data;
    speed: number;
  };

  contacts: {
    carArenaByCar: Record<CarId, number>;
    ballArena: number;
    activeCarCarPairs: string[];
    activeCarBallPairs: string[];
    activeCarBoostPadPairs: string[];
  };

  boostPads: BoostPadObservation[];

  collisionContributions?: {
    carCar: CarCarImpulseTelemetry[];
    carBall: CarBallImpulseTelemetry[];
    combinedExtraBallDeltaVelocity?: Vec3Data;
  };
}
```

Serialise `cars`, pair keys and collision contributions in stable order.

## 29.2 Optional detailed channels

Enable only when needed:

- Suspension compression per wheel per car
- Suspension force per wheel per car
- Grip impulse per car
- Steering torque impulse per car
- Jump impulse per car
- Boost impulse per car
- Car-car impulses per pair
- Car-ball base impulse per pair
- Car-ball extra impulse per pair
- Combined multi-car ball contribution
- Collision normals
- Penetration depth
- CCD activation diagnostics

## 29.3 Export

Development UI must support:

- Copy JSON
- Download JSON
- Download CSV
- Filter telemetry by car ID
- Compare both cars on the same timeline
- Save current parameter preset
- Load parameter preset

---

# 32. Playwright Configuration

Use Chromium as the primary physics regression browser.

`playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,

  timeout: 30_000,
  expect: {
    timeout: 5_000,
    toHaveScreenshot: {
      maxDiffPixels: 150
    }
  },

  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,

  reporter: [
    ["list"],
    ["html", { open: "never" }]
  ],

  use: {
    baseURL: "http://127.0.0.1:4173",
    browserName: "chromium",
    viewport: { width: 1280, height: 720 },

    trace: "on-first-retry",
    video: "retain-on-failure",
    screenshot: "only-on-failure"
  },

  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000
  },

  projects: [
    {
      name: "chromium-physics",
      use: {
        ...devices["Desktop Chrome"]
      }
    }
  ]
});
```

Physics tests are serial by default so they do not compete for GPU/CPU resources and produce noisy timings.

The physics simulation itself is not judged by wall-clock duration.

---

# 33. Playwright Test Helper

```ts
import { expect, Page } from "@playwright/test";

export async function openPhysicsLab(page: Page): Promise<void> {
  await page.goto("/?physicsTest=1");

  await page.waitForFunction(() => {
    return window.__PHYSICS_TEST__?.ready() === true;
  });

  await page.evaluate(() => {
    window.__PHYSICS_TEST__!.pauseRuntime();
    window.__PHYSICS_TEST__!.resetWorld();
  });
}

export async function runScenario<T>(
  page: Page,
  scenarioId: string,
  overrides?: unknown
): Promise<T> {
  return page.evaluate(
    ({ scenarioId, overrides }) => {
      return window.__PHYSICS_TEST__!.runScenario(
        scenarioId as never,
        overrides as never
      );
    },
    { scenarioId, overrides }
  ) as Promise<T>;
}
```

---

# 34. Test Types

The project needs five complementary test categories.

## 30.1 Mathematical benchmark tests

Purpose:

- Verify measured constants.
- Detect accidental changes.
- Test isolated subsystems.

Examples:

- Gravity
- Jump impulse
- Boost acceleration
- Coasting
- Braking
- Speed caps

These tests should have tight numeric tolerances.

## 30.2 Trajectory regression tests

Purpose:

- Preserve complex combined behaviour.
- Catch small changes that accumulate over time.
- Compare full state sequences.

Examples:

- Full-throttle turn
- Powerslide U-turn
- Jump into aerial
- Front flip
- Ball bounce sequence
- Car striking ball
- Equal-speed head-on car collision
- Contested 50/50 ball contact
- Two cars contacting the ball during one tick

Store a reduced telemetry snapshot:

```json
[
  {
    "tick": 0,
    "carPosition": [0, 0.5, 0],
    "carVelocity": [0, 0, 0]
  },
  {
    "tick": 30,
    "carPosition": [0, 0.5, -0.6],
    "carVelocity": [0, 0, -4.1]
  }
]
```

Sample every 5–10 ticks to keep files manageable.

Use `toMatchSnapshot()` for JSON serialised with controlled decimal precision.

## 30.3 Invariant tests

Examples:

- No NaN values.
- Quaternion remains normalised.
- Car speed never exceeds 23 m/s.
- Ball speed never exceeds 60 m/s.
- Ball spin never exceeds 6 rad/s.
- Boost never becomes negative.
- Wheel contact count remains 0–4.
- Extra hit impulse applies once per car-ball pair contact onset.
- One car's jump, boost and dodge state cannot mutate the other car.
- Car-car contact never grants a jump reset.
- Car registry insertion order does not materially change the outcome.
- World reset produces the same initial state.

Run invariants in every long scenario.

## 30.4 Visual regression tests

Purpose:

- Verify debug geometry.
- Verify hitbox alignment.
- Verify wheel probes.
- Verify trajectory display.
- Detect rendering or coordinate-system mistakes.

Use a fixed:

- Camera
- Viewport
- Device scale
- Lighting
- Arena
- Simulation state
- Debug overlay

Do not use screenshots as the main numeric physics test.

Browser rendering can vary across operating systems, so generate and compare baselines in a consistent environment.

## 30.5 Human playtests

Automated tests cannot fully measure fun.

Use structured playtests after mechanical gates pass.

Record:

- Responsiveness
- Predictability
- Turning quality
- Powerslide quality
- Jump readability
- Aerial control
- Recovery quality
- Ball-hit satisfaction
- Car-car bump readability
- Contested 50/50 quality
- Dribble controllability
- Unwanted jitter
- Unfair or surprising outcomes

---

# 35. Exact Playwright Benchmark Tests

## 31.1 Gravity

```ts
test("ball follows 6.5 m/s² gravity", async ({ page }) => {
  await openPhysicsLab(page);

  const result = await page.evaluate(() => {
    const api = window.__PHYSICS_TEST__!;

    api.setArenaPreset("flat-plane");
    api.setBallState({
      position: { x: 0, y: 10, z: 0 },
      linearVelocity: { x: 0, y: 0, z: 0 }
    });

    api.startTelemetry();
    api.stepTicks(120);

    return {
      state: api.getBallState(),
      telemetry: api.stopTelemetry()
    };
  });

  expect(result.state.linearVelocity.y).toBeCloseTo(-6.5, 2);
  expect(result.state.position.y).toBeCloseTo(6.75, 1);
});
```

Place the ball high enough that it does not reach the floor.

## 31.2 Air boost

Disable gravity only through a dedicated test-world option, not by changing production constants.

```ts
test("air boost adds 10.58333 m/s in one second", async ({ page }) => {
  await openPhysicsLab(page);

  const state = await page.evaluate(() => {
    const api = window.__PHYSICS_TEST__!;

    api.resetWorld({
      gravity: { x: 0, y: 0, z: 0 },
      carAirborne: true
    });

    api.setInput({ boost: true });
    api.stepTicks(120);

    return api.getCarState();
  });

  expect(state.speed).toBeCloseTo(10.58333, 2);
});
```

## 31.3 Jump tap and hold

Test separately:

- Initial impulse
- Minimum three hold ticks
- Full 0.2 second hold
- Release before maximum
- No hold on second jump

## 31.4 Braking

```text
Initial forward speed: 10 m/s
Expected ideal braking time: 10 / 35 = 0.2857 s
Expected ticks: approximately 34–35
```

Assert:

- Forward speed crosses below a small threshold in expected tick range.
- Reverse acceleration does not begin too early.

## 31.5 Coasting

```text
Initial speed: 10 m/s
Expected ideal stop time: 10 / 5.25 = 1.9048 s
Expected ticks: approximately 229
```

## 31.6 No-boost driving

Run full throttle for sufficient time.

Expected:

```text
speed approaches approximately 14.1 m/s
```

It should not oscillate significantly around the target.

## 31.7 Full turn

Run:

```text
throttle = 1
steer = 1
duration = 3.1 seconds
```

Calculate heading delta from forward vectors.

Expected:

```text
approximately 360 degrees
```

Use a broad tolerance initially, then tighten during calibration.

## 31.8 Speed caps

Apply extreme impulses and assert vector magnitudes after the limiter.

## 31.9 Ball bounce

Drop with known impact speed and inspect immediate post-contact velocity.

For restitution 0.6:

```text
1000 uu/s becomes approximately 600 uu/s
10 m/s becomes approximately 6 m/s
```

## 31.10 Contact onset

Keep the car overlapping/pushing into the ball for multiple ticks.

Assert:

```text
extra hit impulse count == 1
```

Separate and hit again.

Assert:

```text
extra hit impulse count == 2
```

---

## 33.11 Independent car input and state

Create both cars.

Apply full throttle to `car-player` and neutral input to `car-opponent`.

Assert:

- Player car accelerates.
- Opponent remains within idle drift tolerance.
- Opponent boost remains unchanged.
- Opponent jump state remains unused.

Repeat with IDs swapped.

## 33.12 Head-on car collision

Initialise both cars with equal mass and equal/opposite velocity.

After impact, assert:

- Total linear momentum is approximately conserved subject to solver tolerance.
- Neither car exceeds the speed cap.
- Outcome is approximately symmetric.
- Reversing entity creation order does not materially change the result.

## 33.13 Glancing car collision

Offset the cars laterally and collide.

Assert:

- Both cars gain angular velocity of appropriate opposite tendency.
- No NaN.
- No unrealistic sticking for more than the configured tolerance.

## 33.14 Car contact does not reset jump

Place one airborne car wheel-side-down on the other car.

Assert:

- Car-car contact occurs.
- Wheel-arena support count remains zero.
- `secondJumpAvailable` is not restored by the other car.

## 33.15 Simultaneous two-car ball contact

Arrange a symmetric 50/50 so both cars contact the ball in the same tick.

Assert:

- Two distinct active car-ball pair keys exist.
- Both pair contributions are recorded.
- Combined contribution is applied once.
- The ball remains below `60 m/s`.
- Reversing car creation order produces an equivalent ball trajectory.

## 33.16 Three-body pile-up stability

Place the ball between two approaching cars.

Run at least 240 ticks.

Assert every tick:

- No NaN.
- No invalid quaternion.
- No speed-limit violation.
- No repeated extra impulse for a continuously touching pair.
- Pair lifecycle events remain balanced over separation/re-contact cycles.

---

# 36. Scenario Catalogue

Implement scenarios by ID.

```ts
type PhysicsScenarioId =
  | "car-throttle-straight"
  | "car-brake"
  | "car-coast"
  | "car-full-turn"
  | "car-powerslide-turn"
  | "car-jump-tap"
  | "car-jump-hold"
  | "car-double-jump"
  | "car-front-flip"
  | "car-diagonal-flip"
  | "car-flip-cancel"
  | "car-basic-aerial"
  | "ball-drop"
  | "ball-wall-bounce"
  | "ball-rolling"
  | "car-ball-straight-hit"
  | "car-ball-corner-hit"
  | "car-ball-flip-hit"
  | "car-ball-dribble-touch"
  | "car-car-head-on"
  | "car-car-rear-bump"
  | "car-car-glancing"
  | "car-car-airborne"
  | "two-car-ball-50-50"
  | "two-car-ball-adjacent-hit"
  | "two-car-ball-pinch"
  | "boost-pad-small-pickup"
  | "boost-pad-full-pickup"
  | "boost-pad-contested"
  | "boost-pad-respawn"
  | "kickoff-contest"
  | "wall-drive"
  | "landing-recovery";
```

Every scenario defines:

```ts
interface PhysicsScenarioDefinition {
  id: PhysicsScenarioId;
  arena: ArenaPreset;

  initialCars: readonly Array<{
    id: CarId;
    state: CarSerializableState;
  }>;

  initialBall: BallSerializableState;

  inputSequencesByCar:
    Record<CarId, InputSequenceSegment[]>;

  durationTicks: number;
  telemetrySampleEveryTicks: number;
  metrics: ScenarioMetricDefinition[];
}
```

Scenarios that need only one car may spawn one. The production 1v1 preset spawns two.

The scenario runner must not assume that `initialCars[0]` is the human player.

---

# 37. Trajectory Regression

## 33.1 Golden trajectories

Once a subsystem is accepted, save a golden trajectory.

Round values before snapshotting:

```ts
function roundNumber(value: number): number {
  return Math.round(value * 10000) / 10000;
}
```

Do not snapshot raw floating-point noise.

## 33.2 Comparison metrics

For each sampled tick calculate:

- Position error
- Velocity error
- Orientation angular error
- Angular velocity error
- Speed error
- Event timing difference

Aggregate:

```text
position RMSE
velocity RMSE
orientation mean error
orientation maximum error
event tick error
final-state error
```

## 33.3 Updating golden files

Never update snapshots automatically just because tests fail.

Before updating:

1. Identify the parameter or code change.
2. Review telemetry difference.
3. Run manual playtest.
4. Confirm the new result is intended.
5. Document the change.
6. Update only relevant snapshots.

---

# 38. Visual Physics Lab

Create a `/physics-lab` or `?physicsLab=1` mode.

Required controls:

- Pause
- Resume
- Step one tick
- Step ten ticks
- Reset scenario
- Select scenario
- Slow motion
- Physics speed
- Debug draw toggle
- Telemetry recording
- Parameter panel
- Save preset
- Load preset
- Show ghost trajectory
- Show current trajectory
- Show collision impulses
- Show wheel probes
- Show car hitbox
- Show ball hitbox
- Show local axes
- Show support plane
- Show speed graph
- Show angular-speed graph

## 34.1 Fixed camera presets

- Side orthographic-like view
- Top view
- Chase view
- Contact close-up
- Wheel/suspension close-up
- Ball trajectory view

These enable repeatable screenshots and diagnosis.

---

# 39. Ghost and Difference Visualisation

For calibration, render:

- Current simulation trajectory
- Golden trajectory
- Tick-matched ghost car
- Tick-matched ghost ball
- Error vector from current to reference
- Contact normals
- Velocity vectors

Colour selection may be chosen by the implementation, but keep it consistent.

At a chosen tick:

```text
current car
reference ghost car
position difference line
orientation axes for both
```

This is often more informative than reading raw numbers.

---

# 40. Development and Calibration Workflow

## 36.1 Never tune everything at once

Use this dependency order:

```text
Fixed stepping
-> gravity and integration
-> free ball
-> car body
-> throttle/brake/coast
-> boost
-> jump
-> ground steering
-> suspension
-> grip
-> powerslide
-> aerial rotation
-> dodge
-> ball-world response
-> car-ball response
-> wall behaviour
-> combined gameplay
```

## 36.2 Parameter groups

Only tune one group at a time:

- Suspension group
- Grip group
- Steering group
- Aerial group
- Dodge group
- Ball-world group
- Car-ball group

## 36.3 Calibration loop

For each group:

1. Select one or more representative scenarios.
2. Run baseline tests.
3. Record current metrics.
4. State a concrete hypothesis.
5. Change no more than 1–3 related parameters.
6. Rerun the focused test.
7. Rerun the regression suite.
8. Inspect trajectory overlay.
9. Playtest the mechanic.
10. Accept, revert or refine.
11. Record the result in `calibration-log.md`.

## 36.4 Calibration log template

```md
## 2026-XX-XX — Powerslide grip pass

### Hypothesis
The car rotates correctly but loses too much speed because lateral grip remains too high.

### Scenarios
- car-powerslide-turn
- landing-recovery

### Parameters before
- powerslideRate: 2.0
- powerslideMaxAcceleration: 18

### Parameters after
- powerslideRate: 1.6
- powerslideMaxAcceleration: 15

### Metrics
- 180° turn time:
- exit speed:
- lateral slip at release:
- trajectory RMSE:

### Playtest
- Better:
- Worse:
- Unexpected:

### Decision
Accepted / Reverted / Needs another pass
```

---

# 41. Fun-Focused Iteration

Exact measured values are anchors, not the only objective.

A good result should feel:

- Immediate but not weightless
- Predictable but not automatic
- Forgiving enough to learn
- Deep enough to master
- Powerful without being chaotic

## 37.1 Playtest rubric

Rate each from 1–5.

### Ground driving

- Acceleration feels responsive.
- Braking is readable.
- Steering changes smoothly with speed.
- The car does not feel like it is on rails.
- The car does not feel like it is on ice.

### Powerslide

- Entry is immediate.
- Rotation is controllable.
- Momentum is preserved.
- Release produces a satisfying catch.
- The mechanic enables deliberate tight turns.

### Jump

- Tap and hold are clearly different.
- Jump direction follows car orientation.
- Timing is predictable.
- Double jump is reliable.

### Aerial

- Rotation begins promptly.
- Rotation has understandable inertia.
- Opposite input brakes rotation.
- Boost bends the trajectory predictably.
- Recoveries feel possible rather than random.

### Ball interaction

- Front hits go forward.
- Roof/corner hits produce understandable angles.
- Flip hits feel stronger.
- Small touches remain possible.
- Dribbling is not overwhelmed by minimum hit force.
- The ball does not jitter during sustained contact.

### Recovery

- Wheels settle on surfaces.
- Powerslide helps sideways landings.
- Wall transitions are stable.
- The car does not stick or explode from seams.

## 37.2 Quantitative gameplay metrics

Track:

- 0–10 m/s acceleration time
- 180° turn time
- 180° powerslide turn exit speed
- Jump apex
- Full-hold jump apex
- Double-jump apex
- Time to rotate 90° pitch in air
- Time to stop pitch with opposite input
- Straight-hit ball exit speed
- Flip-hit ball exit speed
- Ball bounce height ratio
- Average contact jitter during a 2-second dribble
- Head-on car collision symmetry error
- Contested 50/50 ball trajectory
- Maximum ball speed during a two-car pinch
- Number of unstable/NaN events in 10,000 ticks

## 37.3 Controlled A/B presets

Support two named parameter presets:

```text
A = current accepted
B = candidate
```

Allow instant switching from the physics lab.

Do not reveal the preset name to a human playtester until after rating when practical.

---

# 42. Stability and Stress Tests

## 38.1 Long-run idle

Run 60 seconds / 7200 ticks.

Assert:

- No NaN
- No unbounded energy
- Ball settles or behaves consistently
- Car does not drift unexpectedly
- Quaternions stay normalised

## 38.2 Random input fuzz

Use a seeded pseudo-random generator.

Generate independent valid input changes for both cars for 30,000 ticks.

Assert invariants every tick, including per-car state isolation and stable pair tracking.

Save seed on failure.

## 38.3 High-speed impact

Test:

- Car at 23 m/s into wall
- Ball at 60 m/s into wall
- Car and ball approaching each other
- Two cars approaching each other at maximum speed
- Two cars hitting the ball from opposite sides
- Ball compressed between both cars
- Ball into floor-wall seam
- Car landing upside down at high angular speed

## 38.4 Frame-rate independence

Run ordinary runtime mode at simulated render rates:

- 30 Hz
- 60 Hz
- 90 Hz
- 144 Hz

Feed the same timestamp sequence and input timeline.

Final physics state should match within a small tolerance because all use fixed 120 Hz stepping.

## 38.5 Tab-resume protection

Simulate a large frame delta.

Assert:

- Catch-up step cap works.
- Simulation does not execute thousands of steps.
- No explosive physics.
- Runtime can recover.

---

# 43. Performance Targets

Single-player scene targets:

- Physics step median comfortably below 1 ms on a typical desktop.
- No per-tick garbage allocations in core controllers.
- No repeated temporary `THREE.Vector3` creation in hot paths.
- Debug rendering optional and disableable.
- Telemetry recording optional.
- Stable render at 60 FPS or greater on a typical desktop.

Use reusable scratch vectors.

Do not prematurely move physics to a Worker.

---

# 44. Common Failure Modes

## Car feels like ice

Check:

- Normal grip rate too low
- Max lateral acceleration too low
- Incorrect right-on-surface direction
- Powerslide blend stuck above zero
- Car collider friction interfering unpredictably

## Car feels locked to rails

Check:

- Grip too strong
- Lateral velocity zeroed directly
- Steering implemented by setting orientation
- No angular inertia
- Powerslide not reducing grip enough

## Steering direction reverses unexpectedly

Check:

- Local forward is wrong
- Reverse-speed sign handling
- Cross-product order
- Imported mesh orientation confused with physics orientation

## Car bounces on floor

Check:

- Suspension too stiff
- Damping too weak
- Hard collider fighting suspension
- Car-world restitution too high
- Probe rest length inconsistent with hitbox elevation

## Car sinks or jitters

Check:

- Probe start inside geometry
- Wrong contact normal
- Excess penetration correction
- Too few solver iterations
- Sharp collision seams
- Suspension force applied at wrong location

## Ball tunnels

Check:

- CCD enabled
- `maxCcdSubsteps`
- Ball speed clamp timing
- Arena collider holes
- Trimesh scale
- Direct transform writes

## Ball gets repeated huge acceleration

Check:

- Extra impulse applied every overlap tick
- Contact tracker not reset correctly
- Rapier base response plus custom base response both active
- Extra impulse curve too strong
- Penetration causing repeated contact onset

## Flip feels like an animation

Check:

- Orientation being directly set
- Angular velocity profile too rigid
- No inertia or cancellation
- Aerial control completely disabled for too long

## Tests are flaky

Check:

- Test uses `requestAnimationFrame`
- Test uses wall-clock sleeps
- Keyboard timing used for quantitative mechanics
- Physics not paused before manual stepping
- Object sleeping
- Randomness not seeded
- Parallel tests sharing state
- Visual snapshots generated on different OS/GPU conditions

---

# 45. Phased Implementation Plan

## Phase 0 — Module boundary and test harness

Implement:

- Vite
- Three.js scene
- Rapier initialisation
- Playwright configuration
- `PhysicsFacade`
- `CarRegistry`
- Stable `CarId`
- `window.__PHYSICS_TEST__`
- Manual tick stepping
- Multi-entity world reset
- Plain state serialisation

Exit criteria:

- App loads.
- Test API reports ready.
- Two cars and one ball can be spawned.
- Reset is repeatable.
- Car creation order can be varied in tests.
- One test can advance exactly 120 ticks.

## Phase 1 — Ball and arena foundation

Implement:

- Flat floor
- Ball body
- Gravity
- CCD
- Ball speed caps
- Basic Rapier bounce

Tests:

- Gravity
- Speed caps
- Bounce
- Long-run stability

Exit criteria:

- No tunnelling in test speeds.
- Repeatable drop trajectory.
- No NaN.

## Phase 2 — Boost-pad foundation

Implement:

- Pad definitions supplied by arena
- Sensor colliders
- Small and full pickup behaviour
- Deterministic contested claims
- Tick-exact respawn
- Collection and respawn events
- Kickoff reset to 33 boost and all pads active

Tests:

- Small pickup
- Full pickup
- Full-car non-consumption
- Pause-safe respawn
- Simultaneous claim
- Reset

Exit criteria:

- Pad state is deterministic and observable.
- Two cars cannot both consume one pad.
- Respawn timing is exact.

## Phase 3 — Reusable car entity and basic ground driving

Implement:

- Car factory
- Two identical Octane OBB entities
- Per-car controller state
- Four probes per car
- Ground detection
- Suspension
- Throttle
- Brake
- Coast
- Speed limiter
- Per-car input buffers

Tests:

- Resting height for each car
- Independent input
- Independent boost/jump state
- No-boost top speed
- Braking
- Coasting
- Long-run idle

Exit criteria:

- Both cars settle stably.
- Either car can be controlled independently.
- No controller state leaks between cars.

## Phase 4 — Steering and grip

Implement:

- Curvature
- Yaw servo
- Lateral grip
- Upright alignment
- Powerslide

Tests:

- Full turn for each car ID
- Reverse steering
- Powerslide turn
- Sideways landing
- Same result when car creation order is reversed

Exit criteria:

- Ground driving is playable.
- Powerslide is meaningfully distinct.
- Both cars behave identically under identical state/input.

## Phase 5 — Boost and jumping

Implement:

- Ground/air boost
- Consumption
- First jump
- Held jump
- Sticky force
- Neutral second jump
- Jump timer

Tests:

- Boost acceleration
- Boost consumption
- Jump tap
- Jump hold
- Double jump
- Wall jump direction
- Simultaneous independent jumps

Exit criteria:

- Jump behaviour is predictable.
- Boost allows flight.
- One car's jump cannot change the other car.

## Phase 6 — Aerial rotation

Implement:

- Local pitch/yaw/roll
- Damping
- Opposite-input braking
- Angular speed cap
- Directional air roll

Tests:

- Axis directions
- Angular acceleration
- Angular cap
- Opposite-input stop
- Combined-axis trajectory
- Two cars running different aerial inputs concurrently

Exit criteria:

- Basic aerial control is usable and independent per car.

## Phase 7 — Dodge

Implement:

- Direction threshold
- Neutral versus directional second jump
- Linear dodge impulse
- Rotation profile
- Flip cancel
- Recovery

Tests:

- Front
- Side
- Diagonal
- High-speed
- Cancel
- Window expiry
- Concurrent different dodges

Exit criteria:

- Dodge is physical and controllable.

## Phase 8 — Car-car collision

Implement:

- `CAR <-> CAR` solver interaction
- Pair lifecycle
- Contact events
- Pair telemetry
- Material tuning

Tests:

- Head-on
- Rear bump
- Glancing
- Airborne
- Resting side contact
- No jump reset
- Entity-order independence

Exit criteria:

- Car-car bumps are stable and readable.
- Contacts do not falsely ground or reset cars.
- No sticky or explosive common case.

## Phase 9 — Single-car ball collision

Implement:

- Contact onset
- Extra normal
- Extra impulse
- Contact-point velocity
- Dodge interaction
- Recontact threshold

Tests:

- Straight hit
- Corner hit
- Roof hit
- Flip hit
- Sustained overlap
- Gentle touch

Exit criteria:

- Hits are directional.
- Hits have satisfying power.
- Gentle touches remain possible.
- No repeated explosion.

## Phase 10 — Multi-car ball collision

Implement:

- Pair-specific car-ball lifecycle
- Shared collection of same-tick contacts
- Combined extra contribution
- Multi-contact telemetry
- Pinch diagnostics

Tests:

- Symmetric 50/50
- Adjacent-angle double hit
- One existing touch plus one new hit
- Two flip hits
- Ball between two cars
- Entity-order independence

Exit criteria:

- Both contributions are represented.
- No contribution is lost or duplicated.
- Outcome does not depend materially on registry order.
- Ball remains stable and capped.

## Phase 11 — Arena transitions and recovery

Implement:

- Curved wall transitions
- Wall drive
- Ceiling interaction
- Reset contact rules
- Landing improvements

Tests:

- Floor-to-wall transition
- Wall jump
- Flip reset
- Sideways landing
- Upside-down recovery
- Two cars contesting near wall

Exit criteria:

- Wall movement and contested contacts remain stable.

## Phase 12 — High-fidelity response and calibration

Consider:

- Custom ball-world response
- Full shared custom car-ball base solver
- Explicit car inertia tensor
- Better dodge curve
- Better authored hit curve
- Refined car-car materials

Only change one subsystem at a time.

Exit criteria:

- Improvements are demonstrated by tests and playtests.
- No regressions in accepted single-car or multi-car mechanics.

---

# 46. Definition of Done

## Engineering

- [ ] TypeScript strict mode passes.
- [ ] Production build succeeds.
- [ ] No uncaught browser errors.
- [ ] No physics NaN in stress tests.
- [ ] Fixed 120 Hz stepping.
- [ ] Render interpolation separated from physics.
- [ ] Test API available in dev/test only.
- [ ] Calibration parameters centralised.
- [ ] Debug draw available.
- [ ] Telemetry export available.

## Physics

- [ ] Two Octane-style car entities supported.
- [ ] No global single-car assumptions.
- [ ] Stable suspension per car.
- [ ] Correct basic speed limits.
- [ ] Distinct throttle, brake and coast.
- [ ] Speed-dependent turning.
- [ ] Powerslide changes grip.
- [ ] Ground and air boost.
- [ ] Small pads grant 12 boost.
- [ ] Full pads fill boost to 100.
- [ ] Small pads respawn after 4 seconds.
- [ ] Full pads respawn after 10 seconds.
- [ ] Contested pad collection has one deterministic winner.
- [ ] Kickoff reset gives each car 33 boost and reactivates all pads.
- [ ] Tap/hold jump difference.
- [ ] Neutral second jump.
- [ ] Dodge and flip cancel.
- [ ] Direct aerial rotation.
- [ ] Ball gravity, bounce and rolling.
- [ ] Stable car-car collisions.
- [ ] Car contact never grants a jump reset.
- [ ] Directional car-ball hits per car-ball pair.
- [ ] Two same-tick car-ball contacts are both represented.
- [ ] Flip hits stronger than ordinary hits.
- [ ] No repeated extra impulse during continuous overlap.
- [ ] Wall transition and landing stability.

## Testing

- [ ] Smoke tests.
- [ ] Numeric benchmark tests.
- [ ] Invariant tests.
- [ ] Trajectory snapshots.
- [ ] Visual snapshots.
- [ ] Two-car independent-input tests.
- [ ] Car-car collision tests.
- [ ] Simultaneous car-ball contact tests.
- [ ] Boost-pad pickup, respawn, reset, and contested-claim tests.
- [ ] Entity-order-independence tests.
- [ ] Random-input stress test.
- [ ] Frame-rate independence test.
- [ ] Traces/videos retained on failure.
- [ ] Calibration log maintained.

## Playability

- [ ] Car is controllable in under five minutes.
- [ ] Powerslide enables tight deliberate turns.
- [ ] Jump timing is understandable.
- [ ] Aerial boost path is predictable.
- [ ] Ball hits feel powerful but not arbitrary.
- [ ] Contested ball contacts feel fair and readable.
- [ ] Car-car bumps are consequential without dominating play.
- [ ] Small ball touches are possible.
- [ ] Recoveries feel skill-based.
- [ ] No frequent jitter, tunnelling or explosive contact.

---

# 47. Commands

```bash
# Install
npm install

# Install Playwright browser
npx playwright install chromium

# Run app
npm run dev

# Run all tests
npx playwright test

# Run physics tests only
npx playwright test tests/car tests/ball tests/multicar tests/collision

# Run one scenario test
npx playwright test tests/car/steering.spec.ts

# Debug in headed mode
npx playwright test tests/car/steering.spec.ts --headed --debug

# Use Playwright UI
npx playwright test --ui

# Record traces
npx playwright test --trace on

# Open HTML report
npx playwright show-report

# Update reviewed visual/snapshot baselines
npx playwright test --update-snapshots

# Production build
npm run build
```

Recommended package scripts:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "playwright test",
    "test:physics": "playwright test tests/deterministic tests/car tests/ball tests/multicar tests/collision",
    "test:gameplay": "playwright test tests/gameplay",
    "test:visual": "playwright test tests/visual",
    "test:ui": "playwright test --ui",
    "test:report": "playwright show-report"
  }
}
```

---

# 48. Module Composition Requirements

When this document is later combined with other module specifications, the final game plan must treat the physics module as a service with explicit inputs and outputs.

## 45.1 Public inputs

- `PhysicsArenaDefinition`
- Spawn/reset commands
- Per-car `CarInput`
- Fixed physics parameter preset
- Pause/resume commands

## 45.2 Public outputs

- Immutable car and ball observations
- Interpolatable render snapshots
- Physics events
- Diagnostics
- Telemetry
- Scenario results in test builds

## 45.3 Forbidden dependencies

The physics core must not import:

```text
src/ai/*
src/match-rules/*
src/rendering/*
src/audio/*
src/ui/*
```

The integration layer may import physics and those modules together.

## 45.4 Versioning

Export a physics contract version:

```ts
export const PHYSICS_MODULE_CONTRACT_VERSION = "2.0";
```

Future module documents must name the contract version they target.

Breaking interface changes require:

- Contract version change
- Integration-document update
- Playwright regression pass
- Migration note

---

# 49. Reference Sources

Use these resources when exact API syntax or measured behaviour needs confirmation:

## Rapier

- JavaScript rigid bodies:  
  https://rapier.rs/docs/user_guides/javascript/rigid_bodies/

- Forces and impulses:  
  https://rapier.rs/docs/user_guides/javascript/rigid_body_forces_and_impulses/

- Scene queries:  
  https://rapier.rs/docs/user_guides/javascript/scene_queries/

- Advanced collision detection and hooks:  
  https://rapier.rs/docs/user_guides/javascript/advanced_collision_detection/

- Collision and solver groups:  
  https://rapier.rs/docs/user_guides/javascript/collider_collision_groups/

- JavaScript API reference:  
  https://rapier.rs/javascript3d/

## Three.js

- Documentation:  
  https://threejs.org/docs/

- Quaternion:  
  https://threejs.org/docs/pages/Quaternion.html

- WebGLRenderer:  
  https://threejs.org/docs/pages/WebGLRenderer.html

## Playwright

- Test configuration:  
  https://playwright.dev/docs/test-configuration

- Local web server:  
  https://playwright.dev/docs/test-webserver

- Assertions:  
  https://playwright.dev/docs/test-assertions

- Visual comparisons:  
  https://playwright.dev/docs/test-snapshots

- Trace Viewer:  
  https://playwright.dev/docs/trace-viewer

- UI mode:  
  https://playwright.dev/docs/test-ui-mode

## Rocket League measurements and reverse engineering

- RLBot useful values:  
  https://wiki.rlbot.org/v4/botmaking/useful-game-values/

- RLBot jump physics:  
  https://wiki.rlbot.org/v4/botmaking/jumping-physics/

- RLGym values:  
  https://rlgym.org/Cheatsheets/game_values/

- Samuel P. Mish ball simulation:  
  https://www.smish.dev/rocket_league/ball_simulation_1/

- Samuel P. Mish car-ball simulation:  
  https://www.smish.dev/rocket_league/ball_simulation_3/

- Rocket Science jump and boost measurements:  
  https://rocketscience.fyi/know/videos/boost-and-jump

---

# 50. Final Architectural Summary

This document defines one composable game module:

```text
                         Future AI module
                               |
                               | returns CarInput by CarId
                               v
Future input module ---> PhysicsFacade <--- Future match-rules module
                               |
                               | owns simulation facts
                               v
                  Rapier shared 1v1 physics world
                  ├─ CarEntity: car-player
                  ├─ CarEntity: car-opponent
                  ├─ BallEntity: ball-main
                  ├─ Arena colliders supplied by stadium module
                  └─ Boost-pad sensors and runtime states
                               |
          custom per-car controllers and shared contact resolution
                               |
         car-arena | ball-arena | car-car | multi-car-ball
                               |
                         fixed 120 Hz tick
                               |
             immutable snapshots, events and telemetry
                    /                         \
                   v                           v
        Three.js rendering          Playwright calibration
```

The physics module must be built around entity identity and stable collections, not a privileged player-car singleton.

Each car is:

- One dynamic cuboid rigid body
- One independent `CarRuntimeState`
- One independent input buffer/provider binding
- Four suspension/contact probes
- Custom longitudinal acceleration
- Custom speed-dependent yaw control
- Custom lateral grip
- Reduced grip during powerslide
- Direct aerial angular acceleration
- Explicit jump and dodge state machines

The shared world contains:

- Two equivalent car entities
- One dynamic sphere ball
- Arena colliders supplied through a future stadium-module interface
- Rapier car-car collision response
- Rapier or custom ball-world response
- Per-pair car-ball lifecycle tracking
- Same-tick multi-car ball contribution handling
- Stable event and telemetry ordering
- A deterministic Playwright test harness

The future AI module must only observe public state and produce the same `CarInput` that a human input provider produces.

The future stadium module must only provide collision definitions, spawn transforms, material/surface metadata and optional sensor volumes.

The future match-rules module must consume physics events and issue resets or simulation commands. It decides goals, scores, kickoffs and match flow.

The first implementation only needs to be coherent, stable and measurable.

Long-term quality comes from:

- Isolating uncertain mechanics
- Writing focused single-car and multi-car scenarios
- Measuring them through Playwright
- Preserving accepted trajectories
- Testing entity-order independence
- Testing contested contacts
- Iterating through controlled calibration rather than random tuning
- Keeping module boundaries strict so later AI and stadium specifications can be combined without rewriting physics

