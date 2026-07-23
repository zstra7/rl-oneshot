import * as RAPIER from "@dimforge/rapier3d-compat";

import type { GameModule } from "@/core/GameModule";
import { CAR_HALF_EXTENTS, CAR_HITBOX_OFFSET, RL_CONSTANTS } from "@/physics/PhysicsConstants";
import {
  DEFAULT_PHYSICS_PARAMETERS,
  type DeepPartial,
  type PhysicsParameters
} from "@/physics/PhysicsParameters";
import type {
  ArenaPreset,
  BallSerializableState,
  CarId,
  CarInput,
  CarSerializableState,
  PhysicsRenderSnapshot,
  QuatLike,
  ResetWorldOptions,
  SpawnCarOptions,
  TransformSample,
  WorldSerializableState
} from "@/physics/PhysicsTypes";
import { NEUTRAL_CAR_INPUT, type CarControlProfile } from "@/physics/PhysicsTypes";
import { getArenaPresetDefinition } from "@/physics/arena/TestArenaPresets";
import type { GoalScoredEvent, GoalSensorDefinition } from "@/physics/goal/GoalTypes";
import { otherTeam, type TeamId } from "@/core/TeamTypes";
import { CarRegistry, createCarEntity, type CarEntity } from "@/physics/entities/CarRegistry";
import { prePhysicsTick, postPhysicsTick } from "@/physics/car/CarController";
import { resolveCarBallContacts } from "@/physics/collision/CarBallCollision";
import * as V from "@/physics/Vec3Math";
import { BoostPadSystem } from "@/physics/boost/BoostPadSystem";
import { createDefaultBoostPadLayout } from "@/physics/boost/BoostPadLayout";
import type {
  BoostPadEvent,
  BoostPadId,
  BoostPadObservation,
  BoostPadRuntimeState
} from "@/physics/boost/BoostPadTypes";
import type { WorldNetSnapshot } from "@/physics/WorldSnapshot";

/** S5: how the guest reconciles its locally-predicted own car with an authoritative snapshot. */
export interface ApplyWorldSnapshotOptions {
  /** The guest's own car — keep its predicted body unless it drifts past `hardCorrectionDistance`. */
  readonly predictedLocalCarId?: CarId;
  /** Metres of positional error beyond which even the predicted car is hard-snapped. */
  readonly hardCorrectionDistance?: number;
}

export const PHYSICS_MODULE_CONTRACT_VERSION = "2.1";

// WS5.B (plan/POLISH_OVERHAUL_PLAN.md): the ball used to fall 8m at every
// kickoff — spawn it resting on the floor instead.
const DEFAULT_BALL_SPAWN = { x: 0, y: RL_CONSTANTS.ballRadius, z: 0 };

const KICKOFF_SPAWN_Y = 0.35;
const ARENA_CENTRE = { x: 0, y: KICKOFF_SPAWN_Y, z: 0 };

/**
 * WS7.A-2 (plan/POLISH_OVERHAUL_PLAN.md): the 5 RL-style kickoff spots,
 * given here for the player side (negative Z); the opponent's spawn for
 * the same variant index is the Z-mirror. Rotation is computed (not
 * stored) via `V.yawFacing`, aimed at the arena centre.
 */
const KICKOFF_VARIANTS: ReadonlyArray<{ x: number; z: number }> = [
  { x: -8, z: -18 }, // diagonal left
  { x: 8, z: -18 }, // diagonal right
  { x: -2.5, z: -22 }, // back-left
  { x: 2.5, z: -22 }, // back-right
  { x: 0, z: -24 } // far-back
];

/**
 * Exported (not just internal to `resetWorld`) so F13's AI stuck
 * watchdog (`MatchFlowController.ts`) can compute the exact same
 * kickoff-spawn pose used at a real kickoff, instead of hardcoding a
 * separate reset position that could silently drift from this one.
 */
export function kickoffSpawn(
  variantIndex: number,
  isPlayerSide: boolean
): { transform: V.Vec3Like; rotation: QuatLike } {
  const variant =
    KICKOFF_VARIANTS[((variantIndex % KICKOFF_VARIANTS.length) + KICKOFF_VARIANTS.length) % KICKOFF_VARIANTS.length]!;
  const transform = { x: variant.x, y: KICKOFF_SPAWN_Y, z: isPlayerSide ? variant.z : -variant.z };
  return { transform, rotation: V.yawFacing(transform, ARENA_CENTRE) };
}

function cloneTransform(
  position: RAPIER.Vector,
  rotation: RAPIER.Rotation
): TransformSample {
  return {
    position: { x: position.x, y: position.y, z: position.z },
    rotation: { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w }
  };
}

