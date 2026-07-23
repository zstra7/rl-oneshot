import type { BallSerializableState } from "@/physics/PhysicsTypes";
import type { PhysicsFacade } from "@/physics/PhysicsFacade";
import { RL_CONSTANTS } from "@/physics/PhysicsConstants";
import { otherTeam, type TeamId } from "@/core/TeamTypes";
import {
  BALL_FLOOR_CONTACT_HEIGHT_TOLERANCE,
  BALL_FLOOR_CONTACT_MAX_VERTICAL_SPEED,
  COUNTDOWN_GO_TICKS,
  COUNTDOWN_STEP_TICKS,
  DEFAULT_MATCH_DURATION_MINUTES,
  GOAL_CELEBRATION_TICKS,
  OPPONENT_CAR_ID,
  OVERTIME_INTRO_TICKS,
  PLAYER_CAR_ID
} from "@/game-flow/MatchFlowConstants";
import type {
  GameSessionState,
  MatchConfig,
  MatchDurationMinutes,
  MatchFlowEvent,
  MatchState
} from "@/game-flow/MatchFlowTypes";

export interface MatchFlowInitOptions {
  readonly physics: PhysicsFacade;
}

const CONTROLS_ACTIVE_STATES: readonly MatchState[] = [
  "PLAYING",
  "ZERO_SECOND_PLAY",
  "OVERTIME_PLAYING"
];

const MENU_STATES: readonly MatchState[] = [
  "MAIN_MENU",
  "MATCH_SETUP",
  "SETTINGS",
  "CAR_CUSTOMISE",
  "TOURNAMENT_BRACKET",
  "TOURNAMENT_VICTORY"
];

// R6 (plan/RAMPS_AND_FEATURES_PLAN.md): goal-scored blast radius/strength.
// F14 (plan/ARENA_FLUSH_AND_REFINEMENTS_PLAN.md): "big + strong" locked
// decision — most of the defending third gets visibly thrown, not just
// cars parked right at the goal mouth.
const GOAL_BLAST_RADIUS = 26;
const GOAL_BLAST_MAX_DELTA_V = 30;

const PAUSABLE_STATES: readonly MatchState[] = [
  "PLAYING",
  "ZERO_SECOND_PLAY",
  "OVERTIME_PLAYING"
];

/** WS7.A-2: mirrors PhysicsFacade's KICKOFF_VARIANTS length (5 RL-style kickoff spots). */
const KICKOFF_VARIANT_COUNT = 5;

/**
 * Owns `MatchState` (game-flow spec section 28): the one authority for
 * match/session state transitions. UI requests actions through this
 * controller's public methods; it never assigns state directly. Physics
 * remains the sole owner of rigid bodies and raw goal-sensor overlap
 * facts (`GoalScoredEvent`) — this controller applies the scoring rules,
 * latch, and state-machine reaction to those facts (spec section 30).
 */
export class MatchFlowController {
  private physics: PhysicsFacade | null = null;

  private matchState: MatchState = "BOOT";
  private selectedDurationMinutes: MatchDurationMinutes = DEFAULT_MATCH_DURATION_MINUTES;

  private playerScore = 0;
  private opponentScore = 0;
  private regulationTimeRemaining = DEFAULT_MATCH_DURATION_MINUTES * 60;
  private overtimeElapsed = 0;
  private winner: TeamId | null = null;

  private goalLatch = false;
  private pausedFromState: MatchState | null = null;

  private countdownTicksRemaining = 0;
  private countdownPostGoState: "PLAYING" | "OVERTIME_PLAYING" = "PLAYING";
  private celebrationTicksRemaining = 0;
  private celebrationLeadsToMatchEnd = false;
  private overtimeIntroTicksRemaining = 0;
  /** WS7.A-2: which of the 5 kickoff spots comes next (round-robin). */
  private kickoffCounter = 0;

  private readonly events: MatchFlowEvent[] = [];

  public initialise(options: MatchFlowInitOptions): void {
    this.physics = options.physics;
    this.setMatchState("MAIN_MENU");
  }

  public dispose(): void {
    this.physics = null;
  }

  private requirePhysics(): PhysicsFacade {
    if (!this.physics) {
      throw new Error("MatchFlowController.initialise() must complete before use.");
    }
    return this.physics;
  }

  // -- Queries --------------------------------------------------------

