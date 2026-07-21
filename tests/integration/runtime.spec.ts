import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  // Track concurrently-pending requestAnimationFrame callbacks so we can
  // assert there is never more than one in flight (core architecture spec:
  // "There must be one requestAnimationFrame loop").
  await page.addInitScript(() => {
    const pending = new Set<number>();
    const originalRaf = window.requestAnimationFrame.bind(window);
    const originalCaf = window.cancelAnimationFrame.bind(window);

    (window as unknown as { __rafPendingCount(): number }).__rafPendingCount =
      () => pending.size;

    window.requestAnimationFrame = (callback: FrameRequestCallback) => {
      const id = originalRaf((time) => {
        pending.delete(id);
        callback(time);
      });
      pending.add(id);
      return id;
    };

    window.cancelAnimationFrame = (id: number) => {
      pending.delete(id);
      originalCaf(id);
    };
  });
});

test("__GAME_TEST__ becomes ready and reports MENU app state", async ({ page }) => {
  await page.goto("/");

  await expect
    .poll(() => page.evaluate(() => window.__GAME_TEST__?.ready() ?? false))
    .toBe(true);

  const appState = await page.evaluate(() =>
    window.__GAME_TEST__?.runtime.getAppState()
  );

  expect(appState).toBe("MENU");
});

test("exactly one requestAnimationFrame is ever pending at a time", async ({
  page
}) => {
  await page.goto("/");

  await expect
    .poll(() => page.evaluate(() => window.__GAME_TEST__?.ready() ?? false))
    .toBe(true);

  for (let i = 0; i < 5; i += 1) {
    const pendingCount = await page.evaluate(
      () =>
        (window as unknown as { __rafPendingCount(): number }).__rafPendingCount()
    );
    expect(pendingCount).toBeLessThanOrEqual(1);
    await page.waitForTimeout(50);
  }
});

test("the fixed tick advances while running and halts after stop()", async ({
  page
}) => {
  await page.goto("/");

  await expect
    .poll(() => page.evaluate(() => window.__GAME_TEST__?.ready() ?? false))
    .toBe(true);

  await page.waitForTimeout(150);

  const tickWhileRunning = await page.evaluate(
    () => window.__GAME_TEST__?.runtime.getDiagnostics().fixedTick ?? -1
  );
  expect(tickWhileRunning).toBeGreaterThan(0);

  await page.evaluate(() => window.__GAME_TEST__?.runtime.stop());

  const tickAfterStop = await page.evaluate(
    () => window.__GAME_TEST__?.runtime.getDiagnostics().fixedTick ?? -1
  );

  await page.waitForTimeout(150);

  const tickAfterWaiting = await page.evaluate(
    () => window.__GAME_TEST__?.runtime.getDiagnostics().fixedTick ?? -1
  );

  expect(tickAfterWaiting).toBe(tickAfterStop);

  const isRunning = await page.evaluate(() =>
    window.__GAME_TEST__?.runtime.isRunning()
  );
  expect(isRunning).toBe(false);

  await page.evaluate(() => window.__GAME_TEST__?.runtime.start());
});

test("manual stepFixedTicks() advances deterministically while stopped, bypassing RAF", async ({
  page
}) => {
  await page.goto("/");

  await expect
    .poll(() => page.evaluate(() => window.__GAME_TEST__?.ready() ?? false))
    .toBe(true);

  await page.evaluate(() => window.__GAME_TEST__?.runtime.stop());

  const before = await page.evaluate(
    () => window.__GAME_TEST__?.runtime.getDiagnostics().fixedTick ?? -1
  );

  await page.evaluate(() => window.__GAME_TEST__?.runtime.stepFixedTicks(10_000));

  const after = await page.evaluate(
    () => window.__GAME_TEST__?.runtime.getDiagnostics().fixedTick ?? -1
  );

  expect(after - before).toBe(10_000);

  // The page must remain responsive after 10,000 synchronous manual ticks.
  const stillResponsive = await page.evaluate(() => 1 + 1);
  expect(stillResponsive).toBe(2);
});