function lerpTransform(a: TransformSample, b: TransformSample, alpha: number): TransformSample {
  const t = Math.min(1, Math.max(0, alpha));

  return {
    position: {
      x: a.position.x + (b.position.x - a.position.x) * t,
      y: a.position.y + (b.position.y - a.position.y) * t,
      z: a.position.z + (b.position.z - a.position.z) * t
    },
    // Nlerp is sufficient for render-only interpolation between adjacent
    // 120Hz ticks (rotation delta per tick is small).
    rotation: normaliseQuat({
      x: a.rotation.x + (b.rotation.x - a.rotation.x) * t,
      y: a.rotation.y + (b.rotation.y - a.rotation.y) * t,
      z: a.rotation.z + (b.rotation.z - a.rotation.z) * t,
      w: a.rotation.w + (b.rotation.w - a.rotation.w) * t
    })
  };
}

function normaliseQuat(q: { x: number; y: number; z: number; w: number }) {
  const length = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w) || 1;
  return { x: q.x / length, y: q.y / length, z: q.z / length, w: q.w / length };
}

function clampLinearVelocity(body: RAPIER.RigidBody, maxSpeed: number): void {
  const velocity = body.linvel();
  const speed = Math.sqrt(
    velocity.x * velocity.x + velocity.y * velocity.y + velocity.z * velocity.z
  );

  if (speed > maxSpeed && speed > 0) {
    const scale = maxSpeed / speed;
    body.setLinvel(
      { x: velocity.x * scale, y: velocity.y * scale, z: velocity.z * scale },
      true
    );
  }
}

const AUTO_FLIP_UPRIGHT_UP_Y = 0.55;
const AUTO_FLIP_SPEED_THRESHOLD = 6.0;
const AUTO_FLIP_ANGULAR_SPEED_THRESHOLD = 4.0;
const AUTO_FLIP_MAX_HEIGHT = 1.2;
const AUTO_FLIP_SECONDS = 0.75;

/**
 * R3 (plan/RAMPS_AND_FEATURES_PLAN.md): a car stranded in a non-driveable
 * pose — upside down, on its side, or standing on its nose/tail — roughly
 * stationary for `AUTO_FLIP_SECONDS`, gets righted automatically. Real
 * Rocket League has no auto-flip (players dodge out themselves) — this is
 * a deliberate product deviation requested for this game, see
 * docs/physics-deviations.md.
 *
 * v2 (R3) widened this from WS7.B's "upside down only, stationary" case:
 * the speed/angular-speed gates were raised so a car still drifting
 * qualifies (no more "wait for the car to stop completely"), and the
 * `up.y` threshold was raised from -0.35 (near-fully-inverted) to 0.55
 * (anything not close to upright) so side-stuck and nose/tail-stand poses
 * qualify too.
 */
function applyAutoFlipIfStranded(car: CarEntity, dt: number): void {
  const rotation = car.body.rotation();
  const up = V.applyQuaternion(V.UP, rotation);
  const linvel = car.body.linvel();
  const angvel = car.body.angvel();
  const translation = car.body.translation();

  // Surface-contact exemption, not input-gated: wheels resting/driving on
  // any upward-facing surface (floor, ramp, fillet segment —
  // `supportNormal.y > 0.05`, true even on the steepest R1 fillet
  // segment) means the car is recoverable by its own controls and must
  // never be auto-flipped, whether or not throttle is held (a genuinely
  // stuck-on-its-side player will be mashing throttle, so gating on input
  // would defeat the point). This also can't misfire on the vertical wall
  // itself: that only begins at fillet-top height (y=2), above
  // `AUTO_FLIP_MAX_HEIGHT` — see docs/physics-deviations.md for the full
  // per-case reasoning.
  const onDriveableSurface = car.runtime.grounded && car.runtime.supportNormal.y > 0.05;

  const strandedNonUpright =
    up.y < AUTO_FLIP_UPRIGHT_UP_Y &&
    translation.y < AUTO_FLIP_MAX_HEIGHT &&
    V.length(linvel) < AUTO_FLIP_SPEED_THRESHOLD &&
    V.length(angvel) < AUTO_FLIP_ANGULAR_SPEED_THRESHOLD &&
    !onDriveableSurface;

  car.runtime.invertedSeconds = strandedNonUpright ? car.runtime.invertedSeconds + dt : 0;

  if (car.runtime.invertedSeconds < AUTO_FLIP_SECONDS) {
    return;
  }

  // Preserve the car's current heading — only pitch/roll get corrected,
  // not yaw. Falls back to yaw 0 if the car is pointing straight up/
  // down, where the flattened forward vector is degenerate.
  const forward = V.applyQuaternion(V.LOCAL_FORWARD, rotation);
  const flatForward = { x: forward.x, y: 0, z: forward.z };
  const yaw = V.length(flatForward) < 0.1 ? 0 : Math.atan2(-flatForward.x, -flatForward.z);

  car.body.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
  car.body.setTranslation({ x: translation.x, y: translation.y + 0.5, z: translation.z }, true);
  car.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  car.runtime.invertedSeconds = 0;
}

