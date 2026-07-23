import { expect, test, type Page } from "@playwright/test";

/**
 * R11: gamepad d-pad/left-stick menu navigation + the anti-double-trigger
 * safeguards (edge quarantine, stick hysteresis, require-release re-arm).
 * The runtime rAF loop stays live throughout this file (unlike
 * tests/input/foundation.spec.ts, which pauses it) — menu-navigation
 * frames are only emitted from GameRuntime's own per-rendered-frame path.
 */

// Standard gamepad mapping indices (src/input/bindings/DefaultBindings.ts).
const SOUTH = 0;
const EAST = 1;
const START = 9;
const DPAD_UP = 12;
const DPAD_DOWN = 13;
const DPAD_LEFT = 14;
const DPAD_RIGHT = 15;

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
async function setPadState(
  page: Page,
  index: number,
  options: { pressed?: number[]; axes?: [number, number, number, number] }
): Promise<void> {
  await page.evaluate(
    ({ index, pressed, axes }) => {
      const buttons = new Array(17)
        .fill(null)
        .map((_, i) => ({
          pressed: pressed.includes(i),
          touched: pressed.includes(i),
          value: pressed.includes(i) ? 1 : 0
        }));
      window.__INPUT_TEST__?.setVirtualGamepadState(index, {
        connected: true,
        axes,
        buttons
      });
    },
    { index, pressed: options.pressed ?? [], axes: options.axes ?? [0, 0, 0, 0] }
  );
}

/** A single press-then-release edge pulse, long enough to span several rAF frames each way. */
async function pulse(page: Page, index: number, button: number): Promise<void> {
  await setPadState(page, index, { pressed: [button] });
  await page.waitForTimeout(80);
  await setPadState(page, index, { pressed: [] });
  await page.waitForTimeout(80);
}

async function activeElementText(page: Page): Promise<string> {
  return page.evaluate(() => document.activeElement?.textContent?.trim() ?? "");
}

async function activeElementTestId(page: Page): Promise<string | null> {
  return page.evaluate(() => document.activeElement?.getAttribute("data-testid") ?? null);
}

async function matchState(page: Page): Promise<string | undefined> {
  return page.evaluate(() => window.__GAME_TEST__?.gameFlow?.getMatchState());
}

/** Bounded dpad-down walk until the focused element's testid matches, or throws. */
async function navigateDownUntilTestId(
  page: Page,
  index: number,
  testId: string,
  maxSteps = 12
): Promise<void> {
  for (let i = 0; i < maxSteps; i += 1) {
    if ((await activeElementTestId(page)) === testId) {
      return;
    }
    await pulse(page, index, DPAD_DOWN);
  }
  throw new Error(`Never reached focus target "${testId}" within ${maxSteps} dpad-down presses.`);
}

async function startMatchAndReachPlaying(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__GAME_TEST__?.gameFlow?.openMatchSetup();
    window.__GAME_TEST__?.gameFlow?.startMatch();
    window.__GAME_TEST__?.gameFlow?.advanceGameTicks(460);
  });
  await expect.poll(() => matchState(page)).toBe("PLAYING");
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect
    .poll(() => page.evaluate(() => window.__GAME_TEST__?.gameFlow?.ready() ?? false), {
      timeout: 15_000
    })
    .toBe(true);
});

test("main menu: dpad down/up moves focus, south opens MATCH_SETUP", async ({ page }) => {
  await expect(page.getByTestId("main-menu")).toBeVisible();
  await expect.poll(() => activeElementText(page)).toBe("PLAY");

  const index = await connectPad(page);

  // R12/R13 inserted CUSTOMISE CAR and TOURNAMENT between PLAY and
  // SETTINGS, so one dpad-down from PLAY now lands on CUSTOMISE CAR.
  await pulse(page, index, DPAD_DOWN);
  expect(await activeElementText(page)).toBe("CUSTOMISE CAR");

  await pulse(page, index, DPAD_UP);
  expect(await activeElementText(page)).toBe("PLAY");

  await pulse(page, index, SOUTH);
  await expect.poll(() => matchState(page)).toBe("MATCH_SETUP");
});

test("match setup: dpad reaches a duration chip, south selects it, east goes back", async ({
  page
}) => {
  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.openMatchSetup());
  await expect(page.getByTestId("match-setup")).toBeVisible();
  await expect.poll(() => activeElementTestId(page)).toBe("duration-1");

  const index = await connectPad(page);

  // Horizontal group navigation within .duration-row and back.
  await pulse(page, index, DPAD_RIGHT);
  expect(await activeElementTestId(page)).toBe("duration-3");
  await pulse(page, index, DPAD_LEFT);
  expect(await activeElementTestId(page)).toBe("duration-1");

  await pulse(page, index, SOUTH);
  const session = await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.getSessionState());
  expect(session?.selectedDurationMinutes).toBe(1);

  await pulse(page, index, EAST);
  await expect.poll(() => matchState(page)).toBe("MAIN_MENU");
});

