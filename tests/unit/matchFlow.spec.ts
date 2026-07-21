import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MatchFlowController } from "@/game-flow/MatchFlowController";
import { PhysicsFacade } from "@/physics/PhysicsFacade";

/** Drives one fixed tick exactly the way GameRuntime.onFixedTick does. */
function tick(physics: PhysicsFacade, gameFlow: MatchFlowController): void {
  gameFlow.update();
  if (gameFlow.isPaused()) {
    return;
  }
  if (!gameFlow.areControlsActive()) {
    physics.clearAllInputs();
  }
  physics.step();
  gameFlow.applyPhysicsResults();
}

function scoreGoal(
  physics: PhysicsFacade,
  gameFlow: MatchFlowController,
  scoringTeam: "player" | "opponent"
): void {
  const defendingTeam = scoringTeam === "player" ? "opponent" : "player";
  const centre = physics.getGoalSensorCentre(defendingTeam)!;
  physics.setBallState({ position: centre, linearVelocity: { x: 0, y: 0, z: 0 } });
  // The sensor query only reflects a teleported ball from the second
  // world.step() onward (see docs/physics-deviations.md Phase 7 section).
  tick(physics, gameFlow);
  tick(physics, gameFlow);
}

const COUNTDOWN_TOTAL_TICKS = 120 + 120 + 120 + 90; // 3, 2, 1, GO

