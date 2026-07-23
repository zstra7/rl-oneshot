import { expect, test, type Page } from "@playwright/test";

/**
 * F9: `src/styles/retro-ui.css` provides the R11 amber `:focus` outline for
 * `.wo-item/.duration-item/.tab/.chip/.swatch/input[type=range]/input[type=color]`,
 * but eight components used to carry a scoped `.menu-item:focus-visible {
 * outline: none; }` that beat it whenever focus arrived via keyboard/gamepad
 * (equal specificity, later cascade). This suite drives real focus onto one
 * representative control per screen via the virtual gamepad d-pad (never
 * `el.focus()` directly) and asserts the resulting outline is visible.
 */

const START = 9;
const DPAD_DOWN = 13;
const DPAD_UP = 12;

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

async function pulse(page: Page, index: number, button: number): Promise<void> {
  await setPadState(page, index, { pressed: [button] });
  await page.waitForTimeout(80);
  await setPadState(page, index, { pressed: [] });
  await page.waitForTimeout(80);
}

async function activeElementTestId(page: Page): Promise<string | null> {
  return page.evaluate(() => document.activeElement?.getAttribute("data-testid") ?? null);
}

async function activeElementText(page: Page): Promise<string> {
  return page.evaluate(() => document.activeElement?.textContent?.trim() ?? "");
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

/** Bounded dpad-down walk until the focused element's text matches, or throws. */
async function navigateDownUntilText(
  page: Page,
  index: number,
  text: string,
  maxSteps = 12
): Promise<void> {
  for (let i = 0; i < maxSteps; i += 1) {
    if ((await activeElementText(page)) === text) {
      return;
    }
    await pulse(page, index, DPAD_DOWN);
  }
  throw new Error(`Never reached focus target "${text}" within ${maxSteps} dpad-down presses.`);
}

/** The core F9 assertion: whatever is currently focused must show a visible outline. */
async function expectFocusVisible(page: Page): Promise<void> {
  const outline = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el) return null;
    const style = getComputedStyle(el);
    return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
  });
  expect(outline).not.toBeNull();
  expect(outline!.outlineStyle).not.toBe("none");
  expect(outline!.outlineWidth).not.toBe("0px");
}

/**
 * Mirrors tests/game-flow/match-flow.spec.ts's helper of the same name —
 * re-parks the opponent every couple of seconds so it can't score for real
 * and force overtime while we fast-forward the regulation clock to zero.
 * Deliberately does NOT pause the runtime (unlike that file): this suite
 * keeps the live rAF loop running throughout so gamepad menu-navigation
 * frames (emitted only from GameRuntime's per-rendered-frame path — see
 * tests/ui/controller-navigation.spec.ts) keep flowing.
 */
async function fastForwardWithOpponentParked(page: Page, totalSeconds: number): Promise<void> {
  const chunkSeconds = 2;
  let remaining = totalSeconds;
  while (remaining > 0) {
    const seconds = Math.min(chunkSeconds, remaining);
    await page.evaluate(() =>
      window.__PHYSICS_TEST__?.setCarState("car-opponent", { position: { x: 40, y: 1, z: 40 } })
    );
    await page.evaluate((s) => window.__GAME_TEST__?.gameFlow?.advanceGameSeconds(s), seconds);
    remaining -= seconds;
  }
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

test("main menu: every item shows a visible focus outline while dpad-navigating", async ({ page }) => {
  const index = await connectPad(page);

  await expect.poll(() => activeElementText(page)).toBe("PLAY");
  await expectFocusVisible(page);

  for (const label of ["ONLINE", "CUSTOMISE CAR", "TOURNAMENT", "SETTINGS"]) {
    await pulse(page, index, DPAD_DOWN);
    expect(await activeElementText(page)).toBe(label);
    await expectFocusVisible(page);
  }
});

test("match setup: start-match and BACK show a visible focus outline", async ({ page }) => {
  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.openMatchSetup());
  await expect(page.getByTestId("match-setup")).toBeVisible();

  const index = await connectPad(page);

  await navigateDownUntilTestId(page, index, "start-match");
  await expectFocusVisible(page);

  // BACK carries data-menu-back but no dedicated testid — walk by text.
  await navigateDownUntilText(page, index, "BACK");
  await expectFocusVisible(page);
});

