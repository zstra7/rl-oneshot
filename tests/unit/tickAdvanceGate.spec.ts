import { describe, expect, it } from "vitest";

import { ALWAYS_ADVANCE, FIXED_DT_SECONDS, FixedStepCoordinator } from "@/core/FixedStepCoordinator";

/**
 * N1 (plan/ONLINE_MULTIPLAYER_PLAN.md): the FixedStepCoordinator gains a
 * TickAdvanceGate seam so online lockstep can stall the shared timeline
 * when a remote input is missing. Single-player keeps ALWAYS_ADVANCE and
 * behaves exactly as before.
 */
describe("N1 TickAdvanceGate seam on FixedStepCoordinator", () => {
  it("defaults to ALWAYS_ADVANCE: advance runs every accumulated tick, unchanged from pre-N1", () => {
    const ticks: number[] = [];
    const coord = new FixedStepCoordinator((tick) => ticks.push(tick));
    const steps = coord.advance(FIXED_DT_SECONDS * 5);
    expect(steps).toBe(5);
    expect(ticks).toEqual([0, 1, 2, 3, 4]);
  });

  it("a closed gate stalls the timeline: no ticks run and the tick counter does not advance", () => {
    const ticks: number[] = [];
    const coord = new FixedStepCoordinator((tick) => ticks.push(tick));
    coord.setAdvanceGate({ canAdvance: () => false });

    const steps = coord.advance(FIXED_DT_SECONDS * 5);
    expect(steps).toBe(0);
    expect(ticks).toEqual([]);
    expect(coord.tick).toBe(0);
  });

  it("a gate that only allows ticks it has 'remote input' for advances up to the gap, then stalls, then resumes", () => {
    const ticks: number[] = [];
    let highestConfirmedTick = 2; // remote inputs available for ticks 0,1,2
    const coord = new FixedStepCoordinator((tick) => ticks.push(tick));
    coord.setAdvanceGate({ canAdvance: (tick) => tick <= highestConfirmedTick });

    // Plenty of accumulated time, but the gate stops us at the confirmed edge.
    coord.advance(FIXED_DT_SECONDS * 10);
    expect(ticks).toEqual([0, 1, 2]);
    expect(coord.tick).toBe(3);

    // Remote catches up; the buffered time now flushes to the new edge.
    highestConfirmedTick = 5;
    coord.advance(0);
    expect(ticks).toEqual([0, 1, 2, 3, 4, 5]);
    expect(coord.tick).toBe(6);
  });

  it("stepOnce is ungated (manual stepping is an explicit force)", () => {
    const ticks: number[] = [];
    const coord = new FixedStepCoordinator((tick) => ticks.push(tick));
    coord.setAdvanceGate({ canAdvance: () => false });
    coord.stepOnce();
    expect(ticks).toEqual([0]);
    expect(coord.tick).toBe(1);
  });

  it("ALWAYS_ADVANCE is a stable shared no-op gate", () => {
    expect(ALWAYS_ADVANCE.canAdvance(0)).toBe(true);
    expect(ALWAYS_ADVANCE.canAdvance(999999)).toBe(true);
  });
});