  public getMatchState(): MatchState {
    return this.matchState;
  }

  public getSessionState(): GameSessionState {
    return {
      matchState: this.matchState,
      selectedDurationMinutes: this.selectedDurationMinutes,
      playerScore: this.playerScore,
      opponentScore: this.opponentScore,
      regulationTimeRemaining: this.regulationTimeRemaining,
      overtimeElapsed: this.overtimeElapsed,
      pausedFromState: this.pausedFromState,
      winner: this.winner
    };
  }

  public isPaused(): boolean {
    return this.matchState === "PAUSED";
  }

  public areControlsActive(): boolean {
    return CONTROLS_ACTIVE_STATES.includes(this.matchState);
  }

  public getMatchFlowEvents(): readonly MatchFlowEvent[] {
    return this.events;
  }

  public clearMatchFlowEvents(): void {
    this.events.length = 0;
  }

  // -- Navigation -------------------------------------------------------

  public openMainMenu(): void {
    if (MENU_STATES.includes(this.matchState) || this.matchState === "MATCH_RESULTS" || this.matchState === "BOOT") {
      this.setMatchState("MAIN_MENU");
    }
  }

  public openMatchSetup(): void {
    if (MENU_STATES.includes(this.matchState)) {
      this.setMatchState("MATCH_SETUP");
    }
  }

  public openSettings(): void {
    if (MENU_STATES.includes(this.matchState)) {
      this.setMatchState("SETTINGS");
    }
  }

  /** R12: only reachable from the main menu, mirroring openSettings' MENU_STATES gate but scoped tighter per the plan. */
  public openCarCustomise(): void {
    if (this.matchState === "MAIN_MENU") {
      this.setMatchState("CAR_CUSTOMISE");
    }
  }

  /** R13: legal from the main menu (fresh TOURNAMENT entry) or from a tournament match's results screen (CONTINUE routing back to the ladder). */
  public openTournamentBracket(): void {
    if (this.matchState === "MAIN_MENU" || this.matchState === "MATCH_RESULTS") {
      this.setMatchState("TOURNAMENT_BRACKET");
    }
  }

  /** R13: only reachable from a tournament match's results screen, once the ladder has reached "champion". */
  public openTournamentVictory(): void {
    if (this.matchState === "MATCH_RESULTS") {
      this.setMatchState("TOURNAMENT_VICTORY");
    }
  }

  public selectMatchDuration(minutes: MatchDurationMinutes): void {
    this.selectedDurationMinutes = minutes;
  }

  public startMatch(config?: Partial<MatchConfig>): void {
    // R13: TOURNAMENT_BRACKET's PLAY NEXT GAME starts a match directly
    // from the bracket screen, mirroring MATCH_SETUP/MAIN_MENU's existing
    // legal start states.
    if (
      this.matchState !== "MATCH_SETUP" &&
      this.matchState !== "MAIN_MENU" &&
      this.matchState !== "TOURNAMENT_BRACKET"
    ) {
      return;
    }

    if (config?.durationMinutes) {
      this.selectedDurationMinutes = config.durationMinutes;
    }

    this.playerScore = 0;
    this.opponentScore = 0;
    this.overtimeElapsed = 0;
    this.winner = null;
    this.regulationTimeRemaining = this.selectedDurationMinutes * 60;
    this.kickoffCounter = 0;

    this.setMatchState("MATCH_LOADING");
    // Procedural assets are already resident (Phase 2); there is no real
    // async loading step yet (Phase 11/12 authored-asset intake may add
    // one), so this transition is instantaneous.
    this.setMatchState("KICKOFF_SETUP");
    this.beginKickoffReset("PLAYING");
  }

  // -- Per-tick updates -------------------------------------------------

  /** Called once per fixed tick, before `physics.step()` (spec section 34). */
  public update(): void {
    if (this.isPaused()) {
      return;
    }

    switch (this.matchState) {
      case "COUNTDOWN_3":
      case "COUNTDOWN_2":
      case "COUNTDOWN_1":
      case "COUNTDOWN_GO":
        this.tickCountdown();
        break;
      case "PLAYING":
        this.tickRegulationClock();
        break;
      case "GOAL_CELEBRATION":
        this.tickCelebration();
        break;
      case "OVERTIME_INTRO":
        this.tickOvertimeIntro();
        break;
      case "OVERTIME_PLAYING":
        this.overtimeElapsed += RL_CONSTANTS.physicsDt;
        break;
      default:
        break;
    }
  }

