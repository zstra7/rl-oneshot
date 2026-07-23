import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect
    .poll(() => page.evaluate(() => window.__GAME_TEST__?.gameFlow?.ready() ?? false), {
      timeout: 15_000
    })
    .toBe(true);
  await expect
    .poll(() => page.evaluate(() => window.__INPUT_TEST__?.ready() ?? false), {
      timeout: 15_000
    })
    .toBe(true);
  await expect
    .poll(() => page.evaluate(() => window.__PHYSICS_TEST__?.ready() ?? false), {
      timeout: 15_000
    })
    .toBe(true);

  // The live match's fixed-tick loop also calls sampleGameplayInputForTick
  // every physics tick (consuming pressed/released edges as a side effect),
  // which otherwise races with this suite's own explicit sampleTick() edge
  // assertions — same reason tests/input/foundation.spec.ts pauses here.
  // Gamepad polling in this suite is driven manually via sampleTick(), which
  // calls updateBrowserFrame() itself, so pausing the RAF loop doesn't
  // starve it.
  await page.evaluate(() => window.__PHYSICS_TEST__?.pauseRuntime());
});

async function openControlsTab(page: Page): Promise<void> {
  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.openSettings());
  await page.getByTestId("settings-tab-controls").click();
}

async function connectVirtualGamepad(page: Page): Promise<number> {
  const index = await page.evaluate(() =>
    window.__INPUT_TEST__?.connectVirtualGamepad({
      id: "Virtual Test Pad (Standard)",
      mapping: "standard",
      axesCount: 4,
      buttonCount: 17
    })
  );
  return index!;
}

// R10 (plan/RAMPS_AND_FEATURES_PLAN.md): rebindable controls + air-roll
// sensitivity. tests/input/foundation.spec.ts is the unmodified no-regression
// anchor for the default bindings this refactor sits on top of.

test("rebind accelerate to a new key: old key becomes inert, new key works", async ({ page }) => {
  await openControlsTab(page);

  await page.getByTestId("binding-accelerate").click();
  await page.keyboard.press("KeyP");
  await expect(page.getByTestId("binding-accelerate")).toHaveText("P");

  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.openMainMenu());

  await page.keyboard.down("KeyP");
  const withP = await page.evaluate(() => window.__INPUT_TEST__?.sampleTick({ grounded: true }));
  await page.keyboard.up("KeyP");
  expect(withP?.car.throttle).toBe(1);

  await page.keyboard.down("KeyW");
  const withW = await page.evaluate(() => window.__INPUT_TEST__?.sampleTick({ grounded: true }));
  await page.keyboard.up("KeyW");
  expect(withW?.car.throttle).toBe(0);
});

test("a rebound key persists across a page reload and still drives gameplay", async ({ page }) => {
  await openControlsTab(page);

  await page.getByTestId("binding-accelerate").click();
  await page.keyboard.press("KeyP");
  await expect(page.getByTestId("binding-accelerate")).toHaveText("P");

  const stored = await page.evaluate(() => localStorage.getItem("space-carball-settings-v1"));
  expect(stored).toBeTruthy();
  expect(JSON.parse(stored!).controls.keyboardMouse.accelerate).toBe("KeyP");

  await page.reload();
  await expect
    .poll(() => page.evaluate(() => window.__INPUT_TEST__?.ready() ?? false), { timeout: 15_000 })
    .toBe(true);

  await openControlsTab(page);
  await expect(page.getByTestId("binding-accelerate")).toHaveText("P");

  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.openMainMenu());
  await page.keyboard.down("KeyP");
  const frame = await page.evaluate(() => window.__INPUT_TEST__?.sampleTick({ grounded: true }));
  await page.keyboard.up("KeyP");
  expect(frame?.car.throttle).toBe(1);
});

test("gamepad button rebind: chip shows BTN 5, boost fires on button 5", async ({ page }) => {
  await openControlsTab(page);
  const gamepadIndex = await connectVirtualGamepad(page);

  await page.getByTestId("bindings-device-gamepad").click();
  await page.getByTestId("binding-gamepad-boostButton").click();

  await page.evaluate((index) => {
    const buttons = new Array(17).fill({ pressed: false, touched: false, value: 0 });
    buttons[5] = { pressed: true, touched: true, value: 1 };
    window.__INPUT_TEST__?.setVirtualGamepadState(index, {
      connected: true,
      axes: [0, 0, 0, 0],
      buttons
    });
    window.__INPUT_TEST__?.assignGamepad(index);
  }, gamepadIndex);

  // pollGamepad (which feeds the capture) only runs on a genuine
  // updateBrowserFrame poll — force several deterministically rather than
  // relying on the live RAF loop's timing, then give the settings panel's
  // own 100ms capture-poll interval a moment to pick the result up.
  for (let i = 0; i < 5; i += 1) {
    await page.evaluate(() => window.__INPUT_TEST__?.sampleTick({ grounded: true }));
    await page.waitForTimeout(60);
  }

  await expect(page.getByTestId("binding-gamepad-boostButton")).toContainText("BTN 5", { timeout: 2000 });

  const frame = await page.evaluate(() => window.__INPUT_TEST__?.sampleTick({ grounded: true }));
  expect(frame?.car.boost).toBe(true);
});

