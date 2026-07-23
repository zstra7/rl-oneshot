import { expect, test, type Page } from "@playwright/test";

/**
 * F10: `PauseMenu.vue`'s RESTART/RETURN actions used to gate on
 * `window.confirm`, which is invisible to the gamepad layer and was only
 * "passing" in Playwright because native dialogs auto-dismiss. Both actions
 * now open an inline `[data-testid="pause-confirm-yes"/"pause-confirm-no"]`
 * confirm row instead.
 */

const SOUTH = 0;
const DPAD_DOWN = 13;

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

test("mouse: RETURN TO MENU opens the confirm row, CONFIRM returns to the main menu", async ({
  page
}) => {
  await startMatchAndReachPlaying(page);
  await pauseMatch(page);

  await page.getByText("RETURN TO MENU").click();

  await expect(page.getByTestId("pause-confirm-yes")).toBeVisible();
  await expect(page.getByTestId("pause-confirm-no")).toBeVisible();
  await expect.poll(() => activeElementTestId(page)).toBe("pause-confirm-no");

  await page.getByTestId("pause-confirm-yes").click();

  await expect.poll(() => matchState(page)).toBe("MAIN_MENU");
});

test("mouse: RESTART MATCH -> CANCEL stays PAUSED with RESTART MATCH still present", async ({
  page
}) => {
  await startMatchAndReachPlaying(page);
  await pauseMatch(page);

  await page.getByText("RESTART MATCH").click();
  await expect(page.getByTestId("pause-confirm-yes")).toBeVisible();

  await page.getByTestId("pause-confirm-no").click();

  expect(await matchState(page)).toBe("PAUSED");
  await expect(page.getByText("RESTART MATCH")).toBeVisible();
  await expect(page.getByTestId("pause-confirm-yes")).toBeHidden();
});

test("pad: dpad to RESTART, South opens the confirm row (focus on CANCEL), navigate to CONFIRM, South restarts", async ({
  page
}) => {
  await startMatchAndReachPlaying(page);

  const index = await connectPad(page);

  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.pause());
  await expect(page.getByTestId("pause-menu")).toBeVisible();

  // F12 inserted SETTINGS between RESUME and RESTART MATCH, so it now takes
  // two dpad-down presses from RESUME to land on RESTART MATCH.
  await pulse(page, index, DPAD_DOWN);
  await pulse(page, index, DPAD_DOWN);
  expect(await activeElementTestId(page)).not.toBe("pause-confirm-yes");

  await pulse(page, index, SOUTH);
  await expect.poll(() => activeElementTestId(page)).toBe("pause-confirm-no");
  await expect(page.getByTestId("pause-confirm-yes")).toBeVisible();

  // Focus lands on CANCEL by design (safe default) — navigate up to CONFIRM
  // before confirming.
  await pulse(page, index, DPAD_DOWN);
  await expect.poll(() => activeElementTestId(page)).toBe("pause-confirm-yes");

  await pulse(page, index, SOUTH);

  // restartMatch() synchronously runs beginKickoffReset(), which ends at
  // COUNTDOWN_3 (src/game-flow/MatchFlowController.ts) — proves the actual
  // restart runtime call fired, not just a UI state change.
  await expect.poll(() => matchState(page)).toBe("COUNTDOWN_3");
});
