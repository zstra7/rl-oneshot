import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect
    .poll(() => page.evaluate(() => window.__PHYSICS_TEST__?.ready() ?? false), {
      timeout: 15_000
    })
    .toBe(true);

  // Deterministic manual stepping requires the live RAF loop paused first —
  // otherwise it keeps stepping physics concurrently with stepTicks().
  await page.evaluate(() => window.__PHYSICS_TEST__?.pauseRuntime());
});

test("two cars and a ball exist at boot with finite state", async ({ page }) => {
  const world = await page.evaluate(() => window.__PHYSICS_TEST__?.getWorldState());

  expect(world?.cars).toHaveLength(2);
  expect(world?.cars.map((car) => car.id)).toEqual(["car-player", "car-opponent"]);
  expect(Number.isFinite(world?.ball.position.y)).toBe(true);
});

test("stepTicks(120) advances the tick counter by exactly 120", async ({ page }) => {
  const before = await page.evaluate(
    () => window.__PHYSICS_TEST__?.getDiagnostics().tick
  );

  await page.evaluate(() => window.__PHYSICS_TEST__?.stepTicks(120));

  const after = await page.evaluate(
    () => window.__PHYSICS_TEST__?.getDiagnostics().tick
  );

  expect((after ?? 0) - (before ?? 0)).toBe(120);
});

test("resetWorld() is repeatable across two runs in the browser", async ({ page }) => {
  async function runAndCapture(): Promise<number> {
    await page.evaluate(() => {
      window.__PHYSICS_TEST__?.resetWorld();
      window.__PHYSICS_TEST__?.setBallState({
        position: { x: 0, y: 6, z: 0 },
        linearVelocity: { x: 0, y: 0, z: 0 }
      });
      window.__PHYSICS_TEST__?.stepTicks(90);
    });

    return (await page.evaluate(() => window.__PHYSICS_TEST__?.getBallState().position.y)) ?? NaN;
  }

  const first = await runAndCapture();
  const second = await runAndCapture();

  expect(first).toBe(second);
});

test("the ball visibly falls and settles above the floor (no tunnelling)", async ({
  page
}) => {
  await page.evaluate(() => {
    window.__PHYSICS_TEST__?.setBallState({
      position: { x: 0, y: 10, z: 0 },
      linearVelocity: { x: 0, y: 0, z: 0 }
    });
  });

  await page.evaluate(() => window.__PHYSICS_TEST__?.stepTicks(600));

  const finalY = await page.evaluate(
    () => window.__PHYSICS_TEST__?.getBallState().position.y
  );

  expect(finalY).toBeGreaterThan(-0.1);
  expect(finalY).toBeLessThan(10);
});
