import { expect, test, type Locator } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect
    .poll(() => page.evaluate(() => window.__GAME_TEST__?.gameFlow?.ready() ?? false), {
      timeout: 15_000
    })
    .toBe(true);
});

// `.fill()` does not reliably drive `<input type="range">` (Playwright's
// fill is documented for text-like inputs) — set the DOM value directly
// and dispatch a real "input" event, matching what the browser does when
// a user drags the slider.
async function setRangeSlider(locator: Locator, value: number): Promise<void> {
  await locator.evaluate((el, v) => {
    const input = el as HTMLInputElement;
    input.value = String(v);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
}

test("WS4.B: moving the FOV slider updates live camera diagnostics", async ({ page }) => {
  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.openSettings());
  await page.getByTestId("settings-tab-camera").click();

  await setRangeSlider(page.getByTestId("camera-fov"), 85);

  await expect
    .poll(() => page.evaluate(() => window.__GAME_TEST__?.runtime.getCameraDiagnostics()?.fov))
    .toBeCloseTo(85, 0);
});

test("WS4.B: increasing the distance multiplier grows the measured camera-to-car distance", async ({
  page
}) => {
  // Settings can only be opened from a menu state (MatchFlowController's
  // openSettings() no-ops mid-match), so drive the setting directly via
  // the runtime test hook rather than the settings-panel UI here.
  await page.evaluate(() => {
    window.__GAME_TEST__?.gameFlow?.openMatchSetup();
    window.__GAME_TEST__?.gameFlow?.startMatch();
    window.__GAME_TEST__?.gameFlow?.advanceGameTicks(460);
  });
  await page.waitForTimeout(300);

  function distanceToCarNow() {
    return page.evaluate(() => {
      const diag = window.__GAME_TEST__?.runtime.getCameraDiagnostics();
      const car = window.__PHYSICS_TEST__?.getCarState("car-player");
      if (!diag || !car) return null;
      const dx = diag.position.x - car.position.x;
      const dy = diag.position.y - car.position.y;
      const dz = diag.position.z - car.position.z;
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    });
  }

  const before = await distanceToCarNow();
  expect(before).not.toBeNull();

  await page.evaluate(() => {
    const current = window.__GAME_TEST__!.runtime.getCameraSettings();
    window.__GAME_TEST__!.runtime.setCameraSettings({ ...current, distance: 1.5 });
  });
  await page.waitForTimeout(300);

  const after = await distanceToCarNow();
  expect(after).not.toBeNull();
  expect(after!).toBeGreaterThan(before! * 1.2);
});

test("WS4.B: camera settings persist across a page reload", async ({ page }) => {
  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.openSettings());
  await page.getByTestId("settings-tab-camera").click();
  await setRangeSlider(page.getByTestId("camera-fov"), 70);

  const stored = await page.evaluate(() => localStorage.getItem("space-carball-settings-v1"));
  expect(stored).toBeTruthy();
  expect(JSON.parse(stored!).camera.fov).toBe(70);

  await page.reload();
  await expect
    .poll(() => page.evaluate(() => window.__GAME_TEST__?.gameFlow?.ready() ?? false), { timeout: 15_000 })
    .toBe(true);

  const diagnostics = await page.evaluate(() => window.__GAME_TEST__?.runtime.getCameraDiagnostics());
  expect(diagnostics?.fov).toBe(70);
});

test("WS4.C: FOV widens at supersonic speed and returns to baseline", async ({ page }) => {
  await page.evaluate(() => {
    window.__GAME_TEST__?.gameFlow?.openMatchSetup();
    window.__GAME_TEST__?.gameFlow?.startMatch();
    window.__GAME_TEST__?.gameFlow?.advanceGameTicks(460);
    // WS7.A: kickoff spawns with a rotation facing the ball from a
    // (round-robin) kickoff spot, not always identity — reset to facing
    // -Z so the injected -Z velocity below is the car's own forward
    // direction, not fought by lateral grip.
    window.__PHYSICS_TEST__?.setCarState("car-player", { rotation: { x: 0, y: 0, z: 0, w: 1 } });
  });

  const baseFov = (await page.evaluate(() => window.__GAME_TEST__?.runtime.getCameraDiagnostics()?.fov)) ?? 77;

  // A single velocity injection decays within ~1s (coast deceleration,
  // and the car can reach a wall at this speed) — not long enough for the
  // FOV's 6/s exponential smoothing to visibly converge. Keep
  // re-asserting supersonic speed for the whole window instead of
  // relying on one injection to coast for several seconds.
  let sustaining = true;
  const sustain = (async () => {
    while (sustaining) {
      await page.evaluate(() => {
        window.__PHYSICS_TEST__?.setCarState("car-player", { linearVelocity: { x: 0, y: 0, z: -25 } });
      });
      await page.waitForTimeout(50);
    }
  })();

  await expect
    .poll(
      () => page.evaluate(() => window.__PHYSICS_TEST__?.getCarState("car-player").supersonic),
      { timeout: 5_000 }
    )
    .toBe(true);

  await expect
    .poll(() => page.evaluate(() => window.__GAME_TEST__?.runtime.getCameraDiagnostics()?.fov), {
      timeout: 5_000
    })
    .toBeGreaterThanOrEqual(baseFov + 3);

  sustaining = false;
  await sustain;

  await page.evaluate(() => {
    window.__PHYSICS_TEST__?.setCarState("car-player", { linearVelocity: { x: 0, y: 0, z: 0 } });
  });

  await expect
    .poll(() => page.evaluate(() => window.__GAME_TEST__?.runtime.getCameraDiagnostics()?.fov), {
      timeout: 5_000
    })
    .toBeLessThan(baseFov + 0.5);
});

