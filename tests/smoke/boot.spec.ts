import { expect, test } from "@playwright/test";

test("app boots and mounts the game canvas", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("#app-root")).toBeVisible();
  await expect(page.locator("canvas.game-canvas")).toBeVisible();

  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.dataset["threeRevision"]
      )
    )
    .toBe("160");
});

test("app reaches MENU app state after boot", async ({ page }) => {
  await page.goto("/");

  await expect
    .poll(() =>
      page.evaluate(
        () => document.querySelector("#app-root")?.getAttribute("data-app-state")
      )
    )
    .toBe("MENU");
});

test("WS9.A: the self-hosted Chakra Petch and Russo One fonts load", async ({ page }) => {
  await page.goto("/");

  const fontsLoaded = await page.evaluate(async () => {
    // `document.fonts.ready` only resolves once every font a layout has
    // actually requested has settled — `font-display: swap` fonts that
    // haven't been triggered by matching rendered text yet don't count.
    // Force both explicitly rather than relying on menu content having
    // already triggered them by the time this runs.
    await Promise.all([document.fonts.load('16px "Chakra Petch"'), document.fonts.load('16px "Russo One"')]);
    await document.fonts.ready;
    return document.fonts.check('16px "Chakra Petch"') && document.fonts.check('16px "Russo One"');
  });
  expect(fontsLoaded).toBe(true);
});

test("WS9.B: the scanline/vignette overlays never intercept pointer events", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#app-root")).toBeVisible();

  const pointerEvents = await page.evaluate(() => ({
    scanlines: getComputedStyle(document.querySelector(".wo-scanlines")!).pointerEvents,
    vignette: getComputedStyle(document.querySelector(".wo-vignette")!).pointerEvents
  }));
  expect(pointerEvents.scanlines).toBe("none");
  expect(pointerEvents.vignette).toBe("none");
});
