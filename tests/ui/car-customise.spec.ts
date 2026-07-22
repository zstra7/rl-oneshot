import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect
    .poll(() => page.evaluate(() => window.__GAME_TEST__?.gameFlow?.ready() ?? false), {
      timeout: 15_000
    })
    .toBe(true);
});

test("main menu shows CUSTOMISE CAR, and clicking it reaches CAR_CUSTOMISE with the panel visible and the orbit camera near the car", async ({
  page
}) => {
  await expect(page.getByTestId("customise-car")).toBeVisible();
  await page.getByTestId("customise-car").click();

  await expect
    .poll(() => page.evaluate(() => window.__GAME_TEST__?.gameFlow?.getMatchState()))
    .toBe("CAR_CUSTOMISE");
  await expect(page.getByTestId("car-customise")).toBeVisible();

  // R12.3: dedicated orbit camera — radius 4.6 around the live player car
  // position (menu spawn (0, 0.35, -24)), so camera distance to the car
  // should stay well within 6m the whole time (poll across a couple of
  // orbit steps rather than a single frame).
  const distances: number[] = [];
  for (let i = 0; i < 5; i += 1) {
    const distance = await page.evaluate(() => {
      const diagnostics = window.__GAME_TEST__?.runtime.getCameraDiagnostics();
      if (!diagnostics) {
        return null;
      }
      const dx = diagnostics.position.x - 0;
      const dy = diagnostics.position.y - 0.35;
      const dz = diagnostics.position.z - -24;
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    });
    if (distance !== null) {
      distances.push(distance);
    }
    await page.waitForTimeout(150);
  }
  expect(distances.length).toBeGreaterThan(0);
  for (const distance of distances) {
    expect(distance).toBeLessThan(6);
  }
});

test("setting body colour via the colour input updates runtime state and the live scene material", async ({
  page
}) => {
  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.openCarCustomise());
  await expect(page.getByTestId("car-customise")).toBeVisible();

  const input = page.getByTestId("body-color-input");
  await input.fill("#ff8800");
  await input.dispatchEvent("input");

  await expect
    .poll(() => page.evaluate(() => window.__GAME_TEST__?.runtime.getPlayerCarColors().bodyColor))
    .toBe("#ff8800");

  await expect
    .poll(() => page.evaluate(() => window.__GAME_TEST__?.runtime.getPlayerCarPrimaryColorHex()))
    .toBe("#ff8800");
});

test("boost preview spawns particles while the screen is open and decays after leaving", async ({ page }) => {
  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.openCarCustomise());
  await expect(page.getByTestId("car-customise")).toBeVisible();

  await expect
    .poll(
      async () => page.evaluate(() => window.__GAME_TEST__?.runtime.getVfxActiveParticleCount() ?? 0),
      { timeout: 5_000 }
    )
    .toBeGreaterThan(0);

  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.openMainMenu());
  await expect
    .poll(
      async () => page.evaluate(() => window.__GAME_TEST__?.runtime.getVfxActiveParticleCount() ?? 0),
      { timeout: 2_000 }
    )
    .toBe(0);
});

test("body colour persists across a page reload", async ({ page }) => {
  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.openCarCustomise());
  await expect(page.getByTestId("car-customise")).toBeVisible();

  const input = page.getByTestId("body-color-input");
  await input.fill("#ff8800");
  await input.dispatchEvent("input");

  await expect
    .poll(() => page.evaluate(() => window.__GAME_TEST__?.runtime.getPlayerCarColors().bodyColor))
    .toBe("#ff8800");

  await page.reload();
  await expect
    .poll(() => page.evaluate(() => window.__GAME_TEST__?.gameFlow?.ready() ?? false), { timeout: 15_000 })
    .toBe(true);

  // A reload boots back at MAIN_MENU (session state, not persisted) — the
  // persisted setting itself (localStorage) is what's under test here, so
  // it should already be applied before the panel is even reopened.
  await expect
    .poll(() => page.evaluate(() => window.__GAME_TEST__?.runtime.getPlayerCarColors().bodyColor))
    .toBe("#ff8800");

  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.openCarCustomise());
  await expect(page.getByTestId("body-color-input")).toHaveValue("#ff8800");
});

test("BACK returns to MAIN_MENU", async ({ page }) => {
  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.openCarCustomise());
  await expect(page.getByTestId("car-customise")).toBeVisible();

  await page.locator("[data-menu-back]").click();

  await expect
    .poll(() => page.evaluate(() => window.__GAME_TEST__?.gameFlow?.getMatchState()))
    .toBe("MAIN_MENU");
  await expect(page.getByTestId("main-menu")).toBeVisible();
});

test("gameplay smoke: a custom boost colour does not break real boosting (LMB) or throw console errors", async ({
  page
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));

  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.openCarCustomise());
  await expect(page.getByTestId("car-customise")).toBeVisible();

  const input = page.getByTestId("boost-color-input");
  await input.fill("#00ff88");
  await input.dispatchEvent("input");
  await expect
    .poll(() => page.evaluate(() => window.__GAME_TEST__?.runtime.getPlayerCarColors().boostColor))
    .toBe("#00ff88");

  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.openMainMenu());
  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.openMatchSetup());
  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.startMatch());
  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.advanceGameSeconds(4));

  await page.evaluate(() => {
    window.__PHYSICS_TEST__?.setCarInput("car-player", { boost: true, throttle: 1 });
  });
  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.advanceGameSeconds(1));

  const matchState = await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.getMatchState());
  expect(["PLAYING", "ZERO_SECOND_PLAY"]).toContain(matchState);
  expect(pageErrors).toEqual([]);
});