/**
 * Real physics module (Master Brief Phase 3: foundation only). Cars are
 * plain dynamic cuboids with no controller forces yet — ground driving,
 * suspension, boost, jump, and dodge are Phase 5. Boost pads are Phase 6.
 */
export class PhysicsFacade implements GameModule {
  private world: RAPIER.World | null = null;
  private readonly carRegistry = new CarRegistry();
  private ballBody: RAPIER.RigidBody | null = null;
  private arenaBodies: RAPIER.RigidBody[] = [];
  private arenaPreset: ArenaPreset = "box-arena";
  private parameters: PhysicsParameters = structuredCloneParameters();

  private tick = 0;
  private simulationTime = 0;

  private previousSnapshot: Map<CarId, TransformSample> = new Map();
  private currentSnapshot: Map<CarId, TransformSample> = new Map();
  private previousBall: TransformSample = zeroTransform();
  private currentBall: TransformSample = zeroTransform();
  private readonly wasTouchingBallLastTick = new Map<CarId, boolean>();
  private readonly boostPadSystem = new BoostPadSystem();

  private goalSensors: { definition: GoalSensorDefinition; collider: RAPIER.Collider }[] = [];
  private readonly goalSensorOverlapping = new Map<TeamId, boolean>();
  private goalEvents: GoalScoredEvent[] = [];

  public async initialise(): Promise<void> {
    await RAPIER.init();

    this.world = new RAPIER.World({ x: 0, y: -RL_CONSTANTS.gravity, z: 0 });
    this.world.timestep = RL_CONSTANTS.physicsDt;

    this.buildArena(this.arenaPreset);
    this.spawnBall(DEFAULT_BALL_SPAWN);
    this.boostPadSystem.buildColliders(this.world, createDefaultBoostPadLayout());
  }

  private requireWorld(): RAPIER.World {
    if (!this.world) {
      throw new Error("PhysicsFacade.initialise() must complete before use.");
    }
    return this.world;
  }

  private buildArena(preset: ArenaPreset): void {
    const world = this.requireWorld();

    for (const body of this.arenaBodies) {
      world.removeRigidBody(body);
    }
    this.arenaBodies = [];

    for (const goalSensor of this.goalSensors) {
      world.removeCollider(goalSensor.collider, false);
    }
    this.goalSensors = [];
    this.goalSensorOverlapping.clear();

    const definition = getArenaPresetDefinition(preset);

    for (const colliderSpec of definition.colliders) {
      const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(
        colliderSpec.translation.x,
        colliderSpec.translation.y,
        colliderSpec.translation.z
      );
      if (colliderSpec.rotation) {
        bodyDesc.setRotation(colliderSpec.rotation);
      }
      const body = world.createRigidBody(bodyDesc);

      world.createCollider(
        RAPIER.ColliderDesc.cuboid(
          colliderSpec.halfExtents.x,
          colliderSpec.halfExtents.y,
          colliderSpec.halfExtents.z
        ).setFriction(this.parameters.carWorld.friction),
        body
      );

      this.arenaBodies.push(body);
    }

    for (const goalSensorDefinition of definition.goalSensors) {
      const collider = world.createCollider(
        RAPIER.ColliderDesc.cuboid(
          goalSensorDefinition.halfExtents.x,
          goalSensorDefinition.halfExtents.y,
          goalSensorDefinition.halfExtents.z
        )
          .setTranslation(
            goalSensorDefinition.centre.x,
            goalSensorDefinition.centre.y,
            goalSensorDefinition.centre.z
          )
          .setSensor(true)
      );
      this.goalSensors.push({ definition: goalSensorDefinition, collider });
      this.goalSensorOverlapping.set(goalSensorDefinition.defendingTeam, false);
    }

    this.arenaPreset = preset;
  }

  private spawnBall(position: { x: number; y: number; z: number }): void {
    const world = this.requireWorld();

    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(position.x, position.y, position.z)
        .setCanSleep(false)
        .setCcdEnabled(true)
        .setLinearDamping(0)
        .setAngularDamping(0)
    );

    world.createCollider(
      RAPIER.ColliderDesc.ball(RL_CONSTANTS.ballRadius)
        .setDensity(RL_CONSTANTS.ballMass / ((4 / 3) * Math.PI * RL_CONSTANTS.ballRadius ** 3))
        .setRestitution(RL_CONSTANTS.ballWorldRestitution)
        .setFriction(this.parameters.ballWorld.friction),
      body
    );

    this.ballBody = body;

