import { expect, test, type Page } from "@playwright/test";

/**
 * N6 (plan/ONLINE_MULTIPLAYER_PLAN.md): the online lobby UI. These drive
 * the menu flows and graceful failure without a control-plane server (the
 * WebSocket to the same-origin /api fails fast in dev, which must surface
 * as an error screen, not a hang or crash). The full two-page live match
 * is validated separately once a control plane (wrangler dev / deploy) is
 * available — see backend/README.md.
 */

async function ready(page: Page): Promise<void> {
  await page.goto("/");
  await expect
    .poll(() => page.evaluate(() => window.__GAME_TEST__?.gameFlow?.ready() ?? false), { timeout: 15_000 })
    .toBe(true);
  await expect(page.getByTestId("main-menu")).toBeVisible();
}

test("ONLINE opens the lobby with quick match / create / join options", async ({ page }) => {
  await ready(page);
  await page.getByTestId("open-online").click();

  await expect(page.getByTestId("online-lobby")).toBeVisible();
  await expect(page.getByTestId("online-quick-match")).toBeVisible();
  await expect(page.getByTestId("online-create-room")).toBeVisible();
  await expect(page.getByTestId("online-join-room")).toBeVisible();
  // Exactly one [data-menu-root] visible (R11 invariant): the main menu hid.
  await expect(page.getByTestId("main-menu")).toBeHidden();
});

test("BACK from the lobby returns to the main menu", async ({ page }) => {
  await ready(page);
  await page.getByTestId("open-online").click();
  await expect(page.getByTestId("online-lobby")).toBeVisible();
  await page.getByTestId("online-back").click();
  await expect(page.getByTestId("main-menu")).toBeVisible();
  await expect(page.getByTestId("online-lobby")).toBeHidden();
});

test("JOIN ROOM opens code entry; a too-short code is rejected with an error", async ({ page }) => {
  await ready(page);
  await page.getByTestId("open-online").click();
  await page.getByTestId("online-join-room").click();

  await expect(page.getByTestId("online-code-input")).toBeVisible();
  await page.getByTestId("online-code-input").fill("AB");
  await page.getByTestId("online-join-submit").click();

  await expect(page.getByTestId("online-error")).toBeVisible();
  await expect(page.getByTestId("online-error")).toContainText("5-character");
});

test("CREATE ROOM shows a status screen, then fails gracefully with no server", async ({ page }) => {
  await ready(page);
  await page.getByTestId("open-online").click();
  await page.getByTestId("online-create-room").click();

  // Reaches an error screen (server unreachable) rather than hanging or
  // crashing — the graceful-failure path.
  await expect(page.getByTestId("online-error")).toBeVisible({ timeout: 10_000 });
  // And BACK recovers cleanly to the main menu.
  await page.getByTestId("online-error-back").click();
  await expect(page.getByTestId("main-menu")).toBeVisible();
});

test("the ?room= deep link opens the lobby straight into a join attempt", async ({ page }) => {
  await page.goto("/?room=ABCDE");
  await expect
    .poll(() => page.evaluate(() => window.__GAME_TEST__?.gameFlow?.ready() ?? false), { timeout: 15_000 })
    .toBe(true);
  // Deep link goes straight past the main menu into the lobby (connecting
  // or, with no server, an error) — never the plain main menu.
  await expect(page.getByTestId("online-lobby")).toBeVisible({ timeout: 10_000 });
});

test("a lobby button shows a visible focus outline (F9 compliance)", async ({ page }) => {
  await ready(page);
  await page.getByTestId("open-online").click();
  const outline = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="online-quick-match"]') as HTMLElement | null;
    el?.focus();
    if (!el) return null;
    const style = getComputedStyle(el);
    return { style: style.outlineStyle, width: style.outlineWidth };
  });
  expect(outline).not.toBeNull();
  expect(outline!.style).not.toBe("none");
  expect(outline!.width).not.toBe("0px");
});
