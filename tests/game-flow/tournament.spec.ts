import { expect, test, type Page } from "@playwright/test";

/**
 * R13 (plan/RAMPS_AND_FEATURES_PLAN.md): tournament mode end-to-end.
 * Deterministic manual tick-stepping, same established pattern as
 * tests/game-flow/match-flow.spec.ts.
 */

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect
    .poll(() => page.evaluate(() => window.__GAME_TEST__?.gameFlow?.ready() ?? false), {
      timeout: 15_000
    })
    .toBe(true);

  await page.evaluate(() => window.__PHYSICS_TEST__?.pauseRuntime());
});

/** Opens the tournament from the main menu, picks the given duration, and BEGINs it. */
async function openAndBeginTournament(page: Page, minutes: 1 | 3 | 10): Promise<void> {
  await page.getByTestId("open-tournament").click();
  await expect(page.getByTestId("tournament-bracket")).toBeVisible();
  await page.getByTestId(`tournament-duration-${minutes}`).click();
  await page.getByTestId("tournament-begin").click();
}

/** Clicks PLAY NEXT GAME and fast-forwards through the countdown to PLAYING. */
async function playNextRound(page: Page): Promise<void> {
  await page.getByTestId("tournament-play-next").click();
  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.advanceGameTicks(460));
}

/**
 * Scores for the given team, lets the goal-celebration/kickoff sequence
 * play out, then fast-forwards `durationMinutes` worth of game-seconds to
 * run the clock to zero. Hard/legend-tier AI (rounds 2/3) is competent
 * enough to drive back from a parked position and score for real during a
 * long fast-forward window — re-park the opponent car inside every
 * one-second slice of the loop (not just once beforehand) so a scripted
 * "player always wins" result can't be corrupted by the AI actually
 * playing during the fast-forward.
 */
async function scoreThenRunClockToZero(
  page: Page,
  scoringTeam: "player" | "opponent",
  durationMinutes: number
): Promise<void> {
  await page.evaluate(
    (team) => window.__GAME_TEST__?.gameFlow?.simulateGoal(team),
    scoringTeam
  );
  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.advanceGameTicks(264 + 460));

  const totalSeconds = durationMinutes * 60;
  for (let second = 0; second < totalSeconds; second += 1) {
    await page.evaluate(() => {
      window.__PHYSICS_TEST__?.setCarState("car-opponent", {
        position: { x: 40, y: 1, z: 40 },
        linearVelocity: { x: 0, y: 0, z: 0 }
      });
      window.__GAME_TEST__?.gameFlow?.advanceGameSeconds(1);
    });
  }
}

/** Wins the currently-in-progress tournament match (1-0) and waits for the results screen. */
async function winCurrentMatch(page: Page, durationMinutes = 1): Promise<void> {
  await scoreThenRunClockToZero(page, "player", durationMinutes);
  await expect(page.getByTestId("results-screen")).toBeVisible();
  const session = await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.getSessionState());
  expect(session?.winner).toBe("player");
}

test("bracket setup: TOURNAMENT opens the setup screen, BEGIN opens round 0 with ROOKIE ROVERS current", async ({
  page
}) => {
  await page.getByTestId("open-tournament").click();
  await expect(page.getByTestId("tournament-bracket")).toBeVisible();
  await expect(page.getByTestId("tournament-begin")).toBeVisible();

  await page.getByTestId("tournament-duration-1").click();
  await page.getByTestId("tournament-begin").click();

  const round0 = page.getByTestId("bracket-round-0");
  await expect(round0).toBeVisible();
  await expect(round0).toHaveAttribute("data-state", "current");
  await expect(round0).toContainText("ROOKIE ROVERS");

  const tournamentState = await page.evaluate(() => window.__GAME_TEST__?.runtime.getTournamentState());
  expect(tournamentState?.phase).toBe("bracket");
  expect(tournamentState?.currentRound).toBe(0);
  expect(tournamentState?.durationMinutes).toBe(1);
});

