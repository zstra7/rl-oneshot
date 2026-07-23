import { expect, test, type Page } from "@playwright/test";

/**
 * F12: SETTINGS is reachable from the pause menu as an overlay — matchState
 * deliberately stays "PAUSED" throughout (switching to "SETTINGS" would
 * un-pause physics via `isPaused()`'s gate in `GameRuntime`'s fixed tick),
 * distinguished only by `matchFlowStore.pauseSettingsOpen`.
 */

const SOUTH = 0;
const EAST = 1;
const DPAD_DOWN = 13;
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

async function activeElementText(page: Page): Promise<string> {
  return page.evaluate(() => document.activeElement?.textContent?.trim() ?? "");
}

async function activeElementTestId(page: Page): Promise<string | null> {
  return page.evaluate(() => document.activeElement?.getAttribute("data-testid") ?? null);
}

async function matchState(page: Page): Promise<string | undefined> {
  return page.evaluate(() => window.__GAME_TEST__?.gameFlow?.getMatchState());
}

async function startMatchAndReachPlaying(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__GAME_TEST__?.gameFlow?.openMatchSetup();
    window.__GAME_TEST__?.gameFlow?.startMatch();
    window.__GAME_TEST__?.gameFlow?.advanceGameTicks(460);
  });
  await expect.poll(() => matchState(page)).toBe("PLAYING");
}

async function pauseMatch(page: Page): Promise<void> {
  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.pause());
  await expect(page.getByTestId("pause-menu")).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect
    .poll(() => page.evaluate(() => window.__GAME_TEST__?.gameFlow?.ready() ?? false), {
      timeout: 15_000
    })
    .toBe(true);
});

test("pause -> SETTINGS overlay shows the panel, keeps matchState PAUSED, and freezes physics", async ({
  page
}) => {
  await startMatchAndReachPlaying(page);
  await pauseMatch(page);

  await page.getByTestId("pause-settings").click();

  await expect(page.getByTestId("settings-panel")).toBeVisible();
  await expect(page.getByTestId("pause-menu")).toBeHidden();
  expect(await matchState(page)).toBe("PAUSED");

  const carBefore = await page.evaluate(() => window.__PHYSICS_TEST__?.getCarState("car-player"));
  const sessionBefore = await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.getSessionState());

  // Physics is driven by the real rAF loop, not the deterministic tick
  // harness, here — wait real wall-clock time and confirm nothing moved.
  await page.waitForTimeout(500);

  const carAfter = await page.evaluate(() => window.__PHYSICS_TEST__?.getCarState("car-player"));
  const sessionAfter = await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.getSessionState());

  expect(carAfter?.position).toEqual(carBefore?.position);
  expect(sessionAfter?.regulationTimeRemaining).toBe(sessionBefore?.regulationTimeRemaining);
  expect(sessionAfter?.matchState).toBe("PAUSED");
});

test("SETTINGS overlay: preset change applies live and persists, BACK returns to pause menu focused on RESUME, RESUME resumes play", async ({
  page
}) => {
  await startMatchAndReachPlaying(page);
  await pauseMatch(page);
  await page.getByTestId("pause-settings").click();
  await expect(page.getByTestId("settings-panel")).toBeVisible();

  await page.getByTestId("settings-tab-graphics").click();
  await page.getByTestId("graphics-preset-authentic").click();

  const diagnostics = await page.evaluate(() => window.__GAME_TEST__?.runtime.getVisualDiagnostics());
  expect(diagnostics?.preset).toBe("authentic");

  const storedRaw = await page.evaluate(() => localStorage.getItem("space-carball-settings-v1"));
  const stored = JSON.parse(storedRaw!);
  expect(stored.graphics.preset).toBe("authentic");

  await page.getByText("BACK").click();

  await expect(page.getByTestId("pause-menu")).toBeVisible();
  await expect(page.getByTestId("settings-panel")).toBeHidden();
  expect(await matchState(page)).toBe("PAUSED");
  await expect.poll(() => activeElementText(page)).toBe("RESUME");

  await page.getByText("RESUME").click();
  await expect.poll(() => matchState(page)).toBe("PLAYING");
});

test("Escape while the overlay is open closes it (still PAUSED); Escape again resumes", async ({ page }) => {
  await startMatchAndReachPlaying(page);
  await pauseMatch(page);
  await page.getByTestId("pause-settings").click();
  await expect(page.getByTestId("settings-panel")).toBeVisible();

  await page.keyboard.press("Escape");

  await expect(page.getByTestId("pause-menu")).toBeVisible();
  await expect(page.getByTestId("settings-panel")).toBeHidden();
  expect(await matchState(page)).toBe("PAUSED");

  await page.keyboard.press("Escape");

  await expect.poll(() => matchState(page)).toBe("PLAYING");
});

test("controller: dpad navigates the overlay, east goes back to the pause menu", async ({ page }) => {
  await startMatchAndReachPlaying(page);

  const index = await connectPad(page);

  await pauseMatch(page);
  await expect.poll(() => activeElementText(page)).toBe("RESUME");

  await pulse(page, index, DPAD_DOWN);
  expect(await activeElementText(page)).toBe("SETTINGS");
  await pulse(page, index, SOUTH);

  await expect(page.getByTestId("settings-panel")).toBeVisible();
  await expect.poll(() => activeElementTestId(page)).toBe("settings-tab-gameplay");

  // dpad-right walks across the category tabs.
  await pulse(page, index, DPAD_RIGHT);
  expect(await activeElementTestId(page)).toBe("settings-tab-camera");

  // East always targets [data-menu-back] — SettingsPanel's BACK button —
  // regardless of which tab/control currently has focus.
  await pulse(page, index, EAST);

  await expect(page.getByTestId("pause-menu")).toBeVisible();
  await expect(page.getByTestId("settings-panel")).toBeHidden();
  expect(await matchState(page)).toBe("PAUSED");
  await expect.poll(() => activeElementText(page)).toBe("RESUME");
});
