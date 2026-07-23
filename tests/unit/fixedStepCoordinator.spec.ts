import { describe, expect, it } from "vitest";

import {
  FIXED_DT_SECONDS,
  FixedStepCoordinator
} from "@/core/FixedStepCoordinator";

describe("FixedStepCoordinator", () => {
  it("advances exactly one tick per FIXED_DT_SECONDS of frame delta", () => {
    let tickCount = 0;
    const coordinator = new FixedStepCoordinator(() => {
      tickCount += 1;
    });

    coordinator.advance(FIXED_DT_SECONDS);

    expect(tickCount).toBe(1);
    expect(coordinator.tick).toBe(1);
  });

  it("survives 10,000 empty fixed ticks deterministically with no drift", () => {
    let tickCount = 0;
    const coordinator = new FixedStepCoordinator(() => {
      tickCount += 1;
    });

    // Simulate steady 60fps frames until 10,000 fixed ticks have elapsed.
    const frameDelta = 1 / 60;
    let framesRun = 0;

    while (coordinator.tick < 10_000) {
      coordinator.advance(frameDelta);
      framesRun += 1;

      if (framesRun > 1_000_000) {
        throw new Error("Fixed-step coordinator failed to converge.");
      }
    }

    expect(tickCount).toBe(coordinator.tick);
    expect(coordinator.tick).toBeGreaterThanOrEqual(10_000);
    expect(coordinator.accumulatorSeconds).toBeGreaterThanOrEqual(0);
    expect(coordinator.accumulatorSeconds).toBeLessThan(FIXED_DT_SECONDS);
  });

  it("caps catch-up steps per advance() call to avoid a spiral of death", () => {
    let tickCount = 0;
    const coordinator = new FixedStepCoordinator(() => {
      tickCount += 1;
    });

    // A huge single frame delta (e.g. tab was backgrounded) must not
    // synchronously run an unbounded number of fixed ticks.
    const steps = coordinator.advance(10);

    expect(steps).toBeLessThanOrEqual(8);
    expect(tickCount).toBe(steps);
  });

  it("stepOnce() advances exactly one tick, bypassing the accumulator", () => {
    let tickCount = 0;
    const coordinator = new FixedStepCoordinator(() => {
      tickCount += 1;
    });

    for (let i = 0; i < 10_000; i += 1) {
      coordinator.stepOnce();
    }

    expect(tickCount).toBe(10_000);
    expect(coordinator.tick).toBe(10_000);
  });

  it("reset() clears tick count and accumulator", () => {
    const coordinator = new FixedStepCoordinator(() => {});

    coordinator.advance(1);
    coordinator.reset();

    expect(coordinator.tick).toBe(0);
    expect(coordinator.accumulatorSeconds).toBe(0);
    expect(coordinator.droppedFixedTimeSeconds).toBe(0);
  });

  it("two peers with different pre-match histories emit identical online tick sequences after reset() (online desync regression)", () => {
    // The online desync-to-CPU bug: the two peers enter a match after
    // spending DIFFERENT amounts of menu time, so their coordinators are at
    // different tick counts when `match-start` arrives. The lockstep session
    // numbers inputs and desync-hash checkpoints from 0 and compares hashes
    // at equal absolute ticks — so if the coordinator is NOT reset at match
    // start, the two peers' countdown/kickoff land on different ticks and the
    // hashes split the instant play begins. `startOnlineSession` calls
    // `reset()` for exactly this reason; here we prove that a reset makes two
    // coordinators with unequal histories produce the same tick stream.
    const ticksA: number[] = [];
    const ticksB: number[] = [];
    const peerA = new FixedStepCoordinator((t) => ticksA.push(t));
    const peerB = new FixedStepCoordinator((t) => ticksB.push(t));

    // Peer A idled in menus far longer than peer B before the match.
    for (let i = 0; i < 743; i += 1) peerA.stepOnce();
    for (let i = 0; i < 128; i += 1) peerB.stepOnce();
    expect(peerA.tick).not.toBe(peerB.tick);

    // Match start (what GameRuntime.startOnlineSession does).
    peerA.reset();
    peerB.reset();
    ticksA.length = 0;
    ticksB.length = 0;

    // Both now simulate the first 200 match ticks.
    for (let i = 0; i < 200; i += 1) {
      peerA.stepOnce();
      peerB.stepOnce();
    }

    expect(ticksA[0]).toBe(0);
    expect(ticksB[0]).toBe(0);
    expect(ticksA).toEqual(ticksB);
  });
});
