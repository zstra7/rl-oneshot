# AI Calibration Log

## WS6 (plan/POLISH_OVERHAUL_PLAN.md) — planning core replaced

**Problem:** the Phase 10 utility-scored planner (reachability-based
defend/clear/attack/collect-boost/retreat mode selection, ball-trajectory
prediction for intercept planning) drove briefly then pinned itself
against a wall permanently, with no recovery.

**Change:** replaced the entire `replan()` core with a minimal
chase-and-shoot planner (drive to a point behind the ball on the shot
line toward the target goal; loop around the near side if the car is
between the ball and that goal) plus real stuck-detection/reversal
recovery. Kept: difficulty tiers, reaction delay, perception noise,
kickoff commitment, limited jumps, hard-only limited aerials, bounded
humanisation mistakes — all unchanged from Phase 10.

**Removed as dead code** (no longer called by anything): `src/ai/BallPredictor.ts`
(`predictBallTrajectory`), `src/ai/Reachability.ts` (`estimateReachSeconds`),
and the `defend`/`clear`/`attack`(-as-a-distinct-reachability-gated-mode)/
`collect-boost`/`retreat` tactical modes and their helper functions
(`defensiveShadowPosition`, `shotApproachPoint`, `clearApproachPoint`,
`retreatPosition`, `selectBoostPad`, `bestReachEstimate`, `isMovingToward`).
`AiTacticalMode` shrank from 7 values to 4: `recover`, `kickoff`,
`attack` (now covers both the direct approach and the loop-around
maneuver — they're the same underlying behaviour with a different
target), and the new `unstuck`.

`AI_CONSTANTS` trimmed to match: removed prediction-horizon, reachability
heuristic, own-goal-danger-distance, defensive-shadow-distance,
attack-reach-time-limit, and boost-reserve/critical-threshold fields
(all now unused); added `approachOffset`, `wrongSideDotThreshold`,
`loopBehindDistance`, `loopSideDistance`, `arenaMargin`, and the three
stuck-detection constants. Left `AiDifficultyParameters`'
`challengeAggression`/`defensiveUrgency`/`boostPadAwarenessRadius` fields
in place (unused by the new planner too) rather than removing them —
that interface already documents itself as "not every field is consumed
... unused fields are kept for spec fidelity", an established pattern
predating WS6 (most of `planningHorizonSeconds`/`candidateCount`/
`decisionTemperature`/etc. were already unused by the Phase 9/10
planner as originally implemented).

**Removed test coverage** (`tests/unit/opponentAi.spec.ts`): the
"boost-pad collection" and "retreat" tests, since neither mode exists
any more — there's nothing left to assert. The "basic defence" test was
kept but rewritten: it no longer checks for a `"defend"` mode (gone),
just that the AI still closes in on a ball threatening its own goal
rather than idling, since the single chase-and-shoot mode has no
separate defensive posture — it always goes for the ball, wherever it
is. `tests/unit/aiDifficulty.spec.ts`'s "clear differs from shadow
defence" test was similarly rewritten to check the planner still
produces a sane, arena-bounded target near either end of the field,
rather than asserting a specific removed mode name.

**New tests**: `tests/unit/aiScoring.spec.ts` (open-net conversion,
direct and angled approach) and `tests/unit/aiUnstuck.spec.ts` (a car
spawned facing directly into a wall must never go 3 real seconds
without at least 0.5m of net movement).

**Regression this uncovered**: `tests/game-flow/match-flow.spec.ts`'s
"timer starts at 1:00 ... reaches 0:30" test spawns a live match with
the AI-controlled opponent and no human input for 30 real seconds
(3600 ticks) and asserts the regulation-time countdown is exact to
within 0.5s. Before WS6, the AI was rarely (if ever) competent enough
to score against an empty net in that window, so the timer's tick-to-
second relationship held cleanly. The WS6 planner is competent enough
to occasionally score within 30 seconds against an unguarded goal,
which triggers `MatchFlowController`'s goal-celebration state — during
which the regulation timer doesn't decrement — throwing the exact-tick
assertion off by however much of the ~2.2s celebration fell inside the
test's window (and, if a goal happened to land exactly as the test
called `pause()`, breaking that assertion too, since `pause()` is a
no-op outside `PAUSABLE_STATES` and `GOAL_CELEBRATION` isn't one of
them). Confirmed via a standalone reproduction script and by running
the pre-WS6 commit against the same test (passed reliably). Fixed by
having the test itself keep the ball parked at the arena centre between
each one-second slice of the 30-second window, rather than giving the
AI 30 uninterrupted seconds free to reach either goal — this is a test-
robustness fix for a match-timer test that was never meant to exercise
AI scoring behaviour, not a change to AI behaviour itself.

## R9 — "Legend" difficulty (plan/RAMPS_AND_FEATURES_PLAN.md)

A 4th real tier above hard, exposed in match setup alongside the other
three (not tournament-exclusive): `LEGEND_AI` in `src/ai/AiDifficulty.ts`
is a tuned-up hard — lower reaction/own-state delay and perception
noise, higher tactical/prediction Hz, a longer planning horizon with
more candidates, higher shot accuracy/skill-parameter values across the
board, and a longer post-mistake cooldown (10s vs. hard's 7s). Also
extended `OpponentAiController`'s two `difficulty === "hard"` gates
(limited aerial pursuit eligibility) to include `"legend"` — without
that, legend's higher `aerialSkill` (0.6 vs. hard's 0.48) would never
actually be exercised, since the aerial-pursuit code path was
hard-difficulty-only rather than skill-threshold-gated.

**Measured reaction-lag ordering** (`tests/unit/aiDifficulty.spec.ts`'s
`measureReactionLagTicks`, 5 seeds, averaged, at 120 ticks/s): easy ≈57
ticks (0.475s), medium ≈27 ticks (0.225s), hard ≈17 ticks (0.142s),
legend ≈11 ticks (0.092s) — strictly decreasing as intended, and legend
is still not omniscient (`Math.min(...results.legend) > 0`, i.e. it
never reacts on the very same tick as the surprise event).
