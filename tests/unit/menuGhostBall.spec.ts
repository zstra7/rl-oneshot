import { describe, expect, it } from "vitest";

import { AssetPipeline } from "@/assets/AssetPipeline";

/**
 * R8 (plan/RAMPS_AND_FEATURES_PLAN.md): the menu used to show two balls —
 * the static "MenuGhostBall" placeholder mesh and the live physics-driven
 * ball rendered on top of it (both settle at/near the floor, so only the
 * ball read as visibly doubled; the ghost cars happened to overlap their
 * physics counterparts exactly). The ghost ball mesh is removed entirely;
 * the physics ball is the only menu ball now.
 *
 * G1/G2 (plan/GAME_ENHANCEMENTS_PLAN.md): the space backdrop (moon +
 * asteroid field) is asserted in the SAME test as the ghost-ball checks
 * above rather than a second `AssetPipeline().initialise()` call —
 * `AssetPipeline.initialise()` can only run once per process (a
 * pre-existing limitation of a loader singleton it depends on, confirmed
 * unrelated to this change), so every `buildPlaceholderWorld()` assertion
 * in this file shares one pipeline instance.
 */
describe("Single menu ball (no MenuGhostBall placeholder) + space backdrop", () => {
  it("buildPlaceholderWorld() no longer creates a MenuGhostBall mesh, but keeps the ghost cars, and adds the space backdrop", async () => {
    const pipeline = new AssetPipeline();
    await pipeline.initialise();
    const world = pipeline.buildPlaceholderWorld();

    expect(world.getObjectByName("MenuGhostBall")).toBeUndefined();
    expect(world.getObjectByName("MenuGhostPlayerCar")).toBeTruthy();
    expect(world.getObjectByName("MenuGhostOpponentCar")).toBeTruthy();

    let moonCount = 0;
    let asteroidCount = 0;
    world.traverse((child) => {
      if (child.name === "Moon") moonCount += 1;
      if (child.name === "AsteroidField") asteroidCount += 1;
    });
    expect(moonCount).toBe(1);
    expect(asteroidCount).toBe(1);
  });
});