/** Samples camera position over consecutive rendered frames via rAF. */
async function collectCameraPositionSamples(
  page: import("@playwright/test").Page,
  frameCount: number
): Promise<Array<{ x: number; y: number; z: number }>> {
  return page.evaluate(async (count) => {
    const samples: Array<{ x: number; y: number; z: number }> = [];
    await new Promise<void>((resolve) => {
      let taken = 0;
      function tick() {
        const diag = window.__GAME_TEST__?.runtime.getCameraDiagnostics();
        if (diag) samples.push(diag.position);
        taken++;
        if (taken < count) {
          requestAnimationFrame(tick);
        } else {
          resolve();
        }
      }
      requestAnimationFrame(tick);
    });
    return samples;
  }, frameCount);
}

/** Mean deviation of each sample from a trailing 5-frame moving average —
 * a proxy for high-frequency jitter (camera shake) vs. smooth motion. */
function meanHighFrequencyDeviation(samples: Array<{ x: number; y: number; z: number }>): number {
  const windowSize = 5;
  let total = 0;
  let count = 0;
  for (let i = windowSize; i < samples.length; i++) {
    let sx = 0;
    let sy = 0;
    let sz = 0;
    for (let j = i - windowSize; j < i; j++) {
      const sample = samples[j]!;
      sx += sample.x;
      sy += sample.y;
      sz += sample.z;
    }
    const ax = sx / windowSize;
    const ay = sy / windowSize;
    const az = sz / windowSize;
    const current = samples[i]!;
    const dx = current.x - ax;
    const dy = current.y - ay;
    const dz = current.z - az;
    total += Math.sqrt(dx * dx + dy * dy + dz * dz);
    count++;
  }
  return count > 0 ? total / count : 0;
}

test("WS4.D: a nearby hard ball impact shakes the camera, gated by the shake-enabled setting", async ({
  page
}) => {
  await page.evaluate(() => {
    window.__PHYSICS_TEST__?.setCarState("car-opponent", { position: { x: 40, y: 1, z: 40 } });
    window.__GAME_TEST__?.gameFlow?.openMatchSetup();
    window.__GAME_TEST__?.gameFlow?.startMatch();
    window.__GAME_TEST__?.gameFlow?.advanceGameTicks(60);
  });

  // The ball is placed near the car but far enough away (within
  // shakeRadius but outside collision range) that it never physically
  // touches the car — otherwise the resulting real camera pan (chasing a
  // car that just got knocked around) would itself register as
  // "high-frequency deviation" and confound the shake-only measurement.
  // The velocity alternates sign each pulse so every pulse produces a
  // fresh large delta (a single one-shot velocity decays/settles too fast
  // for the shake energy to stay above threshold across a whole sampling
  // window), sustaining shake energy for the duration of the sample.
  async function pulseImpactNearCar(sign: 1 | -1): Promise<void> {
    await page.evaluate((s) => {
      const car = window.__PHYSICS_TEST__?.getCarState("car-player");
      if (!car) return;
      window.__PHYSICS_TEST__?.setBallState({
        position: { x: car.position.x, y: car.position.y + 2, z: car.position.z + 10 },
        linearVelocity: { x: 0, y: 0, z: s * 25 }
      });
    }, sign);
  }

  function sustainImpacts(): { stop: () => Promise<void> } {
    let sustaining = true;
    let sign: 1 | -1 = 1;
    const loop = (async () => {
      while (sustaining) {
        await pulseImpactNearCar(sign);
        sign = sign === 1 ? -1 : 1;
        await page.waitForTimeout(40);
      }
    })();
    return {
      stop: async () => {
        sustaining = false;
        await loop;
      }
    };
  }

  // Ensure shake starts enabled (the settings-store default).
  await page.evaluate(() => {
    const current = window.__GAME_TEST__!.runtime.getCameraSettings();
    window.__GAME_TEST__!.runtime.setCameraSettings({ ...current, shakeEnabled: true });
  });

  const enabledSustain = sustainImpacts();
  const enabledSamples = await collectCameraPositionSamples(page, 25);
  await enabledSustain.stop();
  const enabledDeviation = meanHighFrequencyDeviation(enabledSamples);
  expect(enabledDeviation).toBeGreaterThan(0.01);

  // Let shake energy fully decay before the disabled-state measurement.
  await page.waitForTimeout(1000);

  await page.evaluate(() => {
    const current = window.__GAME_TEST__!.runtime.getCameraSettings();
    window.__GAME_TEST__!.runtime.setCameraSettings({ ...current, shakeEnabled: false });
  });

  const disabledSustain = sustainImpacts();
  const disabledSamples = await collectCameraPositionSamples(page, 25);
  await disabledSustain.stop();
  const disabledDeviation = meanHighFrequencyDeviation(disabledSamples);
  expect(disabledDeviation).toBeLessThan(0.005);
});
