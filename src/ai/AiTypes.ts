import type { MatchState } from "@/game-flow/MatchFlowTypes";
import type { BoostPadObservation } from "@/physics/boost/BoostPadTypes";
import type { BallSerializableState, CarSerializableState, Vec3Like } from "@/physics/PhysicsTypes";

/**
 * Trimmed from the full AI spec section 3 `AiUpdateContext` to what
 * Phase 9's ground-only behaviour tree actually needs — no
 * `recentPhysicsEvents` (no canonical `PhysicsEvent` stream exists yet,
 * see docs/physics-deviations.md) and no `AiMatchContext.scoreFor/
 * scoreAgainst`/time fields (score/time awareness is AI spec section 35,
 * Phase 10 scope).
 */
export interface AiUpdateContext {
  readonly tick: number;
  readonly matchState: MatchState;

  readonly controlledCar: CarSerializableState;
  readonly humanCar: CarSerializableState;
  readonly ball: BallSerializableState;
  readonly boostPads: readonly BoostPadObservation[];

  readonly ownGoalCentre: Vec3Like;
  readonly targetGoalCentre: Vec3Like;
}

export type AiTacticalMode =
  | "recover"
  | "kickoff"
  | "defend"
  | "clear"
  | "attack"
  | "collect-boost"
  | "retreat";

export interface AiDebugState {
  readonly mode: AiTacticalMode;
  readonly targetPosition: Vec3Like;
}
