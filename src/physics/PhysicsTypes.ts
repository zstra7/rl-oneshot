export type CarId = string;

export interface Vec3Like {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface QuatLike {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
}

/**
 * Normalised per-tick input (physics spec section 14.1). Stored/edge-
 * tracked from Phase 3 onward; the ground/air controllers that actually
 * consume most of these fields land in Phase 5.
 */
export interface CarInput {
  throttle: number;
  steer: number;
  pitch: number;
  yaw: number;
  roll: number;

  jump: boolean;
  boost: boolean;
  powerslide: boolean;
}

export const NEUTRAL_CAR_INPUT: CarInput = {
  throttle: 0,
  steer: 0,
  pitch: 0,
  yaw: 0,
  roll: 0,
  jump: false,
  boost: false,
  powerslide: false
};

export interface CarSerializableState {
  readonly id: CarId;

  readonly position: Vec3Like;
  readonly rotation: QuatLike;
  readonly linearVelocity: Vec3Like;
  readonly angularVelocity: Vec3Like;

  readonly speed: number;
}

export interface BallSerializableState {
  readonly position: Vec3Like;
  readonly rotation: QuatLike;
  readonly linearVelocity: Vec3Like;
  readonly angularVelocity: Vec3Like;
  readonly speed: number;
}

export interface WorldSerializableState {
  readonly tick: number;
  readonly simulationTime: number;
  readonly cars: readonly CarSerializableState[];
  readonly ball: BallSerializableState;
}

export type ArenaPreset = "flat-plane" | "box-arena";

export interface SpawnCarOptions {
  readonly id: CarId;
  readonly transform: Vec3Like;
  readonly initialBoost?: number;
}

export interface ResetWorldOptions {
  readonly carCreationOrder?: readonly CarId[];
  readonly arenaPreset?: ArenaPreset;
}

/** One entity transform sample, used for render interpolation. */
export interface TransformSample {
  position: Vec3Like;
  rotation: QuatLike;
}

export interface PhysicsRenderSnapshot {
  readonly cars: ReadonlyMap<CarId, TransformSample>;
  readonly ball: TransformSample;
}
