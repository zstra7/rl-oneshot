import type { TeamId } from "@/core/TeamTypes";
import type { CarId } from "@/physics/PhysicsTypes";

/** game-flow spec section 28. */
export type MatchState =
  | "BOOT"
  | "MAIN_MENU"
  | "MATCH_SETUP"
  | "SETTINGS"
  | "MATCH_LOADING"
  | "KICKOFF_SETUP"
  | "COUNTDOWN_3"
  | "COUNTDOWN_2"
  | "COUNTDOWN_1"
  | "COUNTDOWN_GO"
  | "PLAYING"
  | "ZERO_SECOND_PLAY"
  | "GOAL_LATCHED"
  | "GOAL_CELEBRATION"
  | "KICKOFF_RESET"
  | "OVERTIME_INTRO"
  | "OVERTIME_PLAYING"
  | "MATCH_ENDING"
  | "MATCH_RESULTS"
  | "PAUSED";

export type MatchDurationMinutes = 1 | 3 | 10;

export interface MatchConfig {
  readonly durationMinutes: MatchDurationMinutes;
}

/** game-flow spec section 35. */
export interface GameSessionState {
  readonly matchState: MatchState;
  readonly selectedDurationMinutes: MatchDurationMinutes;
  readonly playerScore: number;
  readonly opponentScore: number;
  readonly regulationTimeRemaining: number;
  readonly overtimeElapsed: number;
  readonly pausedFromState: MatchState | null;
  readonly winner: TeamId | null;
}

/** game-flow spec section 3. */
export type MatchFlowEvent =
  | { type: "match-state-changed"; from: MatchState; to: MatchState }
  | { type: "countdown-step"; value: 3 | 2 | 1 | "GO" }
  | { type: "goal-awarded"; team: TeamId; scorerCarId?: CarId }
  | { type: "kickoff-reset-started" }
  | { type: "kickoff-reset-completed" }
  | { type: "overtime-started" }
  | { type: "match-ended"; winner: TeamId | null };