  /** Called once per fixed tick, after `physics.step()` (spec section 34). */
  public applyPhysicsResults(): void {
    if (this.isPaused()) {
      return;
    }

    const physics = this.requirePhysics();

    if (
      !this.goalLatch &&
      (this.matchState === "PLAYING" ||
        this.matchState === "ZERO_SECOND_PLAY" ||
        this.matchState === "OVERTIME_PLAYING")
    ) {
      const goalEvents = physics.getGoalEvents();
      if (goalEvents.length > 0) {
        this.processGoal(goalEvents[0]!.scoringTeam);
      }
    }
    physics.clearGoalEvents();

    if (this.matchState === "ZERO_SECOND_PLAY") {
      this.checkZeroSecondDeadBall(physics.getBallState());
    }
  }

  private tickCountdown(): void {
    this.countdownTicksRemaining -= 1;
    if (this.countdownTicksRemaining > 0) {
      return;
    }

    switch (this.matchState) {
      case "COUNTDOWN_3":
        this.enterCountdownStep("COUNTDOWN_2", 2, COUNTDOWN_STEP_TICKS);
        break;
      case "COUNTDOWN_2":
        this.enterCountdownStep("COUNTDOWN_1", 1, COUNTDOWN_STEP_TICKS);
        break;
      case "COUNTDOWN_1":
        this.enterCountdownStep("COUNTDOWN_GO", "GO", COUNTDOWN_GO_TICKS);
        break;
      case "COUNTDOWN_GO":
        this.setMatchState(this.countdownPostGoState);
        break;
      default:
        break;
    }
  }

  private enterCountdownStep(state: MatchState, value: 3 | 2 | 1 | "GO", ticks: number): void {
    this.countdownTicksRemaining = ticks;
    this.setMatchState(state);
    this.pushEvent({ type: "countdown-step", value });
  }

  private tickRegulationClock(): void {
    this.regulationTimeRemaining -= RL_CONSTANTS.physicsDt;
    if (this.regulationTimeRemaining <= 0) {
      this.regulationTimeRemaining = 0;
      this.setMatchState("ZERO_SECOND_PLAY");
    }
  }

  private checkZeroSecondDeadBall(ball: BallSerializableState): void {
    const heightAboveFloor = ball.position.y - RL_CONSTANTS.ballRadius;
    const deadBall =
      heightAboveFloor <= BALL_FLOOR_CONTACT_HEIGHT_TOLERANCE &&
      Math.abs(ball.linearVelocity.y) <= BALL_FLOOR_CONTACT_MAX_VERTICAL_SPEED;

    if (!deadBall) {
      return;
    }

    if (this.playerScore !== this.opponentScore) {
      this.beginMatchEnding();
    } else {
      this.beginOvertimeIntro();
    }
  }

  private processGoal(scoringTeam: TeamId): void {
    this.goalLatch = true;

    // R6 (plan/RAMPS_AND_FEATURES_PLAN.md): a demolition-style shockwave
    // on the scored-on goal, throwing nearby cars away from the mouth.
    const goalCentre = this.requirePhysics().getGoalSensorCentre(otherTeam(scoringTeam));
    if (goalCentre) {
      this.requirePhysics().applyRadialCarImpulse(goalCentre, GOAL_BLAST_RADIUS, GOAL_BLAST_MAX_DELTA_V);
    }

    if (scoringTeam === "player") {
      this.playerScore += 1;
    } else {
      this.opponentScore += 1;
    }

    this.pushEvent({ type: "goal-awarded", team: scoringTeam });

    const wasOvertime = this.matchState === "OVERTIME_PLAYING";

    this.setMatchState("GOAL_LATCHED");
    this.celebrationLeadsToMatchEnd = wasOvertime;
    this.celebrationTicksRemaining = GOAL_CELEBRATION_TICKS;
    this.setMatchState("GOAL_CELEBRATION");
  }

  private tickCelebration(): void {
    this.celebrationTicksRemaining -= 1;
    if (this.celebrationTicksRemaining > 0) {
      return;
    }

    this.goalLatch = false;

    if (this.celebrationLeadsToMatchEnd) {
      // game-flow spec section 32: overtime's first goal ends the match
      // directly, with no additional kickoff.
      this.beginMatchEnding();
    } else {
      this.beginKickoffReset("PLAYING");
    }
  }

