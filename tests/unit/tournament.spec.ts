import { describe, expect, it } from "vitest";

import { TOURNAMENT_ROUNDS, TournamentController } from "@/game-flow/TournamentController";

describe("TournamentController (R13, plan/RAMPS_AND_FEATURES_PLAN.md)", () => {
  it("has the exact 4-round easy/medium/hard/legend ladder", () => {
    expect(TOURNAMENT_ROUNDS.map((r) => r.difficulty)).toEqual(["easy", "medium", "hard", "legend"]);
    expect(TOURNAMENT_ROUNDS).toHaveLength(4);
  });

  it("full 4-win walkthrough ends in champion with all wins recorded", () => {
    const tournament = new TournamentController();
    tournament.enter();
    expect(tournament.getPublicState().phase).toBe("setup");

    tournament.begin(3);
    expect(tournament.getPublicState()).toMatchObject({ active: true, phase: "bracket", currentRound: 0 });

    for (let round = 0; round < 4; round += 1) {
      const config = tournament.startNextMatch();
      expect(config.difficulty).toBe(TOURNAMENT_ROUNDS[round]!.difficulty);
      expect(tournament.getPublicState().phase).toBe("in-match");

      tournament.recordMatchResult("player");

      if (round < 3) {
        expect(tournament.getPublicState()).toMatchObject({ phase: "bracket", currentRound: round + 1 });
      } else {
        expect(tournament.getPublicState().phase).toBe("champion");
      }
    }

    expect(tournament.getPublicState().results).toEqual(["win", "win", "win", "win"]);
  });

  it("a loss eliminates the player and leaves later rounds null", () => {
    const tournament = new TournamentController();
    tournament.enter();
    tournament.begin(1);

    tournament.startNextMatch();
    tournament.recordMatchResult("opponent");

    const state = tournament.getPublicState();
    expect(state.phase).toBe("eliminated");
    expect(state.currentRound).toBe(0);
    expect(state.results).toEqual(["loss", null, null, null]);
  });

  it("a null winner is treated defensively as a loss", () => {
    const tournament = new TournamentController();
    tournament.enter();
    tournament.begin(1);

    tournament.startNextMatch();
    tournament.recordMatchResult(null);

    const state = tournament.getPublicState();
    expect(state.phase).toBe("eliminated");
    expect(state.results[0]).toBe("loss");
  });

  it("propagates the chosen duration through begin()", () => {
    const tournament = new TournamentController();
    tournament.enter();
    tournament.begin(10);
    expect(tournament.getPublicState().durationMinutes).toBe(10);
  });

  it("recordMatchResult is idempotent — a second call for the same round does not double-advance", () => {
    const tournament = new TournamentController();
    tournament.enter();
    tournament.begin(1);

    tournament.startNextMatch();
    tournament.recordMatchResult("player");
    const afterFirstCall = tournament.getPublicState();
    expect(afterFirstCall).toMatchObject({ phase: "bracket", currentRound: 1 });

    // Second call for the round-0 match that already resolved: phase has
    // already moved off "in-match", so this must be a no-op, not a second
    // advance to round 2.
    tournament.recordMatchResult("player");
    const afterSecondCall = tournament.getPublicState();
    expect(afterSecondCall).toEqual(afterFirstCall);
  });

  it("recordMatchResult is a no-op when the tournament is not in-match (e.g. called without startNextMatch)", () => {
    const tournament = new TournamentController();
    tournament.enter();
    tournament.begin(1);
    const before = tournament.getPublicState();

    tournament.recordMatchResult("player");

    expect(tournament.getPublicState()).toEqual(before);
  });

  it("leave() fully resets state back to inactive", () => {
    const tournament = new TournamentController();
    tournament.enter();
    tournament.begin(10);
    tournament.startNextMatch();
    tournament.recordMatchResult("player");

    tournament.leave();

    expect(tournament.getPublicState()).toEqual({
      active: false,
      phase: "setup",
      currentRound: 0,
      durationMinutes: 3,
      results: [null, null, null, null],
      rounds: TOURNAMENT_ROUNDS
    });
  });

  it("enter() resets any stale results from a prior tournament run", () => {
    const tournament = new TournamentController();
    tournament.enter();
    tournament.begin(1);
    tournament.startNextMatch();
    tournament.recordMatchResult("opponent");
    expect(tournament.getPublicState().phase).toBe("eliminated");

    tournament.enter();
    expect(tournament.getPublicState()).toMatchObject({
      active: true,
      phase: "setup",
      currentRound: 0,
      results: [null, null, null, null]
    });
  });
});