test("PLAY NEXT GAME starts round 0 at easy difficulty with the chosen 1-minute duration", async ({
  page
}) => {
  await openAndBeginTournament(page, 1);
  await playNextRound(page);

  const matchState = await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.getMatchState());
  expect(matchState).toBe("PLAYING");

  const difficulty = await page.evaluate(() => window.__GAME_TEST__?.runtime.getAiDifficulty());
  expect(difficulty).toBe("easy");

  const session = await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.getSessionState());
  expect(session?.selectedDurationMinutes).toBe(1);
});

test("winning round 0 shows CONTINUE + LEAVE TOURNAMENT (not REPLAY), CONTINUE advances the bracket to round 1 at medium", async ({
  page
}) => {
  await openAndBeginTournament(page, 1);
  await playNextRound(page);
  await winCurrentMatch(page);

  await expect(page.getByTestId("tournament-continue")).toBeVisible();
  await expect(page.getByRole("button", { name: "LEAVE TOURNAMENT" })).toBeVisible();
  await expect(page.getByRole("button", { name: "REPLAY" })).toHaveCount(0);

  await page.getByTestId("tournament-continue").click();

  await expect(page.getByTestId("tournament-bracket")).toBeVisible();
  await expect(page.getByTestId("bracket-round-0")).toHaveAttribute("data-state", "won");
  await expect(page.getByTestId("bracket-round-1")).toHaveAttribute("data-state", "current");

  const tournamentState = await page.evaluate(() => window.__GAME_TEST__?.runtime.getTournamentState());
  expect(tournamentState?.currentRound).toBe(1);
  expect(tournamentState?.results).toEqual(["win", null, null, null]);

  // Next round will use "medium" per the ladder, applied on the next PLAY NEXT GAME.
  await playNextRound(page);
  const difficulty = await page.evaluate(() => window.__GAME_TEST__?.runtime.getAiDifficulty());
  expect(difficulty).toBe("medium");
});

test("winning all 4 rounds reaches the champion victory screen, and RETURN TO MENU restores pre-tournament AI difficulty", async ({
  page
}) => {
  const preTournamentDifficulty = await page.evaluate(() =>
    window.__GAME_TEST__?.runtime.getAiDifficulty()
  );

  await openAndBeginTournament(page, 1);

  const expectedDifficulties = ["easy", "medium", "hard", "legend"];
  for (let round = 0; round < 4; round += 1) {
    await playNextRound(page);
    const difficulty = await page.evaluate(() => window.__GAME_TEST__?.runtime.getAiDifficulty());
    expect(difficulty).toBe(expectedDifficulties[round]);

    await winCurrentMatch(page);
    await page.getByTestId("tournament-continue").click();
  }

  await expect(page.getByTestId("tournament-victory")).toBeVisible();

  const tournamentState = await page.evaluate(() => window.__GAME_TEST__?.runtime.getTournamentState());
  expect(tournamentState?.phase).toBe("champion");
  expect(tournamentState?.results).toEqual(["win", "win", "win", "win"]);

  await page.getByRole("button", { name: "RETURN TO MENU" }).click();

  await expect(page.getByTestId("main-menu")).toBeVisible();
  const matchState = await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.getMatchState());
  expect(matchState).toBe("MAIN_MENU");

  const finalTournamentState = await page.evaluate(() => window.__GAME_TEST__?.runtime.getTournamentState());
  expect(finalTournamentState?.active).toBe(false);

  const restoredDifficulty = await page.evaluate(() => window.__GAME_TEST__?.runtime.getAiDifficulty());
  expect(restoredDifficulty).toBe(preTournamentDifficulty);
});