test("cross-device union rebind: jump moves from RMB to Space (duplicate with ballCamera is allowed)", async ({
  page
}) => {
  await openControlsTab(page);

  await page.getByTestId("binding-jump").click();
  await page.keyboard.press("Space");
  await expect(page.getByTestId("binding-jump")).toHaveText("SPACE");

  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.openMainMenu());

  await page.keyboard.down("Space");
  const spaceFrame = await page.evaluate(() => window.__INPUT_TEST__?.sampleTick({ grounded: true }));
  await page.keyboard.up("Space");
  expect(spaceFrame?.edges.jumpPressed).toBe(true);
  expect(spaceFrame?.car.jump).toBe(true);
  // Space is still bound to ballCamera by default too — duplicates fire both.
  expect(spaceFrame?.edges.ballCameraPressed).toBe(true);

  const canvas = page.locator("canvas.game-canvas");
  await canvas.dispatchEvent("mousedown", { button: 2 });
  const rmbFrame = await page.evaluate(() => window.__INPUT_TEST__?.sampleTick({ grounded: true }));
  await canvas.dispatchEvent("mouseup", { button: 2 });
  expect(rmbFrame?.edges.jumpPressed).toBe(false);
  expect(rmbFrame?.car.jump).toBe(false);
});

test("RESET TO DEFAULTS restores W and jump back to RMB", async ({ page }) => {
  await openControlsTab(page);

  await page.getByTestId("binding-accelerate").click();
  await page.keyboard.press("KeyP");
  await expect(page.getByTestId("binding-accelerate")).toHaveText("P");

  await page.getByTestId("binding-jump").click();
  await page.keyboard.press("KeyJ");
  await expect(page.getByTestId("binding-jump")).toHaveText("J");

  await page.getByTestId("bindings-reset").click();

  await expect(page.getByTestId("binding-accelerate")).toHaveText("W");
  await expect(page.getByTestId("binding-jump")).toHaveText("RMB");

  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.openMainMenu());
  const canvas = page.locator("canvas.game-canvas");
  await canvas.dispatchEvent("mousedown", { button: 2 });
  const frame = await page.evaluate(() => window.__INPUT_TEST__?.sampleTick({ grounded: true }));
  await canvas.dispatchEvent("mouseup", { button: 2 });
  expect(frame?.car.jump).toBe(true);
});

test("air-roll sensitivity slider updates the live input carControlProfile", async ({ page }) => {
  await openControlsTab(page);

  await page.evaluate(() => {
    const input = document.querySelector('[data-testid="air-roll-sensitivity"]') as HTMLInputElement;
    input.value = "2";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

  const diagnostics = await page.evaluate(() => window.__INPUT_TEST__?.getDiagnostics());
  expect(diagnostics?.output.carControlProfile.airRollSensitivity).toBe(2);
});

test("gamepad air-roll semantic-trap fix: west button + stick left while airborne produces roll, matching the UI-displayed binding", async ({
  page
}) => {
  await openControlsTab(page);
  await page.getByTestId("bindings-device-gamepad").click();
  // Default binding: west (BTN 2) is what the UI shows AND what is consumed.
  await expect(page.getByTestId("binding-gamepad-airRollModifierButton")).toContainText("BTN 2");

  const gamepadIndex = await connectVirtualGamepad(page);
  await page.evaluate((index) => {
    const buttons = new Array(17).fill({ pressed: false, touched: false, value: 0 });
    buttons[2] = { pressed: true, touched: true, value: 1 }; // west
    window.__INPUT_TEST__?.setVirtualGamepadState(index, {
      connected: true,
      axes: [-1, 0, 0, 0],
      buttons
    });
    window.__INPUT_TEST__?.assignGamepad(index);
  }, gamepadIndex);
  await page.waitForTimeout(60);

  const frame = await page.evaluate(() => window.__INPUT_TEST__?.sampleTick({ grounded: false }));
  expect(frame?.car.roll).not.toBe(0);
});
