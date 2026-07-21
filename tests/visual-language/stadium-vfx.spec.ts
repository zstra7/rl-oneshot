import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect
    .poll(() => page.evaluate(() => window.__GAME_TEST__?.gameFlow?.ready() ?? false), {
      timeout: 15_000
    })
    .toBe(true);
});

test("stadium shows floor markings and structural ribs with no console errors", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));

  await page.waitForTimeout(800);
  expect(pageErrors).toEqual([]);
  await page.screenshot({ path: "test-results/stadium-art.png" });
});

test("boosting spawns pooled VFX particles that later decay back to zero", async ({ page }) => {
  await page.evaluate(() => {
    window.__GAME_TEST__?.gameFlow?.openMatchSetup();
    window.__GAME_TEST__?.gameFlow?.startMatch();
    window.__GAME_TEST__?.gameFlow?.advanceGameTicks(460);
  });
  // Park the opponent far from the play area: post-WS2's much snappier
  // AI driving, it can reach and collide with the ball/player during this
  // test's live-simulation window, spawning extra ball-impact VFX bursts
  // that are still decaying when the test samples the particle count —
  // this test is about the player's own boost-trail VFX lifecycle, not
  // AI-triggered impacts.
  await page.evaluate(() =>
    window.__PHYSICS_TEST__?.setCarState("car-opponent", { position: { x: 40, y: 1, z: 40 } })
  );

  const before = await page.evaluate(() => window.__GAME_TEST__?.runtime.getVfxActiveParticleCount());
  expect(before).toBe(0);

  const canvas = page.locator("canvas.game-canvas");
  await page.keyboard.down("w");
  await canvas.dispatchEvent("mousedown", { button: 0 });
  await page.evaluate(() => window.__GAME_TEST__?.runtime.start());
  await page.waitForTimeout(600);

  const duringBoost = await page.evaluate(() =>
    window.__GAME_TEST__?.runtime.getVfxActiveParticleCount()
  );
  expect(duringBoost).toBeGreaterThan(0);

  await page.keyboard.up("w");
  await canvas.dispatchEvent("mouseup", { button: 0 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__GAME_TEST__?.runtime.stop());

  const afterSettling = await page.evaluate(() =>
    window.__GAME_TEST__?.runtime.getVfxActiveParticleCount()
  );
  expect(afterSettling).toBe(0);
});

test("a goal spawns a celebratory VFX burst", async ({ page }) => {
  await page.evaluate(() => {
    window.__GAME_TEST__?.gameFlow?.openMatchSetup();
    window.__GAME_TEST__?.gameFlow?.startMatch();
    window.__GAME_TEST__?.gameFlow?.advanceGameTicks(460);
    window.__GAME_TEST__?.gameFlow?.simulateGoal("player");
  });

  const matchState = await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.getMatchState());
  expect(matchState).toBe("GOAL_CELEBRATION");

  // VfxModule is a RenderFrameModule, only stepped by the rAF loop — the
  // fixed-tick advance above updates physics/match-flow state but not
  // VFX, so a render frame has to actually run once before it reacts.
  await page.evaluate(() => window.__GAME_TEST__?.runtime.start());
  await page.waitForTimeout(150);
  await page.evaluate(() => window.__GAME_TEST__?.runtime.stop());

  const particleCount = await page.evaluate(() =>
    window.__GAME_TEST__?.runtime.getVfxActiveParticleCount()
  );
  expect(particleCount).toBeGreaterThan(20);
});
