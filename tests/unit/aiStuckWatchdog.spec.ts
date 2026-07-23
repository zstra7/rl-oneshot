import { describe, expect, it } from "vitest";

import { MatchFlowController } from "@/game-flow/MatchFlowController";
import { OPPONENT_CAR_ID, PLAYER_CAR_ID } from "@/game-flow/MatchFlowConstants";
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

const COUNTDOWN_TOTAL_TICKS = 120 + 120 + 120 + 90;

/**
 * F13 (plan/ARENA_FLUSH_AND_REFINEMENTS_PLAN.md): if the opponent car
 * hasn't moved in AI_STUCK_WINDOW_TICKS (4s — deliberately longer than
 * aiUnstuck.spec.ts's 3s no-movement bound, so that test still gates the
 * AI's own steering-based escape), teleport it back to a safe kickoff
 * pose rather than leave it wedged forever.
 */
describe("AI stuck watchdog (MatchFlowController)", () => {
  function startedMatch(physics: PhysicsFacade): MatchFlowController {
    const gameFlow = new MatchFlowController();
    gameFlow.initialise({ physics });
    gameFlow.openMatchSetup();
    gameFlow.startMatch();
    for (let i = 0; i < COUNTDOWN_TOTAL_TICKS; i += 1) {
      tick(physics, gameFlow);
    }
    expect(gameFlow.getMatchState()).toBe("PLAYING");
    return gameFlow;
  }

  it("teleports a parked opponent car back to a kickoff pose after 4s of no movement", async () => {
    const physics = new PhysicsFacade();
    await physics.initialise();
    const gameFlow = startedMatch(physics);

    // Park the opponent far from any kickoff spot with no input ever set
    // for it, and the ball parked out of its way too.
    physics.setCarState(OPPONENT_CAR_ID, {
      position: { x: 15, y: 0.4, z: 15 },
      linearVelocity: { x: 0, y: 0, z: 0 }
    });
    physics.setBallState({ position: { x: -15, y: 1, z: -15 }, linearVelocity: { x: 0, y: 0, z: 0 } });

    for (let i = 0; i < 490; i += 1) {
      tick(physics, gameFlow);
    }

    const finalPosition = physics.getCarState(OPPONENT_CAR_ID).position;
    const distanceFromParkedSpot = Math.hypot(finalPosition.x - 15, finalPosition.z - 15);
    expect(distanceFromParkedSpot).toBeGreaterThan(5);
    // Teleported to a real kickoff-style pose: near the opponent half,
    // roughly upright, no residual velocity.
    const finalState = physics.getCarState(OPPONENT_CAR_ID);
    const finalVelocity = Math.hypot(finalState.linearVelocity.x, finalState.linearVelocity.z);
    expect(finalVelocity).toBeLessThan(0.5);

    physics.dispose();
  });

  it("never teleports a car that's actually driving (no false positives)", async () => {
    const physics = new PhysicsFacade();
    await physics.initialise();
    const gameFlow = startedMatch(physics);

    physics.setCarInput(OPPONENT_CAR_ID, { throttle: 1, steer: 0.2 });

    let maxSingleTickJump = 0;
    let previous = physics.getCarState(OPPONENT_CAR_ID).position;
    for (let i = 0; i < 600; i += 1) {
      tick(physics, gameFlow);
      const current = physics.getCarState(OPPONENT_CAR_ID).position;
      const jump = Math.hypot(current.x - previous.x, current.z - previous.z);
      maxSingleTickJump = Math.max(maxSingleTickJump, jump);
      previous = current;
    }

    // A teleport reset is a large single-tick jump; ordinary driving
    // (even at speed) never moves more than a fraction of a metre in a
    // single 1/120s tick.
    expect(maxSingleTickJump).toBeLessThan(1.0);

    physics.dispose();
  });

  it("the stuck window resets on a kickoff, so a fresh kickoff doesn't inherit prior idle time", async () => {
    const physics = new PhysicsFacade();
    await physics.initialise();
    const gameFlow = startedMatch(physics);

    // Park the opponent for 300 ticks (well under the 480-tick window).
    physics.setCarState(OPPONENT_CAR_ID, {
      position: { x: 15, y: 0.4, z: 15 },
      linearVelocity: { x: 0, y: 0, z: 0 }
    });
    for (let i = 0; i < 300; i += 1) {
      tick(physics, gameFlow);
    }
    const beforeGoal = physics.getCarState(OPPONENT_CAR_ID).position;
    expect(Math.hypot(beforeGoal.x - 15, beforeGoal.z - 15)).toBeLessThan(1);

    // Score a goal (resets the world / re-kicks off).
    const opponentGoalCentre = physics.getGoalSensorCentre("opponent")!;
    physics.setCarState(PLAYER_CAR_ID, { position: { x: 5, y: 0.4, z: 5 } });
    physics.setBallState({ position: opponentGoalCentre, linearVelocity: { x: 0, y: 0, z: 0 } });
    tick(physics, gameFlow);
    tick(physics, gameFlow);
    // Run through celebration + the next kickoff countdown.
    for (let i = 0; i < 264 + COUNTDOWN_TOTAL_TICKS; i += 1) {
      tick(physics, gameFlow);
    }
    expect(gameFlow.getMatchState()).toBe("PLAYING");

    // Park it again right after the fresh kickoff and step the SAME 300
    // ticks again -- if the window had carried over from before the
    // goal, 300 (old) + 300 (new) = 600 > 480 would have triggered a
    // teleport partway through this second window; it must not have.
    const opponentAfterKickoff = physics.getCarState(OPPONENT_CAR_ID).position;
    physics.setCarState(OPPONENT_CAR_ID, { linearVelocity: { x: 0, y: 0, z: 0 } });
    for (let i = 0; i < 300; i += 1) {
      tick(physics, gameFlow);
    }
    const afterSecondPark = physics.getCarState(OPPONENT_CAR_ID).position;
    const drift = Math.hypot(
      afterSecondPark.x - opponentAfterKickoff.x,
      afterSecondPark.z - opponentAfterKickoff.z
    );
    expect(drift).toBeLessThan(1);

    physics.dispose();
  });
});
