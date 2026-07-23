import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PhysicsFacade } from "@/physics/PhysicsFacade";

describe("Goal sensors (physics spec deviation, game-flow spec section 30 raw facts)", () => {
  let physics: PhysicsFacade;

  beforeEach(async () => {
    physics = new PhysicsFacade();
    await physics.initialise();
  });

  afterEach(() => {
    physics.dispose();
  });

  it("a ball driven into the opponent's goal (+Z) scores for the player", () => {
    physics.setBallState({
      position: { x: 0, y: 1, z: 25 },
      linearVelocity: { x: 0, y: 0, z: 10 }
    });

    let scored = false;
    for (let i = 0; i < 240 && !scored; i += 1) {
      physics.stepTicks(1);
      if (physics.getGoalEvents().length > 0) {
        scored = true;
      }
    }

    expect(scored).toBe(true);
    expect(physics.getGoalEvents()).toEqual([
      expect.objectContaining({ type: "goal-scored", scoringTeam: "player" })
    ]);
  });

  it("a ball driven into the player's own goal (-Z) scores for the opponent", () => {
    physics.setBallState({
      position: { x: 0, y: 1, z: -25 },
      linearVelocity: { x: 0, y: 0, z: -10 }
    });

    let scored = false;
    for (let i = 0; i < 240 && !scored; i += 1) {
      physics.stepTicks(1);
      if (physics.getGoalEvents().length > 0) {
        scored = true;
      }
    }

    expect(scored).toBe(true);
    expect(physics.getGoalEvents()).toEqual([
      expect.objectContaining({ type: "goal-scored", scoringTeam: "opponent" })
    ]);
  });

  it("a ball resting in the arena centre never scores", () => {
    physics.setBallState({ position: { x: 0, y: 1, z: 0 }, linearVelocity: { x: 0, y: 0, z: 0 } });
    physics.stepTicks(120);
    expect(physics.getGoalEvents()).toHaveLength(0);
  });

  it("a ball sitting inside the goal only emits one onset event, not one per tick", () => {
    const centre = physics.getGoalSensorCentre("opponent")!;
    physics.setBallState({ position: centre, linearVelocity: { x: 0, y: 0, z: 0 } });
    physics.stepTicks(60);
    expect(physics.getGoalEvents()).toHaveLength(1);
  });

  it("clearGoalEvents() empties the event list", () => {
    const centre = physics.getGoalSensorCentre("opponent")!;
    physics.setBallState({ position: centre, linearVelocity: { x: 0, y: 0, z: 0 } });
    physics.stepTicks(3);
    expect(physics.getGoalEvents().length).toBeGreaterThan(0);
    physics.clearGoalEvents();
    expect(physics.getGoalEvents()).toHaveLength(0);
  });

  it("resetWorld() clears the overlap latch so a fresh entry after reset scores again", () => {
    const centre = physics.getGoalSensorCentre("opponent")!;
    physics.setBallState({ position: centre, linearVelocity: { x: 0, y: 0, z: 0 } });
    physics.stepTicks(3);
    expect(physics.getGoalEvents().length).toBeGreaterThan(0);

    physics.resetWorld({ carCreationOrder: ["car-player", "car-opponent"] });
    expect(physics.getGoalEvents()).toHaveLength(0);

    physics.setBallState({ position: centre, linearVelocity: { x: 0, y: 0, z: 0 } });
    physics.stepTicks(3);
    expect(physics.getGoalEvents().length).toBeGreaterThan(0);
  });
});
