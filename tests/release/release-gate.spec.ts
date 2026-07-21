import { expect, test } from "@playwright/test";

/**
 * Master Brief Phase 18 ("Final build gate") / "Final Goal": a clean
 * checkout must support `npm ci -> npm run validate -> npm run build ->
 * npm run test:release` with no manual fixes. `npm run build` (the
 * literal command `test:release` runs) does NOT set `PLAYWRIGHT_TEST=1`,
 * so `window.__GAME_TEST__`/`__AUDIO_TEST__`/etc. are not installed on
 * this build (`__TEST_BUILD__` stays false, per `vite.config.ts` — see
 * `docs/build-decisions.md` Phase 1). This suite therefore drives the app
 * entirely through real DOM interaction (clicks, keyboard events, visible
 * `data-testid`/`data-app-state` attributes), exactly like an end user
 * would, so it validates the literal artifact `npm run build` produces —
 * not a test-mode build standing in for it.
 */
test("the plain production build boots, plays through menus into a live match, and returns to the menu with no console errors", async ({
  page
}) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });

  await page.goto("/");

  await expect
    .poll(() => page.evaluate(() => document.querySelector("#app-root")?.getAttribute("data-app-state")), {
      timeout: 15_000
    })
    .toBe("MENU");

  await expect(page.getByTestId("main-menu")).toBeVisible();
  await page.getByTestId("main-menu").getByText("PLAY").click();

  await expect(page.getByTestId("match-setup")).toBeVisible();
  await page.getByTestId("duration-1").click();
  await page.getByTestId("start-match").click();

  await expect(page.getByTestId("countdown-overlay")).toBeVisible();

  await expect
    .poll(() => page.evaluate(() => document.querySelector("#app-root")?.getAttribute("data-app-state")), {
      timeout: 15_000
    })
    .toBe("MATCH");

  await expect(page.getByTestId("gameplay-hud")).toBeVisible();

  // Controls (and pause) are only live once the countdown finishes.
  await expect(page.getByTestId("countdown-overlay")).toBeHidden({ timeout: 15_000 });

  // Drive for a moment with real keyboard input, exactly like a player,
  // to exercise input -> physics -> render -> audio/VFX end to end on the
  // literal production artifact.
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(500);
  await page.keyboard.up("KeyW");

  await expect(page.getByTestId("player-score")).toBeVisible();
  await expect(page.getByTestId("match-timer")).toBeVisible();

  // Pause and return to the main menu without waiting out the full match.
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("pause-menu")).toBeVisible();
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByText("RETURN TO MENU").click();

  await expect
    .poll(() => page.evaluate(() => document.querySelector("#app-root")?.getAttribute("data-app-state")), {
      timeout: 15_000
    })
    .toBe("MENU");
  await expect(page.getByTestId("main-menu")).toBeVisible();

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("no window.__GAME_TEST__/__AUDIO_TEST__ debug hooks are exposed on a plain production build", async ({
  page
}) => {
  await page.goto("/");
  await expect
    .poll(() => page.evaluate(() => document.querySelector("#app-root")?.getAttribute("data-app-state")), {
      timeout: 15_000
    })
    .toBe("MENU");

  const hooks = await page.evaluate(() => ({
    gameTest: typeof window.__GAME_TEST__,
    audioTest: typeof window.__AUDIO_TEST__
  }));

  expect(hooks.gameTest).toBe("undefined");
  expect(hooks.audioTest).toBe("undefined");
});

test("no external (third-party) network requests are made from a live production match", async ({ page }) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const rawUrl = request.url();
    // `blob:` object URLs (source maps, media buffers created client-side)
    // are same-origin data, not network fetches — `new URL()` on one
    // yields the *inner* URL's hostname, not a real remote host.
    if (rawUrl.startsWith("blob:") || rawUrl.startsWith("data:")) {
      return;
    }
    const url = new URL(rawUrl);
    if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
      externalRequests.push(rawUrl);
    }
  });

  await page.goto("/");
  await expect
    .poll(() => page.evaluate(() => document.querySelector("#app-root")?.getAttribute("data-app-state")), {
      timeout: 15_000
    })
    .toBe("MENU");

  await page.getByTestId("main-menu").getByText("PLAY").click();
  await page.getByTestId("start-match").click();
  await expect
    .poll(() => page.evaluate(() => document.querySelector("#app-root")?.getAttribute("data-app-state")), {
      timeout: 15_000
    })
    .toBe("MATCH");

  await page.waitForTimeout(500);

  expect(externalRequests).toEqual([]);
});
