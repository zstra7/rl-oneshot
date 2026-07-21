import { describe, expect, it } from "vitest";

import { OpponentAiController } from "@/ai/OpponentAiController";
import type { AiUpdateContext } from "@/ai/AiTypes";
import type { MatchState } from "@/game-flow/MatchFlowTypes";
import { RL_CONSTANTS } from "@/physics/PhysicsConstants";
import { PhysicsFacade } from "@/physics/PhysicsFacade";

function buildContext(
  physics: PhysicsFacade,
  tick: number,
  matchState: MatchState = "MATCH_ENDING"
): AiUpdateContext {
  return {
    tick,
    matchState,
    controlledCar: physics.getCarState("car-opponent"),
    humanCar: physics.getCarState("car-player"),
    ball: physics.getBallState(),
    boostPads: physics.getBoostPadStates(),
    ownGoalCentre: physics.getGoalSensorCentre("opponent")!,
    targetGoalCentre: physics.getGoalSensorCentre("player")!
  };
}

/**
 * WS6 (plan/POLISH_OVERHAUL_PLAN.md): the new chase-and-shoot planner
 * must actually be able to score an open net. The AI's target goal (the
 * "player" sensor, per `OpponentAiController`'s `targetGoalCentre`) sits
 * at the arena's -Z end (`TestArenaPresets.buildGoalEnd(-1, "player")`)
 * — the AI is positioned behind the ball relative to that goal in both
 * scenarios below.
 */
describe("AI scoring: an open net is actually converted", () => {
  it("scores from directly behind the ball on the shot line", async () => {
    const physics = new PhysicsFacade();
    await physics.initialise();
    physics.spawnCar({ id: "car-opponent", transform: { x: 0, y: 0.4, z: -10 } });
    physics.spawnCar({ id: "car-player", transform: { x: 40, y: 1, z: 40 } });
    physics.setBallState({
      position: { x: 0, y: RL_CONSTANTS.ballRadius, z: -18 },
      linearVelocity: { x: 0, y: 0, z: 0 }
    });

    const ai = new OpponentAiController();
    ai.setDifficulty("medium");
    ai.setSeed(7);

    let scored = false;
    for (let i = 0; i < 2400 && !scored; i += 1) {
      const input = ai.update(buildContext(physics, i));
      physics.setCarInput("car-opponent", input);
      physics.stepTicks(1);
      scored = physics
        .getGoalEvents()
        .some((event) => event.type === "goal-scored" && event.scoringTeam === "opponent");
    }

    expect(scored).toBe(true);
    physics.dispose();
  });

  it("scores from an angled approach off to the side", async () => {
    const physics = new PhysicsFacade();
    await physics.initialise();
    physics.spawnCar({ id: "car-opponent", transform: { x: 3, y: 0.4, z: -8 } });
    physics.spawnCar({ id: "car-player", transform: { x: 40, y: 1, z: 40 } });
    physics.setBallState({
      position: { x: 3, y: RL_CONSTANTS.ballRadius, z: -16 },
      linearVelocity: { x: 0, y: 0, z: 0 }
    });

    const ai = new OpponentAiController();
    ai.setDifficulty("medium");
    ai.setSeed(7);

    let scored = false;
    for (let i = 0; i < 3600 && !scored; i += 1) {
      const input = ai.update(buildContext(physics, i));
      physics.setCarInput("car-opponent", input);
      physics.stepTicks(1);
      scored = physics
        .getGoalEvents()
        .some((event) => event.type === "goal-scored" && event.scoringTeam === "opponent");
    }

    expect(scored).toBe(true);
    physics.dispose();
  });
});
