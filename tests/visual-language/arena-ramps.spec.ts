import { expect, test } from "@playwright/test";

/**
 * R1 (plan/RAMPS_AND_FEATURES_PLAN.md): the shared ArenaRampGeometry
 * generator drives both the physics colliders and the rendered ramp/
 * corner meshes — these tests prove the live browser build actually
 * wires that up (counts + textures) and that a real, held-key drive
 * genuinely climbs a wall in the running game, not just in a unit test.
 */
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect
    .poll(() => page.evaluate(() => window.__ASSET_TEST__?.ready() ?? false), { timeout: 15_000 })
    .toBe(true);
});

test("the arena has exactly 150 ramp segments, 24 corner panels, and a textured ramp material", async ({
  page
}) => {
  const info = await page.evaluate(() => window.__ASSET_TEST__?.getStadiumShellInfo());
  expect(info).toBeTruthy();
  expect(info!.rampSegmentCount).toBe(150);
  expect(info!.cornerPanelCount).toBe(24);
  expect(info!.rampMaterialTextured).toBe(true);
});

test("driving with a real held key up the far end-wall ramp actually climbs it", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));

  await page.evaluate(() => {
    window.__GAME_TEST__?.gameFlow?.openMatchSetup();
    window.__GAME_TEST__?.gameFlow?.startMatch();
    window.__GAME_TEST__?.gameFlow?.advanceGameTicks(460);
    window.__PHYSICS_TEST__?.setCarState("car-player", {
      position: { x: 10.5, y: 0.4, z: -22 },
      rotation: { x: 0, y: 0, z: 0, w: 1 } // facing -Z, straight at the near end wall's side run
    });
    window.__PHYSICS_TEST__?.setCarState("car-opponent", { position: { x: 40, y: 1, z: 40 } });
  });
  await page.evaluate(() => window.__PHYSICS_TEST__?.stepTicks(30));

  const canvas = page.locator("canvas.game-canvas");
  await page.keyboard.down("KeyW");
  await canvas.dispatchEvent("mousedown", { button: 0 }); // boost
  await page.evaluate(() => window.__PHYSICS_TEST__?.resumeRuntime());

  let maxHeight = 0;
  for (let i = 0; i < 25; i += 1) {
    await page.waitForTimeout(100);
    const car = await page.evaluate(() => window.__PHYSICS_TEST__?.getCarState("car-player"));
    if (car) {
      maxHeight = Math.max(maxHeight, car.position.y);
    }
  }

  await page.keyboard.up("KeyW");
  await canvas.dispatchEvent("mouseup", { button: 0 });
  await page.evaluate(() => window.__PHYSICS_TEST__?.pauseRuntime());

  expect(maxHeight).toBeGreaterThan(1.5);
  expect(pageErrors).toEqual([]);
});
