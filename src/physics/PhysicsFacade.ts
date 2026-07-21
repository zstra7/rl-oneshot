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
  ResetWorldOptions,
  SpawnCarOptions,
  TransformSample,
  WorldSerializableState
} from "@/physics/PhysicsTypes";
import { NEUTRAL_CAR_INPUT, type CarControlProfile } from "@/physics/PhysicsTypes";
import { getArenaPresetDefinition } from "@/physics/arena/TestArenaPresets";
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

export const PHYSICS_MODULE_CONTRACT_VERSION = "2.1";

const DEFAULT_BALL_SPAWN = { x: 0, y: 8, z: 0 };
const DEFAULT_CAR_SPAWNS: Record<number, { x: number; y: number; z: number }> = {
  0: { x: -6, y: 1, z: -10 },
  1: { x: 6, y: 1, z: 10 }
};

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

    const definition = getArenaPresetDefinition(preset);

    for (const colliderSpec of definition.colliders) {
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(
          colliderSpec.translation.x,
          colliderSpec.translation.y,
          colliderSpec.translation.z
        )
      );

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

    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(options.transform.x, options.transform.y, options.transform.z)
        .setCanSleep(false)
        .setCcdEnabled(true)
        .setLinearDamping(0)
        .setAngularDamping(0)
    );

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
      options.carCreationOrder.forEach((carId, index) => {
        const spawn = DEFAULT_CAR_SPAWNS[index] ?? DEFAULT_CAR_SPAWNS[0];
        this.spawnCar({ id: carId, transform: spawn! });
      });
    }

    // physics spec section 21.9: kickoff reset restores every pad to
    // active and clears all pad timers/claim state.
    this.boostPadSystem.resetAllActive();
    this.boostPadSystem.clearEvents();

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

  public dispose(): void {
    if (this.world) {
      this.boostPadSystem.dispose(this.world);
    }
    this.world?.free();
    this.world = null;
    this.carRegistry.clear();
    this.ballBody = null;
    this.arenaBodies = [];
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
