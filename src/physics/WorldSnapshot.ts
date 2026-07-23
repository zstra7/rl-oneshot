import type { TeamId } from "@/core/TeamTypes";
import type { CarRuntimeState } from "@/physics/car/CarRuntimeState";
import type { CarId, CarInput, QuatLike, Vec3Like } from "@/physics/PhysicsTypes";

/**
 * S1 (online state-sync netcode): the COMPLETE mutable simulation state of
 * one peer's world, as a plain JSON-serializable object. The host captures
 * one of these every few ticks and streams it to the guest, which applies
 * it and replays its buffered inputs — so the guest always converges to
 * the host's authoritative reality instead of depending on bit-perfect
 * cross-machine determinism (the old lockstep's fatal fragility).
 *
 * "Complete" is the load-bearing word: everything `step()` reads must be
 * here — rigid-body transforms/velocities, the per-car controller runtime
 * (jump/dodge/boost/sticky state), the previous input (edge detection),
 * ball-contact and goal-sensor bookkeeping, and boost-pad timers. A field
 * missed here would make replayed ticks diverge from the host's.
 */
export interface CarNetSnapshot {
  readonly id: CarId;
  readonly position: Vec3Like;
  readonly rotation: QuatLike;
  readonly linearVelocity: Vec3Like;
  readonly angularVelocity: Vec3Like;
  readonly runtime: CarRuntimeState;
  readonly previousInput: CarInput;
  readonly touchingBall: boolean;
}

export interface BallNetSnapshot {
  readonly position: Vec3Like;
  readonly rotation: QuatLike;
  readonly linearVelocity: Vec3Like;
  readonly angularVelocity: Vec3Like;
}

export interface PadNetSnapshot {
  readonly active: boolean;
  readonly collectedAtTick: number | null;
  readonly respawnAtTick: number | null;
  readonly respawnTicksRemaining: number;
  readonly lastCollectedByCarId: CarId | null;
}

export interface WorldNetSnapshot {
  readonly tick: number;
  readonly simulationTime: number;
  readonly cars: readonly CarNetSnapshot[];
  readonly ball: BallNetSnapshot;
  /** Stable BoostPadId (insertion) order, matching the registry. */
  readonly pads: readonly PadNetSnapshot[];
  readonly goalOverlap: Readonly<Record<TeamId, boolean>>;
}
