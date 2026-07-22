import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MatchFlowController } from "@/game-flow/MatchFlowController";
import { PLAYER_CAR_ID, OPPONENT_CAR_ID } from "@/game-flow/MatchFlowConstants";
import { PhysicsFacade } from "@/physics/PhysicsFacade";
import * as V from "@/physics/Vec3Math";

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

/**
 * R6 (plan/RAMPS_AND_FEATURES_PLAN.md): a real-RL-style "goal explosion"
 * shockwave — cars near the scored-on goal mouth get thrown away from it
 * when a goal is scored.
 */
describe("Goal-scored blast force", () => {
  let physics: PhysicsFacade;

  beforeEach(async () => {
    physics = new PhysicsFacade();
    await physics.initialise();
  });

  afterEach(() => {
    physics.dispose();
  });

  describe("PhysicsFacade.applyRadialCarImpulse", () => {
    it("throws a nearby car away from the centre, upward", () => {
      const goalCentre = { x: 0, y: 0, z: -30 };
      physics.spawnCar({ id: "car-a", transform: { x: 0, y: 0.4, z: -26 } });
      physics.stepTicks(5);

      physics.applyRadialCarImpulse(goalCentre, 16, 18);
      physics.stepTicks(1);

      const state = physics.getCarState("car-a");
      const speed = V.length(state.linearVelocity);
      expect(speed).toBeGreaterThanOrEqual(10);

      const carPosition = { x: state.position.x, y: 0, z: state.position.z };
      const awayFromGoal = V.normalize(V.sub(carPosition, { x: goalCentre.x, y: 0, z: goalCentre.z }));
      const velocityHorizontal = V.normalize({ x: state.linearVelocity.x, y: 0, z: state.linearVelocity.z });
      expect(V.dot(awayFromGoal, velocityHorizontal)).toBeGreaterThan(0.7);
      expect(state.linearVelocity.y).toBeGreaterThan(0);
    });

    it("falls off with distance — a car outside the radius is basically untouched", () => {
      const goalCentre = { x: 0, y: 0, z: -30 };
      physics.spawnCar({ id: "car-a", transform: { x: 0, y: 0.4, z: -5 } }); // 25m away
      physics.stepTicks(5);
      const before = physics.getCarState("car-a").linearVelocity;

      physics.applyRadialCarImpulse(goalCentre, 16, 18);
      physics.stepTicks(1);

      const after = physics.getCarState("car-a").linearVelocity;
      const delta = V.length(V.sub(after, before));
      expect(delta).toBeLessThan(0.5);
    });
  });

  describe("full match-flow integration", () => {
    let gameFlow: MatchFlowController;

    beforeEach(() => {
      gameFlow = new MatchFlowController();
      gameFlow.initialise({ physics });
      gameFlow.openMatchSetup();
      gameFlow.startMatch();
      const COUNTDOWN_TOTAL_TICKS = 120 + 120 + 120 + 90;
      for (let i = 0; i < COUNTDOWN_TOTAL_TICKS; i += 1) {
        tick(physics, gameFlow);
      }
      expect(gameFlow.getMatchState()).toBe("PLAYING");
    });

    it("a car parked near the scored-on goal gets kicked; midfield car is unaffected", () => {
      // Player scores on the opponent's goal -> blast centres on the
      // opponent's defended goal.
      const opponentGoalCentre = physics.getGoalSensorCentre("opponent")!;
      physics.setCarState(PLAYER_CAR_ID, {
        position: { x: opponentGoalCentre.x, y: 0.6, z: opponentGoalCentre.z + 4 },
        linearVelocity: { x: 0, y: 0, z: 0 }
      });
      physics.setCarState(OPPONENT_CAR_ID, {
        position: { x: 0, y: 0.6, z: 0 }, // midfield
        linearVelocity: { x: 0, y: 0, z: 0 }
      });
      physics.stepTicks(30); // let both cars settle onto the floor first

      physics.setBallState({
        position: opponentGoalCentre,
        linearVelocity: { x: 0, y: 0, z: 0 }
      });
      tick(physics, gameFlow);
      tick(physics, gameFlow);

      expect(gameFlow.getSessionState().playerScore).toBe(1);
      const playerSpeed = V.length(physics.getCarState(PLAYER_CAR_ID).linearVelocity);
      const opponentSpeed = V.length(physics.getCarState(OPPONENT_CAR_ID).linearVelocity);
      expect(playerSpeed).toBeGreaterThanOrEqual(6);
      expect(opponentSpeed).toBeLessThan(1);
    });

    it("applies exactly one impulse per goal (no repeated kicks while latched)", () => {
      const opponentGoalCentre = physics.getGoalSensorCentre("opponent")!;
      physics.setCarState(PLAYER_CAR_ID, {
        position: { x: opponentGoalCentre.x, y: 0.6, z: opponentGoalCentre.z + 4 },
        linearVelocity: { x: 0, y: 0, z: 0 }
      });
      physics.stepTicks(30); // let it settle onto the floor first

      physics.setBallState({ position: opponentGoalCentre, linearVelocity: { x: 0, y: 0, z: 0 } });
      tick(physics, gameFlow);
      tick(physics, gameFlow);

      const speedRightAfter = V.length(physics.getCarState(PLAYER_CAR_ID).linearVelocity);
      expect(speedRightAfter).toBeGreaterThanOrEqual(6);

      // A second impulse mid-decay would spike speed back up well above
      // its post-blast peak; friction/drag noise alone never does that.
      let maxSpeedSeen = speedRightAfter;
      for (let i = 0; i < 120; i += 1) {
        tick(physics, gameFlow);
        const speed = V.length(physics.getCarState(PLAYER_CAR_ID).linearVelocity);
        maxSpeedSeen = Math.max(maxSpeedSeen, speed);
      }
      expect(maxSpeedSeen).toBeLessThanOrEqual(speedRightAfter + 0.5);
    });
  });
});
