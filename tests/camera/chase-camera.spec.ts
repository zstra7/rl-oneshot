import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect
    .poll(() => page.evaluate(() => window.__GAME_TEST__?.gameFlow?.ready() ?? false), {
      timeout: 15_000
    })
    .toBe(true);
});

test("the menu camera orbits somewhere sane above the field", async ({ page }) => {
  const diagnostics = await page.evaluate(() => window.__GAME_TEST__?.runtime.getCameraDiagnostics());
  expect(diagnostics).not.toBeNull();
  expect(diagnostics?.fov).toBe(72);
  expect(Number.isFinite(diagnostics?.position.x)).toBe(true);
  expect(diagnostics?.position.y).toBeGreaterThan(0);
});

test("the chase camera follows the player car and stays inside the arena while driving", async ({
  page
}) => {
  await page.evaluate(() => window.__PHYSICS_TEST__?.pauseRuntime());
  await page.evaluate(() => {
    window.__GAME_TEST__?.gameFlow?.openMatchSetup();
    window.__GAME_TEST__?.gameFlow?.startMatch();
    window.__GAME_TEST__?.gameFlow?.advanceGameTicks(460);
  });
  await page.evaluate(() => window.__PHYSICS_TEST__?.resumeRuntime());

  await page.keyboard.down("KeyW");
  await page.waitForTimeout(1500);
  await page.keyboard.up("KeyW");

  const carState = await page.evaluate(() => window.__PHYSICS_TEST__?.getCarState("car-player"));
  const cameraDiagnostics = await page.evaluate(() =>
    window.__GAME_TEST__?.runtime.getCameraDiagnostics()
  );

  expect(carState).toBeTruthy();
  expect(cameraDiagnostics).toBeTruthy();

  // "Camera does not leave valid space" (Phase 8 exit criterion): well
  // inside the box-arena bounds (halfWidth 20, halfLength 30 + goal
  // depth, height 20), never NaN/Infinity.
  const pos = cameraDiagnostics!.position;
  expect(Number.isFinite(pos.x) && Number.isFinite(pos.y) && Number.isFinite(pos.z)).toBe(true);
  expect(Math.abs(pos.x)).toBeLessThan(40);
  expect(pos.y).toBeGreaterThan(0);
  expect(pos.y).toBeLessThan(20);
  expect(Math.abs(pos.z)).toBeLessThan(45);

  // The camera should be chasing the car, not stuck at the origin/menu
  // orbit position -- close enough to the car for a normal chase-cam
  // distance (base 7.5m + framing boost up to +6m, plus some smoothing
  // lag tolerance).
  const dx = pos.x - carState!.position.x;
  const dy = pos.y - carState!.position.y;
  const dz = pos.z - carState!.position.z;
  const distanceToCar = Math.sqrt(dx * dx + dy * dy + dz * dz);
  expect(distanceToCar).toBeLessThan(20);
});

test("ball-camera toggle (Space) flips the camera's ball-camera state", async ({ page }) => {
  await page.evaluate(() => {
    window.__GAME_TEST__?.gameFlow?.openMatchSetup();
    window.__GAME_TEST__?.gameFlow?.startMatch();
    window.__GAME_TEST__?.gameFlow?.advanceGameTicks(460);
  });

  const before = await page.evaluate(() => window.__GAME_TEST__?.runtime.getCameraDiagnostics());
  expect(before?.ballCameraEnabled).toBe(false);

  await page.keyboard.press("Space");
  await page.waitForTimeout(200);

  const after = await page.evaluate(() => window.__GAME_TEST__?.runtime.getCameraDiagnostics());
  expect(after?.ballCameraEnabled).toBe(true);
});
