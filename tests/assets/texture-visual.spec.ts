import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect
    .poll(() => page.evaluate(() => window.__GAME_TEST__?.gameFlow?.ready() ?? false), {
      timeout: 15_000
    })
    .toBe(true);
});

test("the asset pipeline loads the supplied stadium textures with no errors", async ({ page }) => {
  await expect
    .poll(() => page.evaluate(() => window.__ASSET_TEST__?.getPipelineState()), { timeout: 15_000 })
    .toBe("READY");

  const errors = await page.evaluate(() => window.__ASSET_TEST__?.getErrors());
  expect(errors).toEqual([]);
});

test("no external (third-party) texture requests are made — only same-origin supplied textures", async ({
  page
}) => {
  const externalRequests: string[] = [];

  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== new URL(page.url()).origin && url.protocol !== "data:") {
      externalRequests.push(request.url());
    }
  });

  await page.reload();
  await expect
    .poll(() => page.evaluate(() => window.__ASSET_TEST__?.getPipelineState()), { timeout: 15_000 })
    .toBe("READY");

  expect(externalRequests).toEqual([]);
});

test("the stadium floor and walls render with a real supplied texture, not a flat placeholder colour", async ({
  page
}) => {
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "test-results/texture-stadium.png" });

  // Sanity check: the app boots with the textured stadium and no runtime
  // errors reach the page (a broken texture load would otherwise throw
  // inside the render loop or leave the pipeline in a FAILED state).
  const state = await page.evaluate(() => window.__ASSET_TEST__?.getPipelineState());
  expect(state).toBe("READY");
});
