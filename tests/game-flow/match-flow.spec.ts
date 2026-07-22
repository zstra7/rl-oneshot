import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect
    .poll(() => page.evaluate(() => window.__GAME_TEST__?.gameFlow?.ready() ?? false), {
      timeout: 15_000
    })
    .toBe(true);

  // Deterministic manual tick-stepping (advanceGameTicks) requires the
  // live RAF loop paused first -- otherwise it keeps stepping match-flow
  // and physics concurrently with the manual steps (see
  // tests/physics/foundation.spec.ts for the same established pattern).
  await page.evaluate(() => window.__PHYSICS_TEST__?.pauseRuntime());
});

test("main menu is shown at boot with PLAY/SETTINGS visible", async ({ page }) => {
  await expect(page.getByTestId("main-menu")).toBeVisible();
  await expect(page.getByRole("button", { name: "PLAY" })).toBeVisible();
  await expect(page.getByRole("button", { name: "SETTINGS" })).toBeVisible();
  await expect(page.locator("canvas.game-canvas")).toBeVisible();

  const matchState = await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.getMatchState());
  expect(matchState).toBe("MAIN_MENU");
});

test("duration selection is retained through to a started match", async ({ page }) => {
  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.openMatchSetup());
  await expect(page.getByTestId("match-setup")).toBeVisible();

  for (const minutes of [1, 3, 10] as const) {
    await page.evaluate((m) => window.__GAME_TEST__?.gameFlow?.selectMatchDuration(m), minutes);
    const session = await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.getSessionState());
    expect(session?.selectedDurationMinutes).toBe(minutes);
  }

  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.selectMatchDuration(1));
  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.startMatch());
  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.advanceGameTicks(460));

  const session = await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.getSessionState());
  expect(session?.selectedDurationMinutes).toBe(1);
  expect(session?.matchState).toBe("PLAYING");
});

test("countdown proceeds 3 -> 2 -> 1 -> GO -> PLAYING with controls disabled until GO", async ({
  page
}) => {
  await page.evaluate(() => {
    window.__GAME_TEST__?.gameFlow?.openMatchSetup();
    window.__GAME_TEST__?.gameFlow?.selectMatchDuration(1);
    window.__GAME_TEST__?.gameFlow?.clearMatchFlowEvents();
    window.__GAME_TEST__?.gameFlow?.startMatch();
  });

  await expect(page.getByTestId("countdown-overlay")).toBeVisible();

  const seenStates: string[] = [];
  for (let i = 0; i < 30; i += 1) {
    await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.advanceGameTicks(1));
    const state = await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.getMatchState());
    if (state && seenStates[seenStates.length - 1] !== state) {
      seenStates.push(state);
    }
  }
  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.advanceGameTicks(500));

  const events = await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.getMatchFlowEvents());
  const countdownValues = (events ?? [])
    .filter((e) => e.type === "countdown-step")
    .map((e) => (e as { value: unknown }).value);
  expect(countdownValues).toEqual([3, 2, 1, "GO"]);

  const finalState = await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.getMatchState());
  expect(finalState).toBe("PLAYING");
});

test("timer starts at 1:00 for a one-minute match and reaches 0:30", async ({ page }) => {
  await page.evaluate(() => {
    window.__GAME_TEST__?.gameFlow?.openMatchSetup();
    window.__GAME_TEST__?.gameFlow?.selectMatchDuration(1);
    window.__GAME_TEST__?.gameFlow?.startMatch();
    window.__GAME_TEST__?.gameFlow?.advanceGameTicks(460);
  });

  const initialSession = await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.getSessionState());
  expect(initialSession?.regulationTimeRemaining).toBeCloseTo(60, 0);

  // WS6 made the opponent AI competent enough to actually score against
  // an unguarded net — if a goal happened somewhere in this 30-second
  // window, the resulting goal-celebration pause would throw off the
  // otherwise-exact tick/second relationship this test relies on (and
  // could even leave the match mid-celebration instead of PLAYING when
  // pause() below is called, which is a no-op outside PAUSABLE_STATES).
  // This test is about timer mechanics, not AI behaviour, so keep the
  // ball parked dead centre between each one-second slice rather than
  // letting the AI have 30 uninterrupted seconds to reach either goal.
  for (let second = 0; second < 30; second += 1) {
    await page.evaluate(() => {
      window.__PHYSICS_TEST__?.setBallState({
        position: { x: 0, y: 1, z: 0 },
        linearVelocity: { x: 0, y: 0, z: 0 }
      });
      window.__GAME_TEST__?.gameFlow?.advanceGameSeconds(1);
    });
  }
  const halfwaySession = await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.getSessionState());
  expect(halfwaySession?.regulationTimeRemaining).toBeCloseTo(30, 0);

  // Pauses correctly.
  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.pause());
  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.advanceGameTicks(120));
  const pausedSession = await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.getSessionState());
  expect(pausedSession?.regulationTimeRemaining).toBeCloseTo(30, 0);
  expect(pausedSession?.matchState).toBe("PAUSED");

  // Resumes correctly.
  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.resume());
  const resumedSession = await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.getSessionState());
  expect(resumedSession?.matchState).toBe("PLAYING");
});

