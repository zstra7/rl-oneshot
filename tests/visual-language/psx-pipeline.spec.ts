import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect
    .poll(() => page.evaluate(() => window.__GAME_TEST__?.gameFlow?.ready() ?? false), {
      timeout: 15_000
    })
    .toBe(true);
});

test("defaults to the balanced preset (426x240)", async ({ page }) => {
  const diagnostics = await page.evaluate(() => window.__GAME_TEST__?.runtime.getVisualDiagnostics());
  expect(diagnostics?.preset).toBe("balanced");
  expect(diagnostics?.internalResolution).toEqual({ width: 426, height: 240 });
});

test("setVisualPreset switches the internal resolution and settings live, with no console errors", async ({
  page
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));

  await page.evaluate(() => window.__GAME_TEST__?.runtime.setVisualPreset("authentic"));
  await page.waitForTimeout(200);
  let diagnostics = await page.evaluate(() => window.__GAME_TEST__?.runtime.getVisualDiagnostics());
  expect(diagnostics?.preset).toBe("authentic");
  expect(diagnostics?.internalResolution).toEqual({ width: 320, height: 180 });
  // WS8.A: jitter disabled product-wide (z-fighting) — all three presets
  // now report false; infrastructure/toggle wiring stays intact.
  expect(diagnostics?.settings.jitterEnabled).toBe(false);

  await page.evaluate(() => window.__GAME_TEST__?.runtime.setVisualPreset("clean"));
  await page.waitForTimeout(200);
  diagnostics = await page.evaluate(() => window.__GAME_TEST__?.runtime.getVisualDiagnostics());
  expect(diagnostics?.preset).toBe("clean");
  expect(diagnostics?.internalResolution).toEqual({ width: 640, height: 360 });
  expect(diagnostics?.settings.jitterEnabled).toBe(false);

  expect(pageErrors).toEqual([]);
});

test("a live match still runs correctly through the PSX post-process pipeline (authentic preset)", async ({
  page
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));

  await page.evaluate(() => {
    window.__GAME_TEST__?.runtime.setVisualPreset("authentic");
    window.__GAME_TEST__?.gameFlow?.openMatchSetup();
    window.__GAME_TEST__?.gameFlow?.startMatch();
    window.__GAME_TEST__?.gameFlow?.advanceGameTicks(200);
  });

  await page.evaluate(() => window.__GAME_TEST__?.runtime.start());
  await page.waitForTimeout(800);
  await page.evaluate(() => window.__GAME_TEST__?.runtime.stop());

  const carState = await page.evaluate(() => window.__PHYSICS_TEST__?.getCarState("car-player"));
  expect(Number.isFinite(carState!.position.x)).toBe(true);
  expect(Number.isFinite(carState!.position.y)).toBe(true);
  expect(Number.isFinite(carState!.position.z)).toBe(true);
  expect(pageErrors).toEqual([]);

  await page.screenshot({ path: "test-results/psx-authentic-live-match.png" });
});

test("each preset renders without a WebGL/shader console error", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });

  for (const preset of ["authentic", "balanced", "clean"] as const) {
    await page.evaluate((p) => window.__GAME_TEST__?.runtime.setVisualPreset(p), preset);
    await page.waitForTimeout(300);
  }

  const shaderErrors = consoleErrors.filter(
    (message) => /shader|program|glsl|WebGL/i.test(message) && !/GPU stall/i.test(message)
  );
  expect(shaderErrors).toEqual([]);
});
