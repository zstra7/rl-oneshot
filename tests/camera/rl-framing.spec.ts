import * as THREE from "three";
import { expect, test } from "@playwright/test";

interface CameraDiagnosticsForNdc {
  readonly position: { x: number; y: number; z: number };
  readonly fov: number;
  readonly aspect: number;
  readonly quaternion: { x: number; y: number; z: number; w: number };
}

function toNdc(diag: CameraDiagnosticsForNdc, point: { x: number; y: number; z: number }): THREE.Vector3 {
  const cam = new THREE.PerspectiveCamera(diag.fov, diag.aspect, 0.1, 500);
  cam.position.set(diag.position.x, diag.position.y, diag.position.z);
  cam.quaternion.set(diag.quaternion.x, diag.quaternion.y, diag.quaternion.z, diag.quaternion.w);
  cam.updateMatrixWorld();
  return new THREE.Vector3(point.x, point.y, point.z).project(cam);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect
    .poll(() => page.evaluate(() => window.__GAME_TEST__?.gameFlow?.ready() ?? false), {
      timeout: 15_000
    })
    .toBe(true);
  await page.evaluate(() => {
    window.__GAME_TEST__?.gameFlow?.openMatchSetup();
    window.__GAME_TEST__?.gameFlow?.startMatch();
    window.__GAME_TEST__?.gameFlow?.advanceGameTicks(460);
  });
  // Park the opponent away from the play area — these tests are about
  // camera framing of the player car/ball, not AI interference (see
  // docs/physics-deviations.md WS2 section for why this matters post the
  // grip/steering tuning pass).
  await page.evaluate(() =>
    window.__PHYSICS_TEST__?.setCarState("car-opponent", { position: { x: 40, y: 1, z: 40 } })
  );
});

test("WS4: the car sits bottom-centre of the frame in normal cam while driving", async ({ page }) => {
  await page.keyboard.down("KeyW");

  let framedCount = 0;
  const samples = 10;
  for (let i = 0; i < samples; i += 1) {
    await page.waitForTimeout(200);
    const diagnostics = await page.evaluate(() => window.__GAME_TEST__?.runtime.getCameraDiagnostics());
    const carState = await page.evaluate(() => window.__PHYSICS_TEST__?.getCarState("car-player"));
    if (!diagnostics || !carState) continue;

    const ndc = toNdc(diagnostics, carState.position);
    if (Math.abs(ndc.x) < 0.35 && ndc.y > -0.95 && ndc.y < -0.05) {
      framedCount += 1;
    }
  }

  await page.keyboard.up("KeyW");
  expect(framedCount).toBeGreaterThanOrEqual(8);
});

test("WS4: ball cam keeps both the ball and the car in frame", async ({ page }) => {
  await page.keyboard.press("Space"); // toggle ball cam
  await page.waitForTimeout(100);

  await page.evaluate(() => {
    window.__PHYSICS_TEST__?.setBallState({ position: { x: 0, y: 1, z: -15 } });
  });
  await page.waitForTimeout(300);

  const diagnostics = await page.evaluate(() => window.__GAME_TEST__?.runtime.getCameraDiagnostics());
  const carState = await page.evaluate(() => window.__PHYSICS_TEST__?.getCarState("car-player"));
  const ballState = await page.evaluate(() => window.__PHYSICS_TEST__?.getBallState());
  expect(diagnostics).toBeTruthy();
  expect(carState).toBeTruthy();
  expect(ballState).toBeTruthy();

  const ballNdc = toNdc(diagnostics!, ballState!.position);
  expect(Math.abs(ballNdc.x)).toBeLessThan(0.3);
  expect(ballNdc.y).toBeGreaterThan(-0.5);
  expect(ballNdc.y).toBeLessThan(0.7);

  const carNdc = toNdc(diagnostics!, carState!.position);
  expect(carNdc.y).toBeLessThan(0);
  expect(Math.abs(carNdc.x)).toBeLessThan(0.5);
});

test("WS4: the chase rig stays close to the car (RL-scale distance, not the old far framing)", async ({
  page
}) => {
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(1000);

  const diagnostics = await page.evaluate(() => window.__GAME_TEST__?.runtime.getCameraDiagnostics());
  const carState = await page.evaluate(() => window.__PHYSICS_TEST__?.getCarState("car-player"));
  await page.keyboard.up("KeyW");

  expect(diagnostics).toBeTruthy();
  expect(carState).toBeTruthy();

  const dx = diagnostics!.position.x - carState!.position.x;
  const dy = diagnostics!.position.y - carState!.position.y;
  const dz = diagnostics!.position.z - carState!.position.z;
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

  expect(distance).toBeGreaterThan(2.0);
  expect(distance).toBeLessThan(4.5);
});

test("WS4: the camera doesn't crush toward the car near a wall (no collision pull-in)", async ({ page }) => {
  await page.evaluate(() => {
    window.__PHYSICS_TEST__?.setCarState("car-player", { position: { x: -18, y: 1, z: 0 } });
  });
  await page.waitForTimeout(500);

  const diagnostics = await page.evaluate(() => window.__GAME_TEST__?.runtime.getCameraDiagnostics());
  const carState = await page.evaluate(() => window.__PHYSICS_TEST__?.getCarState("car-player"));
  expect(diagnostics).toBeTruthy();
  expect(carState).toBeTruthy();

  const dx = diagnostics!.position.x - carState!.position.x;
  const dy = diagnostics!.position.y - carState!.position.y;
  const dz = diagnostics!.position.z - carState!.position.z;
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

  expect(distance).toBeGreaterThan(1.5);
});