    const sample = cloneTransform(body.translation(), body.rotation());
    this.previousBall = sample;
    this.currentBall = sample;
  }

  public spawnCar(options: SpawnCarOptions): CarId {
    const world = this.requireWorld();

    if (this.carRegistry.tryGet(options.id)) {
      throw new Error(`Duplicate CarId "${options.id}" rejected.`);
    }

    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(options.transform.x, options.transform.y, options.transform.z)
      .setCanSleep(false)
      .setCcdEnabled(true)
      .setLinearDamping(0)
      .setAngularDamping(0);
    if (options.rotation) {
      bodyDesc.setRotation(options.rotation);
    }
    const body = world.createRigidBody(bodyDesc);

    const collider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(CAR_HALF_EXTENTS.x, CAR_HALF_EXTENTS.y, CAR_HALF_EXTENTS.z)
        .setTranslation(CAR_HITBOX_OFFSET.x, CAR_HITBOX_OFFSET.y, CAR_HITBOX_OFFSET.z)
        .setDensity(
          RL_CONSTANTS.carMass /
            (8 * CAR_HALF_EXTENTS.x * CAR_HALF_EXTENTS.y * CAR_HALF_EXTENTS.z)
        )
        .setFriction(this.parameters.carWorld.friction)
        .setRestitution(this.parameters.carWorld.restitution),
      body
    );

    const car = createCarEntity(
      options.id,
      body,
      collider,
      options.initialBoost ?? RL_CONSTANTS.kickoffBoostAmount
    );

    this.carRegistry.add(car);
    this.wasTouchingBallLastTick.set(car.id, false);

    const sample = cloneTransform(body.translation(), body.rotation());
    this.previousSnapshot.set(car.id, sample);
    this.currentSnapshot.set(car.id, sample);

    return options.id;
  }

  public removeCar(carId: CarId): void {
    const world = this.requireWorld();
    const car = this.carRegistry.tryGet(carId);

    if (!car) {
      return;
    }

    world.removeRigidBody(car.body);
    this.carRegistry.remove(carId);
    this.previousSnapshot.delete(carId);
    this.currentSnapshot.delete(carId);
    this.wasTouchingBallLastTick.delete(carId);
  }

  public getCarIds(): CarId[] {
    return this.carRegistry.getAllStable().map((car) => car.id);
  }

  public resetWorld(options?: ResetWorldOptions): void {
    const world = this.requireWorld();

    for (const car of this.carRegistry.getAllStable()) {
      world.removeRigidBody(car.body);
    }
    this.carRegistry.clear();
    this.previousSnapshot.clear();
    this.currentSnapshot.clear();
    this.wasTouchingBallLastTick.clear();

    if (this.ballBody) {
      world.removeRigidBody(this.ballBody);
    }
    this.spawnBall(DEFAULT_BALL_SPAWN);

    if (options?.arenaPreset) {
      this.buildArena(options.arenaPreset);
    }

    if (options?.carCreationOrder) {
      const variantIndex = options.kickoffVariantIndex ?? 0;
      options.carCreationOrder.forEach((carId, index) => {
        const spawn = kickoffSpawn(variantIndex, index === 0);
        this.spawnCar({ id: carId, transform: spawn.transform, rotation: spawn.rotation });
      });
    }

    // physics spec section 21.9: kickoff reset restores every pad to
    // active and clears all pad timers/claim state.
    this.boostPadSystem.resetAllActive();
    this.boostPadSystem.clearEvents();

    for (const team of this.goalSensorOverlapping.keys()) {
      this.goalSensorOverlapping.set(team, false);
    }
    this.goalEvents = [];

    this.tick = 0;
    this.simulationTime = 0;
  }

  public setArenaPreset(preset: ArenaPreset): void {
    this.buildArena(preset);
  }

  public getPhysicsParameters(): PhysicsParameters {
    return structuredCloneOf(this.parameters);
  }

  public setPhysicsParameters(partial: DeepPartial<PhysicsParameters>): void {
    for (const key of Object.keys(partial) as (keyof PhysicsParameters)[]) {
      const group = partial[key];
      if (group) {
        Object.assign(this.parameters[key], group);
      }
    }

    for (const car of this.carRegistry.getAllStable()) {
      car.collider.setFriction(this.parameters.carWorld.friction);
      car.collider.setRestitution(this.parameters.carWorld.restitution);
    }

    if (this.ballBody) {
      this.ballBody.collider(0).setFriction(this.parameters.ballWorld.friction);
    }
  }

  public setBallState(state: Partial<BallSerializableState>): void {
    if (!this.ballBody) {
      throw new Error("Ball has not been spawned.");
    }

    if (state.position) {
      this.ballBody.setTranslation(state.position, true);
    }
    if (state.rotation) {
      this.ballBody.setRotation(state.rotation, true);
    }
    if (state.linearVelocity) {
      this.ballBody.setLinvel(state.linearVelocity, true);
    }
    if (state.angularVelocity) {
      this.ballBody.setAngvel(state.angularVelocity, true);
    }

    const sample = cloneTransform(this.ballBody.translation(), this.ballBody.rotation());
    this.previousBall = sample;
    this.currentBall = sample;
  }

  public setCarState(carId: CarId, state: Partial<CarSerializableState>): void {
    const car = this.carRegistry.get(carId);

    if (state.position) {
      car.body.setTranslation(state.position, true);
    }
    if (state.rotation) {
      car.body.setRotation(state.rotation, true);
    }
    if (state.linearVelocity) {
      car.body.setLinvel(state.linearVelocity, true);
    }
    if (state.angularVelocity) {
      car.body.setAngvel(state.angularVelocity, true);
    }

    const sample = cloneTransform(car.body.translation(), car.body.rotation());
    this.previousSnapshot.set(carId, sample);
    this.currentSnapshot.set(carId, sample);
  }

  public setCarInput(carId: CarId, input: Partial<CarInput>): void {
    const car = this.carRegistry.get(carId);
    car.currentInput = { ...car.currentInput, ...input };
  }

  /** physics spec section 4.2: per-car tuning, never a global setting. */
  public setCarControlProfile(carId: CarId, profile: Partial<CarControlProfile>): void {
    const car = this.carRegistry.get(carId);
    car.controlProfile = { ...car.controlProfile, ...profile };
  }

  public clearCarInput(carId: CarId): void {
    const car = this.carRegistry.get(carId);
    car.currentInput = { ...NEUTRAL_CAR_INPUT };
  }

  public clearAllInputs(): void {
    for (const car of this.carRegistry.getAllStable()) {
      car.currentInput = { ...NEUTRAL_CAR_INPUT };
    }
  }

  /**
   * Steps Rapier exactly once, following physics spec section 29's fixed-
   * tick order. Called by GameRuntime's single FixedStepCoordinator.
   */
  public step(): void {
    const world = this.requireWorld();
    const cars = this.carRegistry.getAllStable();
    const dt = RL_CONSTANTS.physicsDt;

    for (const car of cars) {
      this.previousSnapshot.set(
        car.id,
        this.currentSnapshot.get(car.id) ?? cloneTransform(car.body.translation(), car.body.rotation())
      );
    }
    if (this.ballBody) {
      this.previousBall = this.currentBall;
    }

    for (const car of cars) {
      prePhysicsTick(world, car, this.parameters, dt);
    }

    world.step();

    for (const car of cars) {
      clampLinearVelocity(car.body, RL_CONSTANTS.carMaxSpeed);
      postPhysicsTick(car);
      applyAutoFlipIfStranded(car, dt);
      this.currentSnapshot.set(car.id, cloneTransform(car.body.translation(), car.body.rotation()));
      car.previousInput = car.currentInput;
    }

    if (this.ballBody) {
      resolveCarBallContacts(
        world,
        cars,
        this.ballBody,
        this.wasTouchingBallLastTick,
        this.parameters,
        dt
      );
      clampLinearVelocity(this.ballBody, RL_CONSTANTS.ballMaxSpeed);
      this.currentBall = cloneTransform(this.ballBody.translation(), this.ballBody.rotation());
    }

    this.tick += 1;

    // physics spec section 21.5/21.8, section 29 steps 20-21/29-30. Uses
    // the post-increment tick so "respawn N ticks after collection" means
    // exactly N step() calls later, whether the pad was collected via a
    // real sensor overlap in this tick or via the test-only
    // collectBoostPadForCar() bypass called between step() calls.
    this.boostPadSystem.resolveClaims(world, cars, this.tick);
    this.boostPadSystem.processRespawns(this.tick);

    if (this.ballBody) {
      const ballCollider = this.ballBody.collider(0);
      for (const goalSensor of this.goalSensors) {
        const overlapping = world.intersectionPair(ballCollider, goalSensor.collider);
        const wasOverlapping = this.goalSensorOverlapping.get(goalSensor.definition.defendingTeam) ?? false;

        if (overlapping && !wasOverlapping) {
          this.goalEvents.push({
            type: "goal-scored",
            scoringTeam: otherTeam(goalSensor.definition.defendingTeam),
            tick: this.tick
          });
        }

        this.goalSensorOverlapping.set(goalSensor.definition.defendingTeam, overlapping);
      }
    }

    this.simulationTime += dt;
  }

  public stepTicks(count: number): void {
    for (let i = 0; i < count; i += 1) {
      this.step();
    }
  }

  public getRenderSnapshot(alpha: number): PhysicsRenderSnapshot {
    const cars = new Map<CarId, TransformSample>();

    for (const car of this.carRegistry.getAllStable()) {
      const previous = this.previousSnapshot.get(car.id);
      const current = this.currentSnapshot.get(car.id);
      if (previous && current) {
        cars.set(car.id, lerpTransform(previous, current, alpha));
      }
    }

    return {
      cars,
      ball: lerpTransform(this.previousBall, this.currentBall, alpha)
    };
  }

  public getCarState(carId: CarId): CarSerializableState {
    const car = this.carRegistry.get(carId);
    return serializeCar(car);
  }

  public getAllCarStates(): CarSerializableState[] {
    return this.carRegistry.getAllStable().map(serializeCar);
  }

  public getBallState(): BallSerializableState {
    if (!this.ballBody) {
      throw new Error("Ball has not been spawned.");
    }
    return serializeBall(this.ballBody);
  }

  public getWorldState(): WorldSerializableState {
    return {
      tick: this.tick,
      simulationTime: this.simulationTime,
      cars: this.getAllCarStates(),
      ball: this.getBallState(),
      boostPads: this.boostPadSystem.getObservations()
    };
  }

  public getTick(): number {
    return this.tick;
  }

  public getBoostPadStates(): BoostPadObservation[] {
    return this.boostPadSystem.getObservations();
  }

  /**
   * S1 (online state-sync): capture the COMPLETE mutable simulation state so
   * a peer can restore it verbatim. This is the host's authoritative frame;
   * everything `step()` reads is included (bodies, per-car controller
   * runtime, previous input, ball-contact + goal-sensor bookkeeping, pad
   * timers), so a guest that applies it and replays inputs stays converged.
   */
  public getWorldSnapshot(): WorldNetSnapshot {
    const vec = (v: RAPIER.Vector): V.Vec3Like => ({ x: v.x, y: v.y, z: v.z });
    const quat = (q: RAPIER.Rotation): QuatLike => ({ x: q.x, y: q.y, z: q.z, w: q.w });

    const cars = this.carRegistry.getAllStable().map((car) => ({
      id: car.id,
      position: vec(car.body.translation()),
      rotation: quat(car.body.rotation()),
      linearVelocity: vec(car.body.linvel()),
      angularVelocity: vec(car.body.angvel()),
      runtime: structuredCloneOf(car.runtime),
      previousInput: { ...car.previousInput },
      touchingBall: this.wasTouchingBallLastTick.get(car.id) ?? false
    }));

    if (!this.ballBody) {
      throw new Error("Ball has not been spawned.");
    }
    const ballBody = this.ballBody;
    const goalOverlap = {} as Record<TeamId, boolean>;
    for (const [team, overlapping] of this.goalSensorOverlapping) {
      goalOverlap[team] = overlapping;
    }

    return {
      tick: this.tick,
      simulationTime: this.simulationTime,
      cars,
      ball: {
        position: vec(ballBody.translation()),
        rotation: quat(ballBody.rotation()),
        linearVelocity: vec(ballBody.linvel()),
        angularVelocity: vec(ballBody.angvel())
      },
      pads: this.boostPadSystem.registry.getAllStable().map((pad) => ({
        active: pad.active,
        collectedAtTick: pad.collectedAtTick,
        respawnAtTick: pad.respawnAtTick,
        respawnTicksRemaining: pad.respawnTicksRemaining,
        lastCollectedByCarId: pad.lastCollectedByCarId
      })),
      goalOverlap
    };
  }

  /**
   * S1: overwrite this world with an authoritative snapshot. The guest calls
   * this to converge onto the host's state, then replays its own buffered
   * inputs forward from `snapshot.tick`. Pads are matched by stable order.
   * Missing cars/pads are tolerated (a guest that hasn't spawned everything
   * yet just skips them). Render smoothing is re-primed so the correction
   * does not produce a one-frame interpolation streak.
   */
  public applyWorldSnapshot(snapshot: WorldNetSnapshot, options?: ApplyWorldSnapshotOptions): void {
    this.tick = snapshot.tick;
    this.simulationTime = snapshot.simulationTime;

    const predictedCarId = options?.predictedLocalCarId;
    const hardDistanceSq = (options?.hardCorrectionDistance ?? 0) ** 2;

    for (const carSnap of snapshot.cars) {
      const car = this.carRegistry.tryGet(carSnap.id);
      if (!car) {
        continue;
      }

      // The guest's OWN car is locally predicted for lag-free feel: keep its
      // predicted body unless it has drifted implausibly far from the host's
      // authority (a genuinely mispredicted collision), in which case snap it.
      // Its gameplay runtime (boost, jump/dodge) is always taken from the host
      // so boost pickups and dodges stay authoritative.
      let keepPredictedBody = false;
      if (carSnap.id === predictedCarId) {
        const pos = car.body.translation();
        const dx = pos.x - carSnap.position.x;
        const dy = pos.y - carSnap.position.y;
        const dz = pos.z - carSnap.position.z;
        keepPredictedBody = dx * dx + dy * dy + dz * dz <= hardDistanceSq;
      }

      if (!keepPredictedBody) {
        car.body.setTranslation(carSnap.position, true);
        car.body.setRotation(carSnap.rotation, true);
        car.body.setLinvel(carSnap.linearVelocity, true);
        car.body.setAngvel(carSnap.angularVelocity, true);
        const sample = cloneTransform(car.body.translation(), car.body.rotation());
        this.previousSnapshot.set(carSnap.id, sample);
        this.currentSnapshot.set(carSnap.id, sample);
      }

      Object.assign(car.runtime, structuredCloneOf(carSnap.runtime));
      car.previousInput = { ...carSnap.previousInput };
      this.wasTouchingBallLastTick.set(carSnap.id, carSnap.touchingBall);
    }

    if (this.ballBody) {
      this.ballBody.setTranslation(snapshot.ball.position, true);
      this.ballBody.setRotation(snapshot.ball.rotation, true);
      this.ballBody.setLinvel(snapshot.ball.linearVelocity, true);
      this.ballBody.setAngvel(snapshot.ball.angularVelocity, true);
      const ballSample = cloneTransform(this.ballBody.translation(), this.ballBody.rotation());
      this.previousBall = ballSample;
      this.currentBall = ballSample;
    }

    const pads = this.boostPadSystem.registry.getAllStable();
    snapshot.pads.forEach((padSnap, index) => {
      const pad = pads[index];
      if (pad) {
        Object.assign(pad, padSnap);
      }
    });

    for (const [team, overlapping] of Object.entries(snapshot.goalOverlap) as [TeamId, boolean][]) {
      this.goalSensorOverlapping.set(team, overlapping);
    }
  }

  /** Test-only: force a pad's runtime state (e.g. simulate a mid-cooldown pad). */
  public setBoostPadState(padId: BoostPadId, state: Partial<BoostPadRuntimeState>): void {
    const padState = this.boostPadSystem.registry.get(padId);
    Object.assign(padState, state);
  }

  /** Test-only: force-collect a pad for a given car, bypassing the sensor overlap check. */
  public collectBoostPadForCar(padId: BoostPadId, carId: CarId): void {
    const car = this.carRegistry.get(carId);
    const padState = this.boostPadSystem.registry.get(padId);
    const definition = this.boostPadSystem.registry.getDefinition(padId);

    if (!padState.active) {
      return;
    }

    const boostBefore = car.runtime.boostAmount;
    const boostAfter =
      definition.type === "full"
        ? RL_CONSTANTS.maximumBoostAmount
        : Math.min(RL_CONSTANTS.maximumBoostAmount, boostBefore + (definition.type === "small" ? 12 : 0));
    car.runtime.boostAmount = boostAfter;

    padState.active = false;
    padState.collectedAtTick = this.tick;
    const respawnTicks =
      definition.type === "full"
        ? RL_CONSTANTS.fullBoostPadRespawnSeconds * RL_CONSTANTS.physicsHz
        : RL_CONSTANTS.smallBoostPadRespawnSeconds * RL_CONSTANTS.physicsHz;
    padState.respawnAtTick = this.tick + respawnTicks;
    padState.respawnTicksRemaining = respawnTicks;
    padState.lastCollectedByCarId = carId;
  }

  public getBoostPadEvents(): readonly BoostPadEvent[] {
    return this.boostPadSystem.getEvents();
  }

  public clearBoostPadEvents(): void {
    this.boostPadSystem.clearEvents();
  }

  public getGoalEvents(): readonly GoalScoredEvent[] {
    return this.goalEvents;
  }

  /** Test-only: the sensor centre for the goal a given team defends. */
  public getGoalSensorCentre(defendingTeam: TeamId): { x: number; y: number; z: number } | null {
    const sensor = this.goalSensors.find((s) => s.definition.defendingTeam === defendingTeam);
    return sensor ? sensor.definition.centre : null;
  }

  /**
   * R6 (plan/RAMPS_AND_FEATURES_PLAN.md): a real-RL-style "goal explosion"
   * shockwave — cars within `radius` of `centre` get a velocity change of
   * up to `maxDeltaV`, directed away from `centre` horizontally with a
   * small upward component, mass-scaled so the impulse produces the same
   * delta-v regardless of car mass. F14 (plan/
   * ARENA_FLUSH_AND_REFINEMENTS_PLAN.md): falloff floored at 0.4 (was a
   * pure linear ramp to 0 at the edge) — the locked "big + strong" design
   * means even a car near the edge of the radius still gets a solid
   * shove, not a token nudge; still a hard zero the instant a car is
   * outside `radius` entirely.
   */
  public applyRadialCarImpulse(centre: V.Vec3Like, radius: number, maxDeltaV: number): void {
    for (const car of this.carRegistry.getAllStable()) {
      const toCar = V.sub(car.body.translation(), centre);
      const distance = V.length(toCar);
      if (distance > radius) {
        continue;
      }
      const falloff = Math.max(0.4, 1 - distance / radius);
      const dirH = distance < 1e-4 ? { x: 0, y: 0, z: 0 } : V.normalize({ x: toCar.x, y: 0, z: toCar.z });
      const dir = V.normalize({ x: dirH.x, y: 0.35, z: dirH.z });
      car.body.applyImpulse(V.scale(dir, RL_CONSTANTS.carMass * maxDeltaV * falloff), true);
    }
  }

  /**
   * Camera-collision avoidance (game-flow spec section 21): casts a ray
   * from `origin` toward `direction` (normalised) and returns the
   * distance to the nearest *arena* collider hit within `maxDistance`, or
   * null if nothing is hit. Filtered to arena colliders only (not cars,
   * the ball, boost pads, or goal sensors) via `filterPredicate`, since
   * Rapier collision groups are not otherwise in use in this project.
   */
  public raycastArena(
    origin: { x: number; y: number; z: number },
    direction: { x: number; y: number; z: number },
    maxDistance: number
  ): number | null {
    const world = this.requireWorld();
    const ray = new RAPIER.Ray(origin, direction);
    // R1 (plan/RAMPS_AND_FEATURES_PLAN.md): compare by `.handle`, not
    // object identity — `Collider.parent()` constructs a fresh `RigidBody`
    // wrapper instance on every call (a rapier3d-compat wasm-binding
    // pattern), so `arenaBodies.includes(collider.parent())` always
    // returned `false` even for an arena collider's own body, making this
    // method return `null` unconditionally. Found via the new raycast
    // closure-sweep test — this method was previously never exercised by
    // any other code path (camera collision avoidance uses a different,
    // non-raycast height clamp instead) or test.
    const arenaBodyHandles = new Set(this.arenaBodies.map((body) => body.handle));

    const hit = world.castRay(
      ray,
      maxDistance,
      true,
      undefined,
      undefined,
      undefined,
      undefined,
      (collider) => {
        const parent = collider.parent();
        return parent !== null && arenaBodyHandles.has(parent.handle);
      }
    );

    return hit ? hit.timeOfImpact : null;
  }

  public clearGoalEvents(): void {
    this.goalEvents = [];
  }

  public dispose(): void {
    if (this.world) {
      this.boostPadSystem.dispose(this.world);
    }
    this.world?.free();
    this.world = null;
    this.carRegistry.clear();
    this.ballBody = null;
    this.arenaBodies = [];
    this.goalSensors = [];
    this.goalSensorOverlapping.clear();
    this.goalEvents = [];
    this.previousSnapshot.clear();
    this.currentSnapshot.clear();
    this.tick = 0;
    this.simulationTime = 0;
  }
}