test("pause menu: pad start pauses, dpad reaches RETURN TO MENU, east resumes via RESUME (data-menu-back)", async ({
  page
}) => {
  await startMatchAndReachPlaying(page);

  const index = await connectPad(page);

  await pulse(page, index, START);
  await expect.poll(() => matchState(page)).toBe("PAUSED");
  await expect.poll(() => activeElementText(page)).toBe("RESUME");

  // F12 inserted SETTINGS between RESUME and RESTART MATCH, so RETURN TO
  // MENU is now three dpad-down presses below RESUME.
  await pulse(page, index, DPAD_DOWN);
  await pulse(page, index, DPAD_DOWN);
  await pulse(page, index, DPAD_DOWN);
  expect(await activeElementText(page)).toBe("RETURN TO MENU");

  // East always targets [data-menu-back] regardless of focus — RESUME
  // carries that attribute on the pause menu, not RETURN TO MENU.
  await pulse(page, index, EAST);
  await expect.poll(() => matchState(page)).toBe("PLAYING");
});

test("settings: dpad reaches a camera slider, dpad-right x3 increases its value", async ({
  page
}) => {
  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.openSettings());
  await page.getByTestId("settings-tab-camera").click();

  const index = await connectPad(page);

  // DOM order is [6 category tabs] -> [active category's rows] -> BACK, so
  // FOV sits after every tab regardless of which one is active — walk down
  // until we land on it rather than hard-coding a step count.
  await navigateDownUntilTestId(page, index, "camera-fov");

  const before = await page.evaluate(() => window.__GAME_TEST__?.runtime.getCameraSettings().fov);

  await pulse(page, index, DPAD_RIGHT);
  await pulse(page, index, DPAD_RIGHT);
  await pulse(page, index, DPAD_RIGHT);

  await expect
    .poll(() => page.evaluate(() => window.__GAME_TEST__?.runtime.getCameraSettings().fov))
    .toBe((before ?? 0) + 3);
});

test("mouse still works after gamepad use", async ({ page }) => {
  const index = await connectPad(page);
  await pulse(page, index, DPAD_DOWN);
  expect(await activeElementText(page)).toBe("CUSTOMISE CAR");

  await page.getByRole("button", { name: "PLAY" }).click();
  await expect.poll(() => matchState(page)).toBe("MATCH_SETUP");
});

test("anti-double-trigger: one held press moves focus exactly once (~300ms hold, 380ms repeat delay)", async ({
  page
}) => {
  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.openMatchSetup());
  await expect.poll(() => activeElementTestId(page)).toBe("duration-1");

  const index = await connectPad(page);

  await setPadState(page, index, { pressed: [DPAD_RIGHT] });
  await page.waitForTimeout(300);
  await setPadState(page, index, { pressed: [] });

  // A double-fire within the 380ms initial repeat delay would land two
  // steps over (duration-10); a single press must land exactly one step
  // over (duration-3).
  expect(await activeElementTestId(page)).toBe("duration-3");
});

test("anti-double-trigger: south on PLAY opens MATCH_SETUP without also activating the new screen", async ({
  page
}) => {
  const defaultSession = await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.getSessionState());
  const defaultMinutes = defaultSession?.selectedDurationMinutes;

  const index = await connectPad(page);
  await expect.poll(() => activeElementText(page)).toBe("PLAY");

  await pulse(page, index, SOUTH);

  await expect.poll(() => matchState(page)).toBe("MATCH_SETUP");
  const session = await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.getSessionState());
  // If the same confirm edge had leaked into MATCH_SETUP's freshly-focused
  // duration-1 chip, this would now read 1 regardless of the prior default.
  expect(session?.selectedDurationMinutes).toBe(defaultMinutes);
});