  private beginKickoffReset(postCountdownState: "PLAYING" | "OVERTIME_PLAYING"): void {
    this.setMatchState("KICKOFF_RESET");
    this.pushEvent({ type: "kickoff-reset-started" });

    // WS7.A-2 (plan/POLISH_OVERHAUL_PLAN.md): round-robin through the 5
    // RL-style kickoff spots — deterministic (no RNG), reset per match
    // in startMatch().
    this.requirePhysics().resetWorld({
      carCreationOrder: [PLAYER_CAR_ID, OPPONENT_CAR_ID],
      kickoffVariantIndex: this.kickoffCounter % KICKOFF_VARIANT_COUNT
    });
    this.kickoffCounter += 1;

    this.pushEvent({ type: "kickoff-reset-completed" });

    this.countdownPostGoState = postCountdownState;
    this.countdownTicksRemaining = COUNTDOWN_STEP_TICKS;
    this.setMatchState("COUNTDOWN_3");
    this.pushEvent({ type: "countdown-step", value: 3 });
  }

  private beginOvertimeIntro(): void {
    this.setMatchState("OVERTIME_INTRO");
    this.overtimeIntroTicksRemaining = OVERTIME_INTRO_TICKS;
    this.overtimeElapsed = 0;
    this.pushEvent({ type: "overtime-started" });
  }

  private tickOvertimeIntro(): void {
    this.overtimeIntroTicksRemaining -= 1;
    if (this.overtimeIntroTicksRemaining <= 0) {
      this.beginKickoffReset("OVERTIME_PLAYING");
    }
  }

  private beginMatchEnding(): void {
    this.setMatchState("MATCH_ENDING");

    this.winner =
      this.playerScore === this.opponentScore
        ? null
        : this.playerScore > this.opponentScore
          ? "player"
          : "opponent";

    this.pushEvent({ type: "match-ended", winner: this.winner });
    this.setMatchState("MATCH_RESULTS");
  }

  // -- Pause / results ----------------------------------------------------

  public pause(): void {
    if (!PAUSABLE_STATES.includes(this.matchState)) {
      return;
    }
    this.pausedFromState = this.matchState;
    this.setMatchState("PAUSED");
  }

  public resume(): void {
    if (this.matchState !== "PAUSED" || !this.pausedFromState) {
      return;
    }
    const from = this.pausedFromState;
    this.pausedFromState = null;
    this.setMatchState(from);
  }

  /** Pause menu "RESTART MATCH": same duration, fresh scores/clock, immediate kickoff. */
  public restartMatch(): void {
    if (this.matchState !== "PAUSED" && !PAUSABLE_STATES.includes(this.matchState)) {
      return;
    }

    this.pausedFromState = null;
    this.playerScore = 0;
    this.opponentScore = 0;
    this.overtimeElapsed = 0;
    this.winner = null;
    this.goalLatch = false;
    this.regulationTimeRemaining = this.selectedDurationMinutes * 60;
    this.kickoffCounter = 0;
    this.beginKickoffReset("PLAYING");
  }

  public replayMatch(): void {
    if (this.matchState !== "MATCH_RESULTS") {
      return;
    }

    this.playerScore = 0;
    this.opponentScore = 0;
    this.overtimeElapsed = 0;
    this.winner = null;
    this.regulationTimeRemaining = this.selectedDurationMinutes * 60;
    this.kickoffCounter = 0;

    this.setMatchState("MATCH_LOADING");
    this.setMatchState("KICKOFF_SETUP");
    this.beginKickoffReset("PLAYING");
  }

  public returnToMenu(): void {
    this.playerScore = 0;
    this.opponentScore = 0;
    this.overtimeElapsed = 0;
    this.winner = null;
    this.goalLatch = false;
    this.pausedFromState = null;
    this.regulationTimeRemaining = this.selectedDurationMinutes * 60;
    this.setMatchState("MAIN_MENU");
  }

  // -- Internal -------------------------------------------------------

  private setMatchState(next: MatchState): void {
    const previous = this.matchState;
    if (previous === next) {
      return;
    }
    this.matchState = next;
    this.pushEvent({ type: "match-state-changed", from: previous, to: next });
  }

  private pushEvent(event: MatchFlowEvent): void {
    this.events.push(event);
  }
}
