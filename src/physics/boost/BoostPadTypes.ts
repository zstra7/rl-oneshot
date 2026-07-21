import type { CarId, Vec3Like } from "@/physics/PhysicsTypes";

export type BoostPadType = "small" | "full";
export type BoostPadId = string;

export const BOOST_PAD_CONSTANTS = {
  smallPickupAmount: 12,
  smallRespawnSeconds: 4,
  fullRespawnSeconds: 10,
  maximumBoostAmount: 100,
  boostFullEpsilon: 0.001
} as const;

export const SMALL_PAD_SENSOR = {
  pickupRadius: 0.95,
  pickupHalfHeight: 0.75
} as const;

export const FULL_PAD_SENSOR = {
  pickupRadius: 1.35,
  pickupHalfHeight: 0.9
} as const;

export interface BoostPadDefinition {
  readonly id: BoostPadId;
  readonly type: BoostPadType;
  readonly position: Vec3Like;
  readonly pickupRadius: number;
  readonly pickupHalfHeight: number;
}

export interface BoostPadRuntimeState {
  id: BoostPadId;
  type: BoostPadType;
  active: boolean;
  collectedAtTick: number | null;
  respawnAtTick: number | null;
  respawnTicksRemaining: number;
  lastCollectedByCarId: CarId | null;
}

export interface BoostPadObservation {
  readonly id: BoostPadId;
  readonly type: BoostPadType;
  readonly position: Vec3Like;
  readonly active: boolean;
  readonly respawnSecondsRemaining: number;
  readonly pickupAmount: number;
}

export interface BoostPadClaim {
  readonly padId: BoostPadId;
  readonly carId: CarId;
  readonly distanceSquared: number;
  readonly velocityTowardPad: number;
}

export interface BoostPadCollectedEvent {
  readonly type: "boost-pad-collected";
  readonly tick: number;
  readonly padId: BoostPadId;
  readonly padType: BoostPadType;
  readonly carId: CarId;
  readonly boostBefore: number;
  readonly boostAfter: number;
  readonly boostGranted: number;
  readonly respawnAtTick: number;
}

export interface BoostPadRespawnedEvent {
  readonly type: "boost-pad-respawned";
  readonly tick: number;
  readonly padId: BoostPadId;
  readonly padType: BoostPadType;
}

export type BoostPadEvent = BoostPadCollectedEvent | BoostPadRespawnedEvent;

export function pickupAmountFor(type: BoostPadType): number {
  return type === "full"
    ? BOOST_PAD_CONSTANTS.maximumBoostAmount
    : BOOST_PAD_CONSTANTS.smallPickupAmount;
}

export function respawnTicksFor(type: BoostPadType, physicsHz: number): number {
  const seconds =
    type === "full"
      ? BOOST_PAD_CONSTANTS.fullRespawnSeconds
      : BOOST_PAD_CONSTANTS.smallRespawnSeconds;
  return seconds * physicsHz;
}