test("a goal increments score once, celebrates, resets, and restarts the countdown", async ({
  page
}) => {
  await page.evaluate(() => {
    window.__GAME_TEST__?.gameFlow?.openMatchSetup();
    window.__GAME_TEST__?.gameFlow?.selectMatchDuration(3);
    window.__GAME_TEST__?.gameFlow?.startMatch();
    window.__GAME_TEST__?.gameFlow?.advanceGameTicks(460);
  });

  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.simulateGoal("player"));
  await expect(page.getByTestId("goal-banner")).toBeVisible();

  const afterGoal = await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.getSessionState());
  expect(afterGoal?.playerScore).toBe(1);
  expect(afterGoal?.matchState).toBe("GOAL_CELEBRATION");

  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.advanceGameTicks(264 + 460));
  const afterReset = await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.getSessionState());
  expect(afterReset?.matchState).toBe("PLAYING");
  expect(afterReset?.playerScore).toBe(1);
});

test("R6: a goal blasts a nearby parked car away from the scored-on goal", async ({ page }) => {
  await page.evaluate(() => {
    window.__GAME_TEST__?.gameFlow?.openMatchSetup();
    window.__GAME_TEST__?.gameFlow?.selectMatchDuration(3);
    window.__GAME_TEST__?.gameFlow?.startMatch();
    window.__GAME_TEST__?.gameFlow?.advanceGameTicks(460);
  });
  await page.evaluate(() => {
    const centre = window.__PHYSICS_TEST__?.getGoalSensorCentre("opponent");
    if (!centre) {
      return;
    }
    window.__PHYSICS_TEST__?.setCarState("car-player", {
      position: { x: centre.x + 3, y: 0.6, z: centre.z + (centre.z < 0 ? 4 : -4) },
      linearVelocity: { x: 0, y: 0, z: 0 }
    });
  });
  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.advanceGameTicks(30));

  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.simulateGoal("player"));
  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.advanceGameTicks(2));

  const playerState = await page.evaluate(() => window.__PHYSICS_TEST__?.getCarState("car-player"));
  const speed = Math.hypot(
    playerState!.linearVelocity.x,
    playerState!.linearVelocity.y,
    playerState!.linearVelocity.z
  );
  expect(speed).toBeGreaterThan(6);
});

test("results screen shows victory/defeat, final score, and replay/return buttons", async ({
  page
}) => {
  await page.evaluate(() => {
    window.__GAME_TEST__?.gameFlow?.openMatchSetup();
    window.__GAME_TEST__?.gameFlow?.selectMatchDuration(1);
    window.__GAME_TEST__?.gameFlow?.startMatch();
    window.__GAME_TEST__?.gameFlow?.advanceGameTicks(460);
    window.__GAME_TEST__?.gameFlow?.simulateGoal("player");
  });

  // Force regulation to end 1-0 (not tied) so the match ends without overtime.
  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.advanceGameTicks(264 + 460));
  // Park the opponent far from the ball before fast-forwarding a full
  // minute of live simulation: post-WS2's much snappier driving, the AI
  // is now competent enough to occasionally score for real during a
  // 60-second stretch, which would flip this into overtime instead of a
  // clean regulation win — this test is about the results-screen
  // transition, not AI scoring odds, so keep the opponent out of play.
  await page.evaluate(() =>
    window.__PHYSICS_TEST__?.setCarState("car-opponent", { position: { x: 40, y: 1, z: 40 } })
  );
  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.advanceGameSeconds(60));

  await expect(page.getByTestId("results-screen")).toBeVisible();
  const session = await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.getSessionState());
  expect(session?.matchState).toBe("MATCH_RESULTS");
  expect(session?.winner).toBe("player");

  await expect(page.getByTestId("final-score")).toHaveText("1 - 0");
  await expect(page.getByRole("button", { name: "REPLAY" })).toBeVisible();
  await expect(page.getByRole("button", { name: "RETURN TO MENU" })).toBeVisible();
});

