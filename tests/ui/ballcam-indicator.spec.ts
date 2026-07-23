import { expect, test, type Page } from "@playwright/test";

/**
 * F11 (plan/ARENA_FLUSH_AND_REFINEMENTS_PLAN.md): bottom-left HUD indicator
 * showing the ball-cam toggle binding for the most recently used input
 * device. The runtime rAF loop stays live throughout (like
 * tests/ui/controller-navigation.spec.ts) so real keyboard/gamepad input
 * drives InputControlsModule's own device-tracking path, not a test-only
 * shortcut.
 */

async function connectPad(page: Page): Promise<number> {
  const index = await page.evaluate(() =>
    window.__INPUT_TEST__?.connectVirtualGamepad({
      id: "Virtual Test Pad (Standard)",
      mapping: "standard",
      axesCount: 4,
      buttonCount: 17
    })
  );
  await page.evaluate((i) => window.__INPUT_TEST__?.assignGamepad(i!), index);
  return index as number;
}

/** Replaces the full button/axes state — callers must re-list anything still held. */
async function setPadState(page: Page, index: number, pressed: number[]): Promise<void> {
  await page.evaluate(
    ({ index, pressed }) => {
      const buttons = new Array(17)
        .fill(null)
        .map((_, i) => ({
          pressed: pressed.includes(i),
          touched: pressed.includes(i),
          value: pressed.includes(i) ? 1 : 0
        }));
      window.__INPUT_TEST__?.setVirtualGamepadState(index, {
        connected: true,
        axes: [0, 0, 0, 0],
        buttons
      });
    },
    { index, pressed }
  );
}

/** A single press-then-release edge pulse, long enough to span several rAF frames each way. */
async function pulsePad(page: Page, index: number, button: number): Promise<void> {
  await setPadState(page, index, [button]);
  await page.waitForTimeout(80);
  await setPadState(page, index, []);
  await page.waitForTimeout(80);
}

async function startMatchAndReachPlaying(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__GAME_TEST__?.gameFlow?.openMatchSetup();
    window.__GAME_TEST__?.gameFlow?.startMatch();
    window.__GAME_TEST__?.gameFlow?.advanceGameTicks(460);
  });
  await expect
    .poll(() => page.evaluate(() => window.__GAME_TEST__?.gameFlow?.getMatchState()))
    .toBe("PLAYING");
}

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
});

test("indicator is visible and dim before ball cam is toggled, lights up on Space, dims again on a second press; label reads SPACE", async ({
  page
}) => {
  await startMatchAndReachPlaying(page);

  const indicator = page.getByTestId("ballcam-indicator");
  await expect(indicator).toBeVisible();
  await expect(indicator).not.toHaveClass(/active/);
  await expect(indicator).toContainText("SPACE");

  await page.keyboard.press("Space");
  await expect.poll(() => indicator.evaluate((el) => el.classList.contains("active"))).toBe(true);

  await page.keyboard.press("Space");
  await expect.poll(() => indicator.evaluate((el) => el.classList.contains("active"))).toBe(false);
});

test("connecting a pad and pressing a button switches the label to the gamepad binding; the mapped button toggles active", async ({
  page
}) => {
  await startMatchAndReachPlaying(page);

  const indicator = page.getByTestId("ballcam-indicator");
  await expect(indicator).toContainText("SPACE");

  const padIndex = await connectPad(page);

  // Any pad button switches the active device to gamepad -- press "east"
  // (boost, index 1), which is NOT the ball-cam binding, to prove the
  // label switch is driven by the device change alone, not by the
  // ball-cam binding happening to fire.
  await pulsePad(page, padIndex, 1);
  await expect(indicator).toContainText("BTN 3");
  await expect(indicator).not.toHaveClass(/active/);

  // Default gamepad ballCameraButton is "north" (index 3,
  // src/input/bindings/DefaultBindings.ts) -- pressing the actually-mapped
  // button toggles ball cam, proving the binding itself is read correctly
  // end-to-end.
  await pulsePad(page, padIndex, 3);
  await expect.poll(() => indicator.evaluate((el) => el.classList.contains("active"))).toBe(true);

  await pulsePad(page, padIndex, 3);
  await expect.poll(() => indicator.evaluate((el) => el.classList.contains("active"))).toBe(false);
});

test("rebinding ball cam to KeyB and pressing a real key switches the device back to keyboard and shows the new label", async ({
  page
}) => {
  await startMatchAndReachPlaying(page);

  const indicator = page.getByTestId("ballcam-indicator");

  // Drive the active device to gamepad first, so the keyboard press below
  // proves the device actually switches back (not just that it started
  // there).
  const padIndex = await connectPad(page);
  await pulsePad(page, padIndex, 0); // south (jump) -- any pad button switches the device
  await expect(indicator).toContainText("BTN 3");

  await page.evaluate(() => {
    const bindings = window.__GAME_TEST__!.runtime.getControlBindings();
    window.__GAME_TEST__!.runtime.setControlBindings({
      ...bindings,
      keyboardMouse: { ...bindings.keyboardMouse, ballCamera: "KeyB" }
    });
  });

  await page.keyboard.press("KeyW"); // any real key press switches device back to keyboard-mouse
  await expect(indicator).toContainText("B");
  await expect(indicator).not.toContainText("BTN");
});
