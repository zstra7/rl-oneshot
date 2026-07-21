import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect
    .poll(() => page.evaluate(() => window.__AUDIO_TEST__?.ready() ?? false), {
      timeout: 15_000
    })
    .toBe(true);
});

test("audio module reports supported diagnostics on boot", async ({ page }) => {
  // Whether the AudioContext boots "suspended" (awaiting a user gesture,
  // per spec section 5) or "running" is a browser autoplay-policy choice
  // this project's audio module does not control — automated/headless
  // Chromium relaxes the gesture requirement, so this only asserts the
  // two fields stay consistent with each other, not a specific state.
  const diagnostics = await page.evaluate(() => window.__AUDIO_TEST__?.getDiagnostics());
  expect(diagnostics?.supported).toBe(true);
  expect(diagnostics?.awaitingUserGesture).toBe(diagnostics?.contextState === "suspended");
});

test("resumeFromUserGesture transitions the AudioContext to running", async ({ page }) => {
  await page.evaluate(() => window.__AUDIO_TEST__?.resume());
  await expect
    .poll(() => page.evaluate(() => window.__AUDIO_TEST__?.getDiagnostics().contextState))
    .toBe("running");

  const diagnostics = await page.evaluate(() => window.__AUDIO_TEST__?.getDiagnostics());
  expect(diagnostics?.awaitingUserGesture).toBe(false);
});

test("clicking PLAY resumes the AudioContext via the first-gesture listener", async ({ page }) => {
  await page.getByTestId("main-menu").getByText("PLAY").click();

  await expect
    .poll(() => page.evaluate(() => window.__AUDIO_TEST__?.getDiagnostics().contextState))
    .toBe("running");
});

test("emitting a one-shot ui event increments scheduledOneShots", async ({ page }) => {
  await page.evaluate(() => window.__AUDIO_TEST__?.resume());

  const before = await page.evaluate(() => window.__AUDIO_TEST__?.getDiagnostics().scheduledOneShots ?? 0);
  await page.evaluate(() => window.__AUDIO_TEST__?.emit({ type: "audio:ui-confirm" }));
  const after = await page.evaluate(() => window.__AUDIO_TEST__?.getDiagnostics().scheduledOneShots ?? 0);

  expect(after).toBeGreaterThan(before!);
});

test("rapid duplicate navigate events within the cooldown window are rate-limited", async ({ page }) => {
  await page.evaluate(() => window.__AUDIO_TEST__?.resume());

  const before = await page.evaluate(() => window.__AUDIO_TEST__?.getDiagnostics().scheduledOneShots ?? 0);
  const scheduledForTen = await page.evaluate(() => {
    for (let i = 0; i < 10; i += 1) {
      window.__AUDIO_TEST__?.emit({ type: "audio:ui-navigate" });
    }
    return window.__AUDIO_TEST__?.getDiagnostics().scheduledOneShots ?? 0;
  });

  // The cooldown (35ms) should suppress most of ten synchronous repeats
  // fired within the same tick, so far fewer than 10 new sounds schedule.
  expect(scheduledForTen - before!).toBeLessThan(10);
  expect(scheduledForTen - before!).toBeGreaterThanOrEqual(1);
});

test("boost-state continuous voice starts and stops with activity", async ({ page }) => {
  await page.evaluate(() => window.__AUDIO_TEST__?.resume());
  // AudioEventAdapter re-derives boost-state from live physics every
  // render frame (spec section 18) and would otherwise immediately
  // overwrite this manually-injected synthetic event with its own
  // "not boosting" observation — stop the frame loop so the injected
  // event is the only thing driving the voice for this test.
  await page.evaluate(() => window.__GAME_TEST__?.runtime.stop());

  const before = await page.evaluate(
    () => window.__AUDIO_TEST__?.getDiagnostics().activeContinuousVoices.length ?? 0
  );

  await page.evaluate(() =>
    window.__AUDIO_TEST__?.emit({
      type: "audio:boost-state",
      carId: "car-player",
      active: true,
      boostAmount: 50
    })
  );
  const during = await page.evaluate(
    () => window.__AUDIO_TEST__?.getDiagnostics().activeContinuousVoices.length ?? 0
  );
  expect(during).toBeGreaterThan(before!);

  await page.evaluate(() =>
    window.__AUDIO_TEST__?.emit({
      type: "audio:boost-state",
      carId: "car-player",
      active: false,
      boostAmount: 50
    })
  );
  const after = await page.evaluate(
    () => window.__AUDIO_TEST__?.getDiagnostics().activeContinuousVoices.length ?? 0
  );
  expect(after).toBeLessThan(during!);
});

