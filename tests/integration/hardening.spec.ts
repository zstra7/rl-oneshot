import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect
    .poll(() => page.evaluate(() => window.__GAME_TEST__?.ready() ?? false), {
      timeout: 15_000
    })
    .toBe(true);
});

/**
 * Master Brief Phase 17 ("Integration hardening"): individual module
 * Playwright suites each exercise one module against a live match, but
 * none of them run every module together for an extended stretch. This
 * runs physics + AI + camera + VFX + audio simultaneously through a full
 * match, checking for console errors, non-finite state, and stalled
 * diagnostics — the class of bug that only shows up when every system is
 * live at once, not in an isolated single-module test.
 */
test("a full match runs every module together for an extended stretch with no console errors", async ({
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

  await page.evaluate(() => window.__AUDIO_TEST__?.resume());
  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.openMatchSetup());
  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.startMatch());

  // The countdown (COUNTDOWN_3 -> ... -> GO) is tick-driven but only
  // advances in real time here (the RAF loop is live) — ~3.75s of
  // countdown plus setup overhead, so give it real margin.
  await expect
    .poll(() => page.evaluate(() => window.__GAME_TEST__?.gameFlow?.getSessionState().matchState), {
      timeout: 15_000
    })
    .toBe("PLAYING");

  // ~10 seconds of fixed ticks at 120Hz, driven manually so the check is
  // deterministic and fast rather than waiting on real time.
  await page.evaluate(() => window.__GAME_TEST__?.runtime.stepFixedTicks(1200));

  const carState = await page.evaluate(() => window.__GAME_TEST__?.runtime.getDiagnostics());
  expect(carState?.fixedTick).toBeGreaterThan(0);

  const cameraDiagnostics = await page.evaluate(() => window.__GAME_TEST__?.runtime.getCameraDiagnostics());
  expect(Number.isFinite(cameraDiagnostics?.position.x)).toBe(true);
  expect(Number.isFinite(cameraDiagnostics?.position.y)).toBe(true);
  expect(Number.isFinite(cameraDiagnostics?.position.z)).toBe(true);

  const vfxCount = await page.evaluate(() => window.__GAME_TEST__?.runtime.getVfxActiveParticleCount());
  expect(Number.isFinite(vfxCount)).toBe(true);

  const audioDiagnostics = await page.evaluate(() => window.__AUDIO_TEST__?.getDiagnostics());
  expect(audioDiagnostics?.lastError).toBeNull();

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("dispose() during a live match tears down cleanly with no console errors", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));

  await page.evaluate(() => window.__AUDIO_TEST__?.resume());
  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.openMatchSetup());
  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.startMatch());
  await expect
    .poll(() => page.evaluate(() => window.__GAME_TEST__?.gameFlow?.getSessionState().matchState), {
      timeout: 15_000
    })
    .toBe("PLAYING");

  await page.evaluate(() => window.__GAME_TEST__?.runtime.stepFixedTicks(200));

  const result = await page.evaluate(() => {
    try {
      window.__GAME_TEST__?.runtime.stop();
      return "ok";
    } catch (e) {
      return `ERR: ${(e as Error).message}`;
    }
  });
  expect(result).toBe("ok");

  const rafPending = await page.evaluate(() => window.__GAME_TEST__?.runtime.isRunning());
  expect(rafPending).toBe(false);
  expect(pageErrors).toEqual([]);
});
