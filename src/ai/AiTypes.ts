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

/**
 * WS6 (plan/POLISH_OVERHAUL_PLAN.md) simplified the planner to a single
 * chase-and-shoot mode (looping around the ball is still tagged
 * "attack" — it's the same maneuver with a different target) plus
 * "unstuck", replacing the old defend/clear/collect-boost/retreat set.
 */
export type AiTacticalMode = "recover" | "kickoff" | "attack" | "unstuck";

export interface AiDebugState {
  readonly mode: AiTacticalMode;
  readonly targetPosition: Vec3Like;
}
