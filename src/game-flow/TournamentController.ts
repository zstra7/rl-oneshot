import type { AiDifficulty } from "@/ai/AiDifficulty";
import type { TeamId } from "@/core/TeamTypes";
import { DEFAULT_MATCH_DURATION_MINUTES } from "@/game-flow/MatchFlowConstants";
import type { MatchDurationMinutes } from "@/game-flow/MatchFlowTypes";

/** R13 (plan/RAMPS_AND_FEATURES_PLAN.md): one tournament ladder round. */
export interface TournamentRound {
  readonly opponentName: string;
  readonly difficulty: AiDifficulty;
}

/** Fixed 4-round ladder, easy -> legend, the last round being the final. */
export const TOURNAMENT_ROUNDS: readonly TournamentRound[] = [
  { opponentName: "ROOKIE ROVERS", difficulty: "easy" },
  { opponentName: "PRO PATROL", difficulty: "medium" },
  { opponentName: "ALL-STAR ARSENAL", difficulty: "hard" },
  { opponentName: "LEGEND LYNX", difficulty: "legend" }
];

export type TournamentPhase = "setup" | "bracket" | "in-match" | "eliminated" | "champion";

export interface TournamentPublicState {
  readonly active: boolean;
  readonly phase: TournamentPhase;
  /** 0..TOURNAMENT_ROUNDS.length-1 */
  readonly currentRound: number;
  readonly durationMinutes: MatchDurationMinutes;
  /** length === TOURNAMENT_ROUNDS.length */
  readonly results: readonly ("win" | "loss" | null)[];
  readonly rounds: readonly TournamentRound[];
}

function emptyResults(): ("win" | "loss" | null)[] {
  return TOURNAMENT_ROUNDS.map(() => null);
}

/**
 * R13: tournament ladder state machine. Deliberately has zero engine
 * dependencies (no PhysicsFacade, no MatchFlowController) so it is fully
 * unit-testable in isolation (tests/unit/tournament.spec.ts) — GameRuntime
 * owns wiring this into real match starts/AI difficulty/session sync.
 * Session-only: nothing here is persisted to localStorage, so a page
 * refresh mid-tournament abandons it (see docs/build-decisions.md).
 */
export class TournamentController {
  private active = false;
  private phase: TournamentPhase = "setup";
  private currentRound = 0;
  private durationMinutes: MatchDurationMinutes = DEFAULT_MATCH_DURATION_MINUTES;
  private results: ("win" | "loss" | null)[] = emptyResults();

  /** Menu -> TOURNAMENT: opens the setup screen. */
  public enter(): void {
    this.active = true;
    this.phase = "setup";
    this.currentRound = 0;
    this.durationMinutes = DEFAULT_MATCH_DURATION_MINUTES;
    this.results = emptyResults();
  }

  /** Setup screen's BEGIN TOURNAMENT: locks in duration, opens the bracket at round 0. */
  public begin(duration: MatchDurationMinutes): void {
    this.active = true;
    this.durationMinutes = duration;
    this.currentRound = 0;
    this.results = emptyResults();
    this.phase = "bracket";
  }

  /** Bracket's PLAY NEXT GAME: returns the round config for GameRuntime to apply. */
  public startNextMatch(): TournamentRound {
    this.phase = "in-match";
    return TOURNAMENT_ROUNDS[this.currentRound]!;
  }

  /**
   * Called once, edge-detected, when the live match this round started
   * reaches MATCH_RESULTS. Idempotent: once `phase` has moved off
   * "in-match" for this round, a second call is a no-op rather than
   * double-advancing the ladder. A null winner (should not happen in
   * practice — overtime always produces a winner) is treated as a loss.
   */
  public recordMatchResult(winner: TeamId | null): void {
    if (this.phase !== "in-match") {
      return;
    }

    const won = winner === "player";
    this.results[this.currentRound] = won ? "win" : "loss";

    if (!won) {
      this.phase = "eliminated";
      return;
    }

    if (this.currentRound === TOURNAMENT_ROUNDS.length - 1) {
      this.phase = "champion";
    } else {
      this.currentRound += 1;
      this.phase = "bracket";
    }
  }

  /** Full reset back to inactive — the tournament LEAVE buttons and the abandonment safety net both call this. */
  public leave(): void {
    this.active = false;
    this.phase = "setup";
    this.currentRound = 0;
    this.durationMinutes = DEFAULT_MATCH_DURATION_MINUTES;
    this.results = emptyResults();
  }

  public getPublicState(): TournamentPublicState {
    return {
      active: this.active,
      phase: this.phase,
      currentRound: this.currentRound,
      durationMinutes: this.durationMinutes,
      results: [...this.results],
      rounds: TOURNAMENT_ROUNDS
    };
  }
}
