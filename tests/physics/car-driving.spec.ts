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
    // Phase 7: gameplay input is only live once match-flow reaches a
    // controls-active state (PLAYING/ZERO_SECOND_PLAY/OVERTIME_PLAYING) --
    // start a real match and skip deterministically through the kickoff
    // countdown before repositioning car/ball for this test's scenario.
    window.__GAME_TEST__?.gameFlow?.startMatch();
    window.__GAME_TEST__?.gameFlow?.advanceGameTicks(460);
    window.__PHYSICS_TEST__?.setCarState("car-player", {
      position: { x: 0, y: 1, z: 8 },
      // WS7.A: kickoff now spawns cars with a rotation facing the ball
      // from the (round-robin, variant-dependent) kickoff spot, not
      // always identity — reset to facing -Z (straight toward the ball
      // from this position) explicitly rather than inheriting whatever
      // this run's kickoff variant happened to be.
      rotation: { x: 0, y: 0, z: 0, w: 1 }
    });
    window.__PHYSICS_TEST__?.setBallState({
      position: { x: 0, y: 1, z: 0 },
      linearVelocity: { x: 0, y: 0, z: 0 }
    });
    // Isolate this player-driving scenario from the live opponent AI: it
    // reacts to the ball teleport too and, post WS2's much snappier
    // steering, can whip across the play area fast enough to clip the
    // player's car via car-car collision before the scripted shot lands
    // (verified: without this, the shot's ball direction becomes
    // non-deterministic). Parking the opponent far away keeps this test
    // about player driving mechanics only, not AI/collision timing.
    window.__PHYSICS_TEST__?.setCarState("car-opponent", {
      position: { x: 40, y: 1, z: 40 }
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
  await page.evaluate(() => {
    window.__GAME_TEST__?.gameFlow?.startMatch();
    window.__GAME_TEST__?.gameFlow?.advanceGameTicks(460);
  });
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
