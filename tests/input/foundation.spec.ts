import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect
    .poll(() => page.evaluate(() => window.__INPUT_TEST__?.ready() ?? false), {
      timeout: 15_000
    })
    .toBe(true);

  // Physics is paused so the debug cars don't drift on their own while we
  // assert on raw CarInput sampling.
  await page.evaluate(() => window.__PHYSICS_TEST__?.pauseRuntime());
});

test("W held produces throttle=1, steer=0 while grounded", async ({ page }) => {
  await page.keyboard.down("KeyW");
  const frame = await page.evaluate(() =>
    window.__INPUT_TEST__?.sampleTick({ grounded: true })
  );
  await page.keyboard.up("KeyW");

  expect(frame?.car.throttle).toBe(1);
  expect(frame?.car.steer).toBe(0);
});

test("W+D held produces throttle=1, steer=1 while grounded", async ({ page }) => {
  await page.keyboard.down("KeyW");
  await page.keyboard.down("KeyD");
  const frame = await page.evaluate(() =>
    window.__INPUT_TEST__?.sampleTick({ grounded: true })
  );
  await page.keyboard.up("KeyW");
  await page.keyboard.up("KeyD");

  expect(frame?.car.throttle).toBe(1);
  expect(frame?.car.steer).toBe(1);
});

test("S held produces throttle=-1", async ({ page }) => {
  await page.keyboard.down("KeyS");
  const frame = await page.evaluate(() =>
    window.__INPUT_TEST__?.sampleTick({ grounded: true })
  );
  await page.keyboard.up("KeyS");

  expect(frame?.car.throttle).toBe(-1);
});

test("Left mouse button held produces boost=true", async ({ page }) => {
  const canvas = page.locator("canvas.game-canvas");
  await canvas.dispatchEvent("mousedown", { button: 0 });

  const frame = await page.evaluate(() =>
    window.__INPUT_TEST__?.sampleTick({ grounded: true })
  );

  await canvas.dispatchEvent("mouseup", { button: 0 });

  expect(frame?.car.boost).toBe(true);
});

test("Right mouse button produces a jump press edge exactly once", async ({ page }) => {
  const canvas = page.locator("canvas.game-canvas");
  await canvas.dispatchEvent("mousedown", { button: 2 });

  const first = await page.evaluate(() =>
    window.__INPUT_TEST__?.sampleTick({ grounded: true })
  );
  const second = await page.evaluate(() =>
    window.__INPUT_TEST__?.sampleTick({ grounded: true })
  );

  await canvas.dispatchEvent("mouseup", { button: 2 });

  expect(first?.edges.jumpPressed).toBe(true);
  expect(first?.car.jump).toBe(true);
  // The press edge is consumed once; a second sample in the same instant
  // must not report a second press (no lost/duplicated jump edges).
  expect(second?.edges.jumpPressed).toBe(false);
  // But the button is still held, so jump (a held state) remains true.
  expect(second?.car.jump).toBe(true);
});

test("Space produces a ball-camera press edge exactly once", async ({ page }) => {
  await page.keyboard.down("Space");
  const first = await page.evaluate(() =>
    window.__INPUT_TEST__?.sampleTick({ grounded: true })
  );
  const second = await page.evaluate(() =>
    window.__INPUT_TEST__?.sampleTick({ grounded: true })
  );
  await page.keyboard.up("Space");

  expect(first?.edges.ballCameraPressed).toBe(true);
  expect(second?.edges.ballCameraPressed).toBe(false);
});

test("Escape produces a pause press edge exactly once", async ({ page }) => {
  await page.keyboard.down("Escape");
  const first = await page.evaluate(() =>
    window.__INPUT_TEST__?.sampleTick({ grounded: true })
  );
  const second = await page.evaluate(() =>
    window.__INPUT_TEST__?.sampleTick({ grounded: true })
  );
  await page.keyboard.up("Escape");

  expect(first?.edges.pausePressed).toBe(true);
  expect(second?.edges.pausePressed).toBe(false);
});

test("airborne WASD resolves to pitch/yaw instead of throttle steer", async ({ page }) => {
  await page.keyboard.down("KeyW");
  await page.keyboard.down("KeyD");
  const frame = await page.evaluate(() =>
    window.__INPUT_TEST__?.sampleTick({ grounded: false })
  );
  await page.keyboard.up("KeyW");
  await page.keyboard.up("KeyD");

  expect(frame?.car.steer).toBe(0);
  expect(frame?.car.pitch).toBe(1);
  expect(frame?.car.yaw).toBe(1);
});

test("focus loss (blur) neutralises held keyboard input", async ({ page }) => {
  await page.keyboard.down("KeyW");

  const beforeBlur = await page.evaluate(() =>
    window.__INPUT_TEST__?.sampleTick({ grounded: true })
  );
  expect(beforeBlur?.car.throttle).toBe(1);

  await page.evaluate(() => window.__INPUT_TEST__?.simulateBlur());

  const afterBlur = await page.evaluate(() =>
    window.__INPUT_TEST__?.sampleTick({ grounded: true })
  );
  expect(afterBlur?.car.throttle).toBe(0);

  await page.keyboard.up("KeyW");
});

test("virtual gamepad connect/disconnect drives CarInput and neutralises on disconnect", async ({
  page
}) => {
  const gamepadIndex = await page.evaluate(() =>
    window.__INPUT_TEST__?.connectVirtualGamepad({
      id: "Virtual Test Pad (Standard)",
      mapping: "standard",
      axesCount: 4,
      buttonCount: 17
    })
  );
  expect(typeof gamepadIndex).toBe("number");

  await page.evaluate((index) => {
    const buttons = new Array(17).fill({ pressed: false, touched: false, value: 0 });
    buttons[7] = { pressed: true, touched: true, value: 1 }; // right trigger = accelerate
    window.__INPUT_TEST__?.setVirtualGamepadState(index!, {
      connected: true,
      axes: [0, 0, 0, 0],
      buttons
    });
    window.__INPUT_TEST__?.assignGamepad(index!);
  }, gamepadIndex);

  // Poll a browser frame so the gamepad snapshot updates.
  await page.waitForTimeout(50);

  const frame = await page.evaluate(() =>
    window.__INPUT_TEST__?.sampleTick({ grounded: true })
  );
  expect(frame?.car.throttle).toBeCloseTo(1, 5);
  expect(await page.evaluate(() => window.__INPUT_TEST__?.getActiveDevice())).toBe("gamepad");

  await page.evaluate((index) => {
    window.__INPUT_TEST__?.disconnectVirtualGamepad(index!);
  }, gamepadIndex);
  await page.waitForTimeout(50);

  const afterDisconnect = await page.evaluate(() =>
    window.__INPUT_TEST__?.sampleTick({ grounded: true })
  );
  expect(afterDisconnect?.car.throttle).toBe(0);
});
