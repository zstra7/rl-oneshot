import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect
    .poll(() => page.evaluate(() => window.__PHYSICS_TEST__?.ready() ?? false), {
      timeout: 15_000
    })
    .toBe(true);
});

test("boost pad layout is present with 10 pads and default-active", async ({ page }) => {
  // F8 (plan/ARENA_FLUSH_AND_REFINEMENTS_PLAN.md): reduced from 12 small +
  // 4 full (16) to 6 small + 4 full (10) per user request.
  await page.evaluate(() => window.__PHYSICS_TEST__?.pauseRuntime());
  const pads = await page.evaluate(() => window.__PHYSICS_TEST__?.getBoostPadStates());
  expect(pads).toHaveLength(10);
  expect(pads?.every((pad) => pad.active)).toBe(true);
});

test("collecting a pad through the live runtime deactivates it and grants boost, then it respawns", async ({
  page
}) => {
  await page.evaluate(() => window.__PHYSICS_TEST__?.pauseRuntime());
  await page.evaluate(() =>
    window.__PHYSICS_TEST__?.resetWorld({ carCreationOrder: ["car-player", "car-opponent"] })
  );

  const pad = await page.evaluate(() =>
    window.__PHYSICS_TEST__?.getBoostPadStates().find((p) => p.type === "small")
  );
  expect(pad).toBeTruthy();

  const boostBefore = await page.evaluate(
    () => window.__PHYSICS_TEST__?.getCarState("car-player").boostAmount
  );

  await page.evaluate(
    ([padId]) => window.__PHYSICS_TEST__?.collectBoostPadForCar(padId as string, "car-player"),
    [pad!.id]
  );

  const boostAfter = await page.evaluate(
    () => window.__PHYSICS_TEST__?.getCarState("car-player").boostAmount
  );
  expect(boostAfter).toBe(Math.min(100, boostBefore! + 12));

  const padAfter = await page.evaluate(
    ([padId]) => window.__PHYSICS_TEST__?.getBoostPadStates().find((p) => p.id === padId),
    [pad!.id]
  );
  expect(padAfter?.active).toBe(false);

  await page.evaluate(() => window.__PHYSICS_TEST__?.stepTicks(480));

  const padRespawned = await page.evaluate(
    ([padId]) => window.__PHYSICS_TEST__?.getBoostPadStates().find((p) => p.id === padId),
    [pad!.id]
  );
  expect(padRespawned?.active).toBe(true);
});
