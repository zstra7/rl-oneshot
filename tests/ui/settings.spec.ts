import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect
    .poll(() => page.evaluate(() => window.__GAME_TEST__?.gameFlow?.ready() ?? false), {
      timeout: 15_000
    })
    .toBe(true);
});

test("settings panel shows all six category tabs and defaults to GAMEPLAY", async ({ page }) => {
  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.openSettings());
  await expect(page.getByTestId("settings-panel")).toBeVisible();

  for (const category of ["gameplay", "camera", "graphics", "audio", "controls", "accessibility"]) {
    await expect(page.getByTestId(`settings-tab-${category}`)).toBeVisible();
  }
  await expect(page.getByTestId("settings-tab-gameplay")).toHaveClass(/active/);
});

test("selecting a graphics preset takes effect on the live renderer immediately", async ({ page }) => {
  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.openSettings());
  await page.getByTestId("settings-tab-graphics").click();

  await page.getByTestId("graphics-preset-authentic").click();
  let diagnostics = await page.evaluate(() => window.__GAME_TEST__?.runtime.getVisualDiagnostics());
  expect(diagnostics?.preset).toBe("authentic");
  expect(diagnostics?.internalResolution).toEqual({ width: 480, height: 270 });

  await page.getByTestId("graphics-preset-clean").click();
  diagnostics = await page.evaluate(() => window.__GAME_TEST__?.runtime.getVisualDiagnostics());
  expect(diagnostics?.preset).toBe("clean");
});

test("accessibility reduced-jitter and disable-dithering toggles apply live", async ({ page }) => {
  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.openSettings());
  await page.getByTestId("settings-tab-accessibility").click();

  await page.getByTestId("toggle-reduced-jitter").click();
  let diagnostics = await page.evaluate(() => window.__GAME_TEST__?.runtime.getVisualDiagnostics());
  expect(diagnostics?.settings.jitterEnabled).toBe(false);

  await page.getByTestId("toggle-disable-dithering").click();
  diagnostics = await page.evaluate(() => window.__GAME_TEST__?.runtime.getVisualDiagnostics());
  expect(diagnostics?.settings.ditherEnabled).toBe(false);
});

test("settings persist across a page reload (localStorage space-carball-settings-v1)", async ({ page }) => {
  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.openSettings());
  await page.getByTestId("settings-tab-graphics").click();
  await page.getByTestId("graphics-preset-authentic").click();

  const storedRaw = await page.evaluate(() => localStorage.getItem("space-carball-settings-v1"));
  expect(storedRaw).toBeTruthy();
  const stored = JSON.parse(storedRaw!);
  expect(stored.graphics.preset).toBe("authentic");

  await page.reload();
  await expect
    .poll(() => page.evaluate(() => window.__GAME_TEST__?.gameFlow?.ready() ?? false), { timeout: 15_000 })
    .toBe(true);

  const diagnostics = await page.evaluate(() => window.__GAME_TEST__?.runtime.getVisualDiagnostics());
  expect(diagnostics?.preset).toBe("authentic");
});

test("a corrupted settings value in localStorage falls back to defaults without crashing", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));

  await page.evaluate(() => localStorage.setItem("space-carball-settings-v1", "{not valid json"));
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => window.__GAME_TEST__?.gameFlow?.ready() ?? false), { timeout: 15_000 })
    .toBe(true);

  const diagnostics = await page.evaluate(() => window.__GAME_TEST__?.runtime.getVisualDiagnostics());
  expect(diagnostics?.preset).toBe("clean");
  expect(pageErrors).toEqual([]);
});

test("changing the default match length in settings takes effect in match setup", async ({ page }) => {
  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.openSettings());
  await page.getByTestId("settings-tab-gameplay").click();
  await page.getByText("10 MIN").click();

  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.openMainMenu());
  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.openMatchSetup());

  const session = await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.getSessionState());
  expect(session?.selectedDurationMinutes).toBe(10);
});
