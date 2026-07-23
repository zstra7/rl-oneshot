import { expect, test, type Page } from "@playwright/test";

/**
 * N8 (plan/ONLINE_MULTIPLAYER_PLAN.md): offline-first opt-in guarantee.
 * Single-player must make ZERO multiplayer network connections — no
 * control-plane WebSocket, no signaling — until the player explicitly
 * enters the ONLINE menu and starts a flow. This keeps the release-gate's
 * "no external requests" spirit intact for the default (single-player)
 * experience and ensures nobody is silently connected to a server they
 * never opted into.
 */

async function installWebSocketSpy(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const opened: string[] = [];
    (window as unknown as { __WS_URLS__: string[] }).__WS_URLS__ = opened;
    const NativeWebSocket = window.WebSocket;
    class SpyWebSocket extends NativeWebSocket {
      public constructor(url: string | URL, protocols?: string | string[]) {
        opened.push(url.toString());
        super(url, protocols);
      }
    }
    window.WebSocket = SpyWebSocket as unknown as typeof WebSocket;
  });
}

function mpSockets(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const urls = (window as unknown as { __WS_URLS__?: string[] }).__WS_URLS__ ?? [];
    return urls.filter((u) => u.includes("/api") || u.includes("/room") || u.includes("/matchmaking"));
  });
}

test("a full single-player session opens NO multiplayer socket", async ({ page }) => {
  await installWebSocketSpy(page);
  await page.goto("/");
  await expect
    .poll(() => page.evaluate(() => window.__GAME_TEST__?.gameFlow?.ready() ?? false), { timeout: 15_000 })
    .toBe(true);

  // Play a single-player match end to end.
  await page.evaluate(() => {
    window.__GAME_TEST__?.gameFlow?.openMatchSetup();
    window.__GAME_TEST__?.gameFlow?.startMatch();
    window.__GAME_TEST__?.gameFlow?.advanceGameTicks(600);
  });
  await expect.poll(() => page.evaluate(() => window.__GAME_TEST__?.gameFlow?.getMatchState())).toBe("PLAYING");
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(400);
  await page.keyboard.up("KeyW");

  expect(await mpSockets(page)).toEqual([]);
});

test("multiplayer networking is opt-in: it only connects after the player starts an online flow", async ({ page }) => {
  await installWebSocketSpy(page);
  await page.goto("/");
  await expect
    .poll(() => page.evaluate(() => window.__GAME_TEST__?.gameFlow?.ready() ?? false), { timeout: 15_000 })
    .toBe(true);

  // Opening the ONLINE menu alone still connects nothing.
  await page.getByTestId("open-online").click();
  await expect(page.getByTestId("online-lobby")).toBeVisible();
  expect(await mpSockets(page)).toEqual([]);

  // Only an explicit QUICK MATCH opens a control-plane socket.
  await page.getByTestId("online-quick-match").click();
  await expect.poll(() => mpSockets(page).then((s) => s.length)).toBeGreaterThan(0);
});
