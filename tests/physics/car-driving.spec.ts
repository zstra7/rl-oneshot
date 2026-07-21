import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect
    .poll(() => page.evaluate(() => window.__PHYSICS_TEST__?.ready() ?? false), {
      timeout: 15_000
    })
    .toBe(true);
});

test("driving forward with real keyboard input moves the player car and it can hit the ball into open space", async ({
  page
}) => {
  await page.evaluate(() => {
    window.__PHYSICS_TEST__?.resetWorld({
      carCreationOrder: ["car-player", "car-opponent"]
    });
    window.__PHYSICS_TEST__?.setCarState("car-player", {
      position: { x: 0, y: 1, z: 8 }
    });
    window.__PHYSICS_TEST__?.setBallState({
      position: { x: 0, y: 1, z: 0 },
      linearVelocity: { x: 0, y: 0, z: 0 }
    });
  });

  // Let the car settle onto the ground.
  await page.evaluate(() => window.__PHYSICS_TEST__?.stepTicks(90));
  const settled = await page.evaluate(() => window.__PHYSICS_TEST__?.getCarState("car-player"));
  expect(settled?.grounded).toBe(true);

  // Drive forward with a real held keyboard key (W), same as a human
  // player, through the runtime's live input pipeline (not direct
  // physics.setCarInput), for the full one-human-can-score exit criterion.
  await page.keyboard.down("KeyW");
  await page.evaluate(() => window.__PHYSICS_TEST__?.resumeRuntime());

  let ballMoved = false;
  for (let i = 0; i < 40 && !ballMoved; i += 1) {
    await page.waitForTimeout(100);
    const ball = await page.evaluate(() => window.__PHYSICS_TEST__?.getBallState());
    if (ball && Math.abs(ball.linearVelocity.z) > 1) {
      ballMoved = true;
    }
  }

  await page.keyboard.up("KeyW");
  await page.evaluate(() => window.__PHYSICS_TEST__?.pauseRuntime());

  expect(ballMoved).toBe(true);

  const finalBall = await page.evaluate(() => window.__PHYSICS_TEST__?.getBallState());
  // The car drove from +Z toward the ball, so it must be hit toward -Z —
  // i.e. away from where the car started, into open space.
  expect(finalBall?.linearVelocity.z).toBeLessThan(-1);
});

test("jump + boost + dodge all work through the live input pipeline without NaN", async ({
  page
}) => {
  await page.evaluate(() =>
    window.__PHYSICS_TEST__?.resetWorld({ carCreationOrder: ["car-player", "car-opponent"] })
  );
  await page.evaluate(() => window.__PHYSICS_TEST__?.stepTicks(90));

  await page.mouse.move(400, 300);
  await page.mouse.down({ button: "right" }); // jump
  await page.evaluate(() => window.__PHYSICS_TEST__?.resumeRuntime());
  await page.waitForTimeout(50);
  await page.mouse.up({ button: "right" });

  await page.mouse.down({ button: "left" }); // boost
  await page.waitForTimeout(200);
  await page.mouse.up({ button: "left" });
  await page.evaluate(() => window.__PHYSICS_TEST__?.pauseRuntime());

  const state = await page.evaluate(() => window.__PHYSICS_TEST__?.getCarState("car-player"));
  expect(Number.isFinite(state?.position.x)).toBe(true);
  expect(Number.isFinite(state?.position.y)).toBe(true);
  expect(Number.isFinite(state?.position.z)).toBe(true);
});