test("anti-double-trigger: no jump on resume while South is held through the pause->resume transition", async ({
  page
}) => {
  await startMatchAndReachPlaying(page);

  const index = await connectPad(page);

  await pulse(page, index, START);
  await expect.poll(() => matchState(page)).toBe("PAUSED");
  await expect.poll(() => activeElementText(page)).toBe("RESUME");

  // Hold South through the transition instead of a clean pulse.
  await setPadState(page, index, { pressed: [SOUTH] });
  await expect.poll(() => matchState(page)).toBe("PLAYING");

  // Keep holding for ~30 ticks (~500ms) — the car must never leave the
  // ground: the require-release re-arm mask must have swallowed the
  // still-held South before the first post-resume gameplay tick.
  for (let i = 0; i < 6; i += 1) {
    await page.waitForTimeout(80);
    const car = await page.evaluate(() => window.__PHYSICS_TEST__?.getCarState("car-player"));
    expect(car?.grounded).toBe(true);
    expect(car!.linearVelocity.y).toBeLessThan(1);
  }

  // Release, then a fresh press must jump normally — proves the mask
  // cleared on release rather than getting stuck forever.
  await setPadState(page, index, { pressed: [] });
  await page.waitForTimeout(100);
  await setPadState(page, index, { pressed: [SOUTH] });

  await expect
    .poll(async () => {
      const car = await page.evaluate(() => window.__PHYSICS_TEST__?.getCarState("car-player"));
      return car?.grounded === false || (car?.linearVelocity.y ?? 0) > 1;
    }, { timeout: 3_000 })
    .toBe(true);

  await setPadState(page, index, { pressed: [] });
});

test("anti-double-trigger: south taps while paused never leak into a gameplay JUMP edge on resume", async ({
  page
}) => {
  await startMatchAndReachPlaying(page);

  const index = await connectPad(page);

  await pulse(page, index, START);
  await expect.poll(() => matchState(page)).toBe("PAUSED");
  await expect.poll(() => activeElementText(page)).toBe("RESUME");

  // Move to RESTART MATCH and tap South twice: the first South opens the
  // inline confirm row (never resuming, never touching the gameplay JUMP
  // queue, since South is quarantined as a menu edge for the whole time the
  // pause menu is up); focus lands on CANCEL, so the second South cancels
  // the confirm rather than confirming it — still no leak either way.
  // F12 inserted SETTINGS between RESUME and RESTART MATCH, so it's now two
  // dpad-down presses below RESUME.
  await pulse(page, index, DPAD_DOWN);
  await pulse(page, index, DPAD_DOWN);
  expect(await activeElementText(page)).toBe("RESTART MATCH");
  await pulse(page, index, SOUTH);
  await expect.poll(() => page.getByTestId("pause-confirm-no").isVisible()).toBe(true);
  await expect.poll(() => activeElementText(page)).toBe("CANCEL");
  await pulse(page, index, SOUTH);
  expect(await matchState(page)).toBe("PAUSED");
  await expect(page.getByText("RESTART MATCH")).toBeVisible();

  // Back to RESUME, then resume via East (back). F12 inserted SETTINGS
  // between RESUME and RESTART MATCH, so it's now two dpad-up presses.
  await pulse(page, index, DPAD_UP);
  await pulse(page, index, DPAD_UP);
  expect(await activeElementText(page)).toBe("RESUME");
  await pulse(page, index, EAST);
  await expect.poll(() => matchState(page)).toBe("PLAYING");

  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.advanceGameTicks(5));
  const car = await page.evaluate(() => window.__PHYSICS_TEST__?.getCarState("car-player"));
  expect(car?.grounded).toBe(true);
  expect(car!.linearVelocity.y).toBeLessThan(1);
});

test("anti-double-trigger: left-stick hysteresis (0.45 no-op, 0.6 engages, 0.4 holds without oscillating)", async ({
  page
}) => {
  await expect.poll(() => activeElementText(page)).toBe("PLAY");
  const index = await connectPad(page);

  // Below the 0.5 engage threshold: no navigation.
  await setPadState(page, index, { axes: [0, 0.45, 0, 0] });
  await page.waitForTimeout(150);
  expect(await activeElementText(page)).toBe("PLAY");

  // Above 0.5: engages and fires an immediate move.
  await setPadState(page, index, { axes: [0, 0.6, 0, 0] });
  await expect.poll(() => activeElementText(page)).toBe("CUSTOMISE CAR");

  // Between release (0.35) and engage (0.5): stays held (hysteresis) —
  // not released and re-engaged as a fresh press — so the only further
  // moves that can occur are the normal 380ms-delayed/140ms-repeat ones,
  // never a same-frame extra move. Count actual focus transitions over a
  // real-clock 200ms window (rather than asserting a single before/after
  // snapshot, whose own polling overhead can straddle the repeat-delay
  // boundary): at most one extra move is acceptable in that window.
  await setPadState(page, index, { axes: [0, 0.4, 0, 0] });
  const windowStart = Date.now();
  let lastText = await activeElementText(page);
  let transitions = 0;
  while (Date.now() - windowStart < 200) {
    const text = await activeElementText(page);
    if (text !== lastText) {
      transitions += 1;
      lastText = text;
    }
    await page.waitForTimeout(20);
  }
  expect(transitions).toBeLessThanOrEqual(1);

  await setPadState(page, index, { axes: [0, 0, 0, 0] });
});
