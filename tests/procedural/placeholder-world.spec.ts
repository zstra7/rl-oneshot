import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect
    .poll(() => page.evaluate(() => window.__ASSET_TEST__?.ready() ?? false))
    .toBe(true);
});

test("the asset pipeline reaches READY with no errors and a populated scene", async ({
  page
}) => {
  const state = await page.evaluate(() =>
    window.__ASSET_TEST__?.getPipelineState()
  );
  expect(state).toBe("READY");

  const errors = await page.evaluate(() => window.__ASSET_TEST__?.getErrors());
  expect(errors).toEqual([]);

  const counts = await page.evaluate(() =>
    window.__ASSET_TEST__?.getSceneResourceCounts()
  );
  expect(counts?.geometries).toBeGreaterThan(0);
  expect(counts?.materials).toBeGreaterThan(0);
});

test("no external asset requests are made (procedural-only Phase 2 world)", async ({
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
    .poll(() => page.evaluate(() => window.__ASSET_TEST__?.ready() ?? false))
    .toBe(true);

  expect(externalRequests).toEqual([]);
});

test("rebuildProceduralPreview() with the same seed is deterministic and disposePreview() cleans up", async ({
  page
}) => {
  const first = await page.evaluate(() =>
    window.__ASSET_TEST__?.rebuildProceduralPreview(4242)
  );
  const second = await page.evaluate(() =>
    window.__ASSET_TEST__?.rebuildProceduralPreview(4242)
  );

  expect(first).toEqual(second);

  await page.evaluate(() => window.__ASSET_TEST__?.disposePreview());

  // Disposal must not throw and must leave the pipeline in a usable state.
  const stateAfterDispose = await page.evaluate(() =>
    window.__ASSET_TEST__?.getPipelineState()
  );
  expect(stateAfterDispose).toBe("READY");
});