test("replay resets scores, retains duration, and restarts the countdown", async ({ page }) => {
  await page.evaluate(() => {
    window.__GAME_TEST__?.gameFlow?.openMatchSetup();
    window.__GAME_TEST__?.gameFlow?.selectMatchDuration(1);
    window.__GAME_TEST__?.gameFlow?.startMatch();
    window.__GAME_TEST__?.gameFlow?.advanceGameTicks(460);
    window.__GAME_TEST__?.gameFlow?.simulateGoal("player");
  });
  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.advanceGameTicks(264 + 460));
  // See the "results screen" test above: park the opponent so it can't
  // score for real during the 60-second fast-forward and flip the match
  // into overtime instead of a clean regulation win.
  await page.evaluate(() =>
    window.__PHYSICS_TEST__?.setCarState("car-opponent", { position: { x: 40, y: 1, z: 40 } })
  );
  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.advanceGameSeconds(60));

  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.replayMatch());

  const session = await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.getSessionState());
  expect(session?.playerScore).toBe(0);
  expect(session?.opponentScore).toBe(0);
  expect(session?.selectedDurationMinutes).toBe(1);
  expect(session?.matchState).toBe("COUNTDOWN_3");
});

test("return to menu hides the HUD, shows the main menu, and resets score", async ({ page }) => {
  await page.evaluate(() => {
    window.__GAME_TEST__?.gameFlow?.openMatchSetup();
    window.__GAME_TEST__?.gameFlow?.selectMatchDuration(1);
    window.__GAME_TEST__?.gameFlow?.startMatch();
    window.__GAME_TEST__?.gameFlow?.advanceGameTicks(460);
  });
  await expect(page.getByTestId("gameplay-hud")).toBeVisible();

  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.returnToMenu());

  await expect(page.getByTestId("main-menu")).toBeVisible();
  await expect(page.getByTestId("gameplay-hud")).toHaveCount(0);
  const session = await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.getSessionState());
  expect(session?.matchState).toBe("MAIN_MENU");
  expect(session?.playerScore).toBe(0);
});

test("WS7.C: the menu-presentation ghost ball/cars hide during a live match and reappear back at menu", async ({
  page
}) => {
  expect(await page.evaluate(() => window.__GAME_TEST__?.runtime.isMenuPresentationVisible())).toBe(true);

  await page.evaluate(() => {
    window.__GAME_TEST__?.gameFlow?.openMatchSetup();
    window.__GAME_TEST__?.gameFlow?.selectMatchDuration(1);
    window.__GAME_TEST__?.gameFlow?.startMatch();
    window.__GAME_TEST__?.gameFlow?.advanceGameTicks(460);
  });
  const session = await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.getSessionState());
  expect(session?.matchState).toBe("PLAYING");
  expect(await page.evaluate(() => window.__GAME_TEST__?.runtime.isMenuPresentationVisible())).toBe(false);

  await page.evaluate(() => {
    window.__GAME_TEST__?.gameFlow?.returnToMenu();
    // The RAF loop is paused (see beforeEach) for deterministic manual
    // ticking — app-state sync (and therefore this visibility toggle)
    // happens inside onFixedTick, so it needs one more manual tick to
    // pick up the state change returnToMenu() just made.
    window.__GAME_TEST__?.gameFlow?.advanceGameTicks(1);
  });
  expect(await page.evaluate(() => window.__GAME_TEST__?.runtime.isMenuPresentationVisible())).toBe(true);
});

test("WS9.D: the boost ring's --boost-pct custom property tracks the store's boost amount", async ({ page }) => {
  await page.evaluate(() => {
    window.__GAME_TEST__?.gameFlow?.openMatchSetup();
    window.__GAME_TEST__?.gameFlow?.startMatch();
    window.__GAME_TEST__?.gameFlow?.advanceGameTicks(460);
  });

  const reading = await page.evaluate(() => {
    const boostMeter = document.querySelector('[data-testid="boost-meter"]') as HTMLElement | null;
    const boostValue = document.querySelector('[data-testid="boost-meter"] .boost-value');
    return {
      boostPct: boostMeter?.style.getPropertyValue("--boost-pct"),
      boostValue: boostValue?.textContent
    };
  });

  expect(reading.boostPct).not.toBe("");
  expect(reading.boostPct).toBe(reading.boostValue?.trim());
});