test("losing game 1 shows the eliminated bracket state, RETURN TO MENU exits cleanly", async ({ page }) => {
  await openAndBeginTournament(page, 1);
  await playNextRound(page);

  await scoreThenRunClockToZero(page, "opponent", 1);
  await expect(page.getByTestId("results-screen")).toBeVisible();
  const session = await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.getSessionState());
  expect(session?.winner).toBe("opponent");

  await expect(page.getByTestId("tournament-continue")).toBeVisible();
  await page.getByTestId("tournament-continue").click();

  await expect(page.getByTestId("tournament-bracket")).toBeVisible();
  await expect(page.getByRole("heading", { name: "ELIMINATED" })).toBeVisible();
  await expect(page.getByTestId("bracket-round-0")).toHaveAttribute("data-state", "lost");

  const tournamentState = await page.evaluate(() => window.__GAME_TEST__?.runtime.getTournamentState());
  expect(tournamentState?.phase).toBe("eliminated");
  expect(tournamentState?.results).toEqual(["loss", null, null, null]);

  await page.getByTestId("tournament-return").click();
  await expect(page.getByTestId("main-menu")).toBeVisible();
  const finalTournamentState = await page.evaluate(() => window.__GAME_TEST__?.runtime.getTournamentState());
  expect(finalTournamentState?.active).toBe(false);
});

test("LEAVE TOURNAMENT mid-bracket returns to the menu with full state reset, and a normal match still works", async ({
  page
}) => {
  await openAndBeginTournament(page, 1);

  await page.getByTestId("tournament-leave").click();
  await expect(page.getByTestId("main-menu")).toBeVisible();

  const tournamentState = await page.evaluate(() => window.__GAME_TEST__?.runtime.getTournamentState());
  expect(tournamentState?.active).toBe(false);

  // A normal, non-tournament match still runs cleanly afterwards — proves
  // nothing tournament-related leaked into match-flow state.
  await page.evaluate(() => {
    window.__GAME_TEST__?.gameFlow?.openMatchSetup();
    window.__GAME_TEST__?.gameFlow?.selectMatchDuration(1);
    window.__GAME_TEST__?.gameFlow?.startMatch();
    window.__GAME_TEST__?.gameFlow?.advanceGameTicks(460);
  });
  const session = await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.getSessionState());
  expect(session?.matchState).toBe("PLAYING");
});

test("abandonment safety net: pause menu's own RETURN TO MENU mid-tournament-match still resets the tournament and restores AI difficulty", async ({
  page
}) => {
  const preTournamentDifficulty = await page.evaluate(() =>
    window.__GAME_TEST__?.runtime.getAiDifficulty()
  );

  await openAndBeginTournament(page, 1);
  await playNextRound(page);

  // Difficulty is now the round-0 tournament value ("easy"), not
  // necessarily different from preTournamentDifficulty, so assert the
  // active tournament state directly instead.
  let tournamentState = await page.evaluate(() => window.__GAME_TEST__?.runtime.getTournamentState());
  expect(tournamentState?.active).toBe(true);
  expect(tournamentState?.phase).toBe("in-match");

  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.pause());
  await expect(page.getByTestId("pause-menu")).toBeVisible();

  // The pause menu's own RETURN TO MENU (F10: inline confirm row, not
  // window.confirm) — not the tournament's LEAVE button — must still
  // trigger the abandonment safety net.
  await page.getByRole("button", { name: "RETURN TO MENU" }).click();
  await page.getByTestId("pause-confirm-yes").click();

  await expect(page.getByTestId("main-menu")).toBeVisible();

  tournamentState = await page.evaluate(() => window.__GAME_TEST__?.runtime.getTournamentState());
  expect(tournamentState?.active).toBe(false);

  const restoredDifficulty = await page.evaluate(() => window.__GAME_TEST__?.runtime.getAiDifficulty());
  expect(restoredDifficulty).toBe(preTournamentDifficulty);

  // A subsequent normal match still runs cleanly.
  await page.evaluate(() => {
    window.__GAME_TEST__?.gameFlow?.openMatchSetup();
    window.__GAME_TEST__?.gameFlow?.selectMatchDuration(1);
    window.__GAME_TEST__?.gameFlow?.startMatch();
    window.__GAME_TEST__?.gameFlow?.advanceGameTicks(460);
  });
  const session = await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.getSessionState());
  expect(session?.matchState).toBe("PLAYING");
});