describe("MatchFlowController (game-flow spec sections 28-33)", () => {
  let physics: PhysicsFacade;
  let gameFlow: MatchFlowController;

  beforeEach(async () => {
    physics = new PhysicsFacade();
    await physics.initialise();
    gameFlow = new MatchFlowController();
    gameFlow.initialise({ physics });
  });

  afterEach(() => {
    physics.dispose();
  });

  it("boots into MAIN_MENU and navigates the menu states", () => {
    expect(gameFlow.getMatchState()).toBe("MAIN_MENU");
    gameFlow.openMatchSetup();
    expect(gameFlow.getMatchState()).toBe("MATCH_SETUP");
    gameFlow.openSettings();
    expect(gameFlow.getMatchState()).toBe("SETTINGS");
    gameFlow.openMainMenu();
    expect(gameFlow.getMatchState()).toBe("MAIN_MENU");
  });

  it("selectMatchDuration is retained through the countdown into PLAYING", () => {
    gameFlow.openMatchSetup();
    gameFlow.selectMatchDuration(10);
    gameFlow.startMatch();
    for (let i = 0; i < COUNTDOWN_TOTAL_TICKS; i += 1) {
      tick(physics, gameFlow);
    }
    expect(gameFlow.getMatchState()).toBe("PLAYING");
    expect(gameFlow.getSessionState().selectedDurationMinutes).toBe(10);
    expect(gameFlow.getSessionState().regulationTimeRemaining).toBeCloseTo(600, 0);
  });

  it("counts down 3 -> 2 -> 1 -> GO -> PLAYING with controls neutralised until GO", () => {
    gameFlow.openMatchSetup();
    gameFlow.selectMatchDuration(1);
    gameFlow.startMatch();
    expect(gameFlow.getMatchState()).toBe("COUNTDOWN_3");
    expect(gameFlow.areControlsActive()).toBe(false);

    const seenStates: string[] = [gameFlow.getMatchState()];
    for (let i = 0; i < COUNTDOWN_TOTAL_TICKS; i += 1) {
      tick(physics, gameFlow);
      const state = gameFlow.getMatchState();
      if (seenStates[seenStates.length - 1] !== state) {
        seenStates.push(state);
      }
    }

    expect(seenStates).toEqual([
      "COUNTDOWN_3",
      "COUNTDOWN_2",
      "COUNTDOWN_1",
      "COUNTDOWN_GO",
      "PLAYING"
    ]);
    expect(gameFlow.areControlsActive()).toBe(true);

    const countdownEvents = gameFlow
      .getMatchFlowEvents()
      .filter((e) => e.type === "countdown-step")
      .map((e) => (e as { value: unknown }).value);
    expect(countdownEvents).toEqual([3, 2, 1, "GO"]);
  });

  it("a goal increments score once, latches, celebrates, resets, and restarts the countdown", () => {
    gameFlow.openMatchSetup();
    gameFlow.selectMatchDuration(3);
    gameFlow.startMatch();
    for (let i = 0; i < COUNTDOWN_TOTAL_TICKS; i += 1) tick(physics, gameFlow);
    expect(gameFlow.getMatchState()).toBe("PLAYING");

    scoreGoal(physics, gameFlow, "player");
    expect(gameFlow.getMatchState()).toBe("GOAL_CELEBRATION");
    expect(gameFlow.getSessionState().playerScore).toBe(1);

    // Further overlap while still latched must not double-count.
    tick(physics, gameFlow);
    tick(physics, gameFlow);
    expect(gameFlow.getSessionState().playerScore).toBe(1);

    for (let i = 0; i < 264 + COUNTDOWN_TOTAL_TICKS + 5; i += 1) {
      tick(physics, gameFlow);
    }
    expect(gameFlow.getMatchState()).toBe("PLAYING");
    expect(gameFlow.getSessionState().playerScore).toBe(1);
  });

  it("pause freezes the clock and controls; resume restores the prior state", () => {
    gameFlow.openMatchSetup();
    gameFlow.selectMatchDuration(1);
    gameFlow.startMatch();
    for (let i = 0; i < COUNTDOWN_TOTAL_TICKS; i += 1) tick(physics, gameFlow);
    expect(gameFlow.getMatchState()).toBe("PLAYING");

    gameFlow.pause();
    expect(gameFlow.getMatchState()).toBe("PAUSED");
    expect(gameFlow.areControlsActive()).toBe(false);

    const remainingBefore = gameFlow.getSessionState().regulationTimeRemaining;
    for (let i = 0; i < 50; i += 1) tick(physics, gameFlow);
    expect(gameFlow.getSessionState().regulationTimeRemaining).toBe(remainingBefore);

    gameFlow.resume();
    expect(gameFlow.getMatchState()).toBe("PLAYING");
  });

  it("regulation clock reaching zero enters ZERO_SECOND_PLAY and keeps controls live", () => {
    gameFlow.openMatchSetup();
    gameFlow.selectMatchDuration(1);
    gameFlow.startMatch();
    for (let i = 0; i < COUNTDOWN_TOTAL_TICKS; i += 1) tick(physics, gameFlow);

    // Force the clock to zero on the next tick while the ball is airborne,
    // so the dead-ball rule does not fire the instant ZERO_SECOND_PLAY is
    // entered (an airborne ball is not yet a dead ball).
    (gameFlow as unknown as { regulationTimeRemaining: number }).regulationTimeRemaining = 0.001;
    physics.setBallState({ position: { x: 0, y: 10, z: 0 }, linearVelocity: { x: 0, y: 0, z: 0 } });
    tick(physics, gameFlow);

    expect(gameFlow.getMatchState()).toBe("ZERO_SECOND_PLAY");
    expect(gameFlow.areControlsActive()).toBe(true);
    expect(gameFlow.getSessionState().regulationTimeRemaining).toBe(0);
  });

  it("a tied dead ball enters overtime; the golden goal ends the match with no extra kickoff", () => {
    gameFlow.openMatchSetup();
    gameFlow.selectMatchDuration(1);
    gameFlow.startMatch();
    for (let i = 0; i < COUNTDOWN_TOTAL_TICKS; i += 1) tick(physics, gameFlow);

    // Ball is already resting at kickoff centre; forcing the clock to zero
    // makes the dead-ball rule fire on this very tick (scores tied).
    (gameFlow as unknown as { regulationTimeRemaining: number }).regulationTimeRemaining = 0.001;
    tick(physics, gameFlow);
    expect(gameFlow.getMatchState()).toBe("OVERTIME_INTRO");

    for (let i = 0; i < 200; i += 1) tick(physics, gameFlow);
    for (let i = 0; i < COUNTDOWN_TOTAL_TICKS; i += 1) tick(physics, gameFlow);
    expect(gameFlow.getMatchState()).toBe("OVERTIME_PLAYING");

    scoreGoal(physics, gameFlow, "opponent");
    expect(gameFlow.getMatchState()).toBe("GOAL_CELEBRATION");

    for (let i = 0; i < 264 + 5; i += 1) tick(physics, gameFlow);

    expect(gameFlow.getMatchState()).toBe("MATCH_RESULTS");
    expect(gameFlow.getSessionState().winner).toBe("opponent");
    expect(gameFlow.getSessionState().opponentScore).toBe(1);
    expect(gameFlow.getSessionState().playerScore).toBe(0);
  });

  it("replayMatch resets scores and clocks, then starts a fresh countdown", () => {
    gameFlow.openMatchSetup();
    gameFlow.selectMatchDuration(1);
    gameFlow.startMatch();
    for (let i = 0; i < COUNTDOWN_TOTAL_TICKS; i += 1) tick(physics, gameFlow);
    scoreGoal(physics, gameFlow, "player");
    for (let i = 0; i < 264 + COUNTDOWN_TOTAL_TICKS + 5; i += 1) tick(physics, gameFlow);
    expect(gameFlow.getMatchState()).toBe("PLAYING");
    expect(gameFlow.getSessionState().playerScore).toBe(1);

    // Regulation ends 1-0 (not tied) -> dead ball on a resting kickoff
    // ball ends the match directly, no overtime needed.
    (gameFlow as unknown as { regulationTimeRemaining: number }).regulationTimeRemaining = 0.001;
    tick(physics, gameFlow);
    expect(gameFlow.getMatchState()).toBe("MATCH_RESULTS");
    expect(gameFlow.getSessionState().winner).toBe("player");

    gameFlow.replayMatch();
    expect(gameFlow.getSessionState().playerScore).toBe(0);
    expect(gameFlow.getSessionState().opponentScore).toBe(0);
    expect(gameFlow.getMatchState()).toBe("COUNTDOWN_3");

    for (let i = 0; i < COUNTDOWN_TOTAL_TICKS; i += 1) tick(physics, gameFlow);
    expect(gameFlow.getMatchState()).toBe("PLAYING");
    expect(gameFlow.getSessionState().regulationTimeRemaining).toBeCloseTo(60, 0);
  });

  it("returnToMenu resets the session and goes back to MAIN_MENU", () => {
    gameFlow.openMatchSetup();
    gameFlow.selectMatchDuration(1);
    gameFlow.startMatch();
    for (let i = 0; i < COUNTDOWN_TOTAL_TICKS; i += 1) tick(physics, gameFlow);
    scoreGoal(physics, gameFlow, "player");

    gameFlow.returnToMenu();
    expect(gameFlow.getMatchState()).toBe("MAIN_MENU");
    expect(gameFlow.getSessionState().playerScore).toBe(0);
  });
});