function serializeCar(car: CarEntity): CarSerializableState {
  const position = car.body.translation();
  const rotation = car.body.rotation();
  const linvel = car.body.linvel();
  const angvel = car.body.angvel();
  const speed = Math.sqrt(linvel.x ** 2 + linvel.y ** 2 + linvel.z ** 2);

  const forward = V.applyQuaternion(V.LOCAL_FORWARD, rotation);
  const forwardSpeed = V.dot(linvel, forward);

  return {
    id: car.id,
    position: { x: position.x, y: position.y, z: position.z },
    rotation: { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w },
    linearVelocity: { x: linvel.x, y: linvel.y, z: linvel.z },
    angularVelocity: { x: angvel.x, y: angvel.y, z: angvel.z },
    speed,
    forwardSpeed,
    grounded: car.runtime.grounded,
    wheelContactCount: car.runtime.wheelContactCount,
    supportNormal: car.runtime.supportNormal,
    boostAmount: car.runtime.boostAmount,
    supersonic: speed >= RL_CONSTANTS.supersonicThreshold,
    firstJumpUsed: car.runtime.firstJumpUsed,
    secondJumpAvailable: car.runtime.secondJumpAvailable,
    dodgeState: car.runtime.dodgeState
  };
}

function serializeBall(body: RAPIER.RigidBody): BallSerializableState {
  const position = body.translation();
  const rotation = body.rotation();
  const linvel = body.linvel();
  const angvel = body.angvel();
  const speed = Math.sqrt(linvel.x ** 2 + linvel.y ** 2 + linvel.z ** 2);

  return {
    position: { x: position.x, y: position.y, z: position.z },
    rotation: { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w },
    linearVelocity: { x: linvel.x, y: linvel.y, z: linvel.z },
    angularVelocity: { x: angvel.x, y: angvel.y, z: angvel.z },
    speed
  };
}

function zeroTransform(): TransformSample {
  return {
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0, w: 1 }
  };
}

function structuredCloneParameters(): PhysicsParameters {
  return structuredCloneOf(DEFAULT_PHYSICS_PARAMETERS);
}

function structuredCloneOf<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
