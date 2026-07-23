import type { TeamId } from "@/core/TeamTypes";
import type { Vec3Like } from "@/physics/PhysicsTypes";

/**
 * Goal-mouth dimensions (game-flow spec section 4/12/14): kept as the
 * spec's literal values even though this project's test-arena field
 * footprint (physics spec section 13, `TEST_ARENA_DIMENSIONS`) is smaller
 * than the game-flow spec's 72x48 stadium — see
 * docs/physics-deviations.md Phase 7 section. The goal still fits well
 * inside the smaller field (goal width 14 < field width 40, goal height
 * 6 < interior height 20).
 */
export const GOAL_HALF_WIDTH = 7;
export const GOAL_HEIGHT = 6;
export const GOAL_DEPTH = 5;

export interface GoalSensorDefinition {
  /** The team that defends this goal — the *other* team scores by entering it. */
  readonly defendingTeam: TeamId;
  readonly centre: Vec3Like;
  readonly halfExtents: Vec3Like;
}

/**
 * Raw physics-owned fact (game-flow spec section 2: "physics module owns
 * ... Goal sensor overlap facts"): the ball entered a goal sensor volume
 * on this tick, having not been overlapping it the tick before. Physics
 * does not know about match state, latches, or scoring rules — that is
 * game-flow's job (spec section 30).
 */
export interface GoalScoredEvent {
  readonly type: "goal-scored";
  readonly scoringTeam: TeamId;
  readonly tick: number;
}