test("WS7.E: engine-state continuous voice starts and stops with activity", async ({ page }) => {
  await page.evaluate(() => window.__AUDIO_TEST__?.resume());
  await page.evaluate(() => window.__GAME_TEST__?.runtime.stop());

  // Not asserting on the pre-emit voice list here: the menu-presentation
  // ghost player car (WS7.A) can have a brief non-zero settle velocity
  // right at boot, which — combined with engine-state being emitted
  // unconditionally every frame (unlike boost, which is naturally never
  // active at boot) — can occasionally latch the hysteresis "active"
  // state before runtime.stop() takes effect. The behaviour this test
  // actually cares about (does OUR emit turn it on, does OUR emit turn
  // it off) is unaffected by that.
  await page.evaluate(() =>
    window.__AUDIO_TEST__?.emit({
      type: "audio:engine-state",
      carId: "car-player",
      active: true,
      speed: 12
    })
  );
  const during = await page.evaluate(() => window.__AUDIO_TEST__?.getDiagnostics().activeContinuousVoices ?? []);
  expect(during).toContain("engine:car-player");

  await page.evaluate(() =>
    window.__AUDIO_TEST__?.emit({
      type: "audio:engine-state",
      carId: "car-player",
      active: false,
      speed: 0
    })
  );
  const after = await page.evaluate(() => window.__AUDIO_TEST__?.getDiagnostics().activeContinuousVoices ?? []);
  expect(after).not.toContain("engine:car-player");
});

test("setSettings updates the reported diagnostics settings", async ({ page }) => {
  await page.evaluate(() => window.__AUDIO_TEST__?.setSettings({ masterVolume: 0.25, musicEnabled: false }));

  const diagnostics = await page.evaluate(() => window.__AUDIO_TEST__?.getDiagnostics());
  expect(diagnostics?.settings.masterVolume).toBe(0.25);
  expect(diagnostics?.settings.musicEnabled).toBe(false);
});

test("stopAll clears active continuous voices", async ({ page }) => {
  await page.evaluate(() => window.__AUDIO_TEST__?.resume());
  // See the comment in the boost-state test above: stop the frame loop
  // so AudioEventAdapter doesn't overwrite this synthetic event.
  await page.evaluate(() => window.__GAME_TEST__?.runtime.stop());
  await page.evaluate(() =>
    window.__AUDIO_TEST__?.emit({
      type: "audio:boost-state",
      carId: "car-player",
      active: true,
      boostAmount: 50
    })
  );
  await expect
    .poll(() => page.evaluate(() => window.__AUDIO_TEST__?.getDiagnostics().activeContinuousVoices.length ?? 0))
    .toBeGreaterThan(0);

  await page.evaluate(() => window.__AUDIO_TEST__?.stopAll());
  const diagnostics = await page.evaluate(() => window.__AUDIO_TEST__?.getDiagnostics());
  expect(diagnostics?.activeContinuousVoices.length).toBe(0);
});

test("the audio settings panel toggles reflect and drive live diagnostics", async ({ page }) => {
  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.openSettings());
  await page.getByTestId("settings-tab-audio").click();

  await page.getByTestId("toggle-audio-enabled").click();
  let diagnostics = await page.evaluate(() => window.__AUDIO_TEST__?.getDiagnostics());
  expect(diagnostics?.settings.enabled).toBe(false);

  await page.getByTestId("toggle-audio-enabled").click();
  diagnostics = await page.evaluate(() => window.__AUDIO_TEST__?.getDiagnostics());
  expect(diagnostics?.settings.enabled).toBe(true);

  await page.getByTestId("toggle-music-enabled").click();
  diagnostics = await page.evaluate(() => window.__AUDIO_TEST__?.getDiagnostics());
  expect(diagnostics?.settings.musicEnabled).toBe(false);
});

test("playing a live match produces scheduled audio activity without console errors", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));

  await page.evaluate(() => window.__AUDIO_TEST__?.resume());
  const before = await page.evaluate(() => window.__AUDIO_TEST__?.getDiagnostics().scheduledOneShots ?? 0);

  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.openMatchSetup());
  await page.getByTestId("start-match").click();

  await expect
    .poll(() => page.evaluate(() => window.__GAME_TEST__?.gameFlow?.getSessionState().matchState))
    .not.toBe("MATCH_SETUP");

  await page.evaluate(() => window.__GAME_TEST__?.runtime.stepFixedTicks(300));

  const after = await page.evaluate(() => window.__AUDIO_TEST__?.getDiagnostics().scheduledOneShots ?? 0);
  expect(after).toBeGreaterThan(before!);
  expect(pageErrors).toEqual([]);
});

test("WS7.E: driving during a live match produces the player's engine hum voice", async ({ page }) => {
  await page.evaluate(() => window.__AUDIO_TEST__?.resume());

  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.openMatchSetup());
  await page.getByTestId("start-match").click();

  await expect
    .poll(() => page.evaluate(() => window.__GAME_TEST__?.gameFlow?.getSessionState().matchState), {
      timeout: 10_000
    })
    .toBe("PLAYING");

  await page.keyboard.down("KeyW");

  let sawEngineVoice = false;
  for (let i = 0; i < 40 && !sawEngineVoice; i += 1) {
    await page.waitForTimeout(100);
    const diagnostics = await page.evaluate(() => window.__AUDIO_TEST__?.getDiagnostics());
    sawEngineVoice = diagnostics?.activeContinuousVoices.includes("engine:car-player") ?? false;
  }

  await page.keyboard.up("KeyW");

  expect(sawEngineVoice).toBe(true);
});
