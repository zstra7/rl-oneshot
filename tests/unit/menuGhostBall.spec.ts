import { describe, expect, it } from "vitest";

import { AssetPipeline } from "@/assets/AssetPipeline";

/**
 * R8 (plan/RAMPS_AND_FEATURES_PLAN.md): the menu used to show two balls —
 * the static "MenuGhostBall" placeholder mesh and the live physics-driven
 * ball rendered on top of it (both settle at/near the floor, so only the
 * ball read as visibly doubled; the ghost cars happened to overlap their
 * physics counterparts exactly). The ghost ball mesh is removed entirely;
 * the physics ball is the only menu ball now.
 */
describe("Single menu ball (no MenuGhostBall placeholder)", () => {
  it("buildPlaceholderWorld() no longer creates a MenuGhostBall mesh, but keeps the ghost cars", async () => {
    const pipeline = new AssetPipeline();
    await pipeline.initialise();
    const world = pipeline.buildPlaceholderWorld();

    expect(world.getObjectByName("MenuGhostBall")).toBeUndefined();
    expect(world.getObjectByName("MenuGhostPlayerCar")).toBeTruthy();
    expect(world.getObjectByName("MenuGhostOpponentCar")).toBeTruthy();
  });
});
