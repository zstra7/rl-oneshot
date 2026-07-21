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