test("pause menu: RESUME, SETTINGS, RESTART MATCH, and RETURN TO MENU each show a visible focus outline", async ({
  page
}) => {
  await startMatchAndReachPlaying(page);

  const index = await connectPad(page);

  await pulse(page, index, START);
  await expect.poll(() => matchState(page)).toBe("PAUSED");
  await expect.poll(() => activeElementText(page)).toBe("RESUME");
  await expectFocusVisible(page);

  // F12 inserted SETTINGS between RESUME and RESTART MATCH.
  await pulse(page, index, DPAD_DOWN);
  expect(await activeElementText(page)).toBe("SETTINGS");
  await expectFocusVisible(page);

  await pulse(page, index, DPAD_DOWN);
  expect(await activeElementText(page)).toBe("RESTART MATCH");
  await expectFocusVisible(page);

  await pulse(page, index, DPAD_DOWN);
  expect(await activeElementText(page)).toBe("RETURN TO MENU");
  await expectFocusVisible(page);
});

test("results screen: REPLAY and RETURN TO MENU each show a visible focus outline", async ({ page }) => {
  await page.evaluate(() => {
    window.__GAME_TEST__?.gameFlow?.openMatchSetup();
    window.__GAME_TEST__?.gameFlow?.selectMatchDuration(1);
    window.__GAME_TEST__?.gameFlow?.startMatch();
    window.__GAME_TEST__?.gameFlow?.advanceGameTicks(460);
    window.__GAME_TEST__?.gameFlow?.simulateGoal("player");
  });
  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.advanceGameTicks(264 + 460));
  await fastForwardWithOpponentParked(page, 60);
  await expect(page.getByTestId("results-screen")).toBeVisible({ timeout: 15_000 });

  const index = await connectPad(page);

  await expect.poll(() => activeElementText(page)).toBe("REPLAY");
  await expectFocusVisible(page);

  await pulse(page, index, DPAD_DOWN);
  expect(await activeElementText(page)).toBe("RETURN TO MENU");
  await expectFocusVisible(page);
});

test("tournament setup: BEGIN TOURNAMENT and BACK each show a visible focus outline", async ({ page }) => {
  await page.getByTestId("open-tournament").click();
  await expect(page.getByTestId("tournament-bracket")).toBeVisible();

  const index = await connectPad(page);

  await navigateDownUntilTestId(page, index, "tournament-begin");
  await expectFocusVisible(page);

  await pulse(page, index, DPAD_DOWN);
  expect(await activeElementText(page)).toBe("BACK");
  await expectFocusVisible(page);
});

test("settings: a category tab and a range slider each show a visible focus outline", async ({ page }) => {
  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.openSettings());
  await expect(page.getByTestId("settings-panel")).toBeVisible();

  const index = await connectPad(page);

  await navigateDownUntilTestId(page, index, "settings-tab-camera");
  await expectFocusVisible(page);

  await page.getByTestId("settings-tab-camera").click();
  await navigateDownUntilTestId(page, index, "camera-fov");
  const active = await page.evaluate(() => document.activeElement?.tagName);
  expect(active).toBe("INPUT");
  await expectFocusVisible(page);
});

test("car customise: a swatch shows a visible focus outline", async ({ page }) => {
  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.openCarCustomise());
  await expect(page.getByTestId("car-customise")).toBeVisible();

  const index = await connectPad(page);

  await navigateDownUntilTestId(page, index, "body-swatch-1");
  // Force an explicit gamepad-driven .focus() call (not just mount
  // auto-focus) by cycling down and back up.
  await pulse(page, index, DPAD_DOWN);
  await pulse(page, index, DPAD_UP);
  expect(await activeElementTestId(page)).toBe("body-swatch-1");
  await expectFocusVisible(page);
});
