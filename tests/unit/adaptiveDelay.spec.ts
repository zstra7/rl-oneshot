import { describe, expect, it } from "vitest";

import {
  MAX_INPUT_DELAY_TICKS,
  MIN_INPUT_DELAY_TICKS,
  classifyConnection,
  recommendDelayTicks,
  stabilizeDelay
} from "@/netcode/AdaptiveDelay";
import { runLockstepMatch } from "../netspike/lockstepHarness";

const TICK_MS = 1000 / 120;

describe("N7 adaptive input delay policy", () => {
  it("uses the minimum delay for a perfect link", () => {
    expect(recommendDelayTicks(0, 0)).toBe(MIN_INPUT_DELAY_TICKS);
    expect(recommendDelayTicks(Number.NaN)).toBe(MIN_INPUT_DELAY_TICKS);
  });

  it("grows the delay with RTT and jitter, monotonically", () => {
    const d0 = recommendDelayTicks(0, 0);
    const d50 = recommendDelayTicks(50, 10);
    const d120 = recommendDelayTicks(120, 30);
    const d300 = recommendDelayTicks(300, 60);
    expect(d50).toBeGreaterThanOrEqual(d0);
    expect(d120).toBeGreaterThanOrEqual(d50);
    expect(d300).toBeGreaterThanOrEqual(d120);
  });

  it("covers one-way latency plus jitter (a 50ms RTT +10ms jitter needs ~3 ticks)", () => {
    // one-way ~25ms + 10ms jitter = 35ms; at ~8.33ms/tick -> ceil(4.2) = 5.
    expect(recommendDelayTicks(50, 10)).toBe(5);
    // 120ms RTT + 30ms jitter -> 60+30=90ms -> ceil(10.8)=11 -> clamped 10.
    expect(recommendDelayTicks(120, 30)).toBe(MAX_INPUT_DELAY_TICKS);
  });

  it("clamps to [MIN, MAX]", () => {
    expect(recommendDelayTicks(-5)).toBe(MIN_INPUT_DELAY_TICKS);
    expect(recommendDelayTicks(100000, 100000)).toBe(MAX_INPUT_DELAY_TICKS);
  });

  it("classifies connection quality by RTT", () => {
    expect(classifyConnection(20)).toBe("good");
    expect(classifyConnection(120)).toBe("ok");
    expect(classifyConnection(250)).toBe("poor");
    expect(classifyConnection(Number.NaN)).toBe("good"); // no data yet
  });

  it("only adopts a new delay when it differs by >= 2 ticks (no thrashing)", () => {
    expect(stabilizeDelay(4, 5)).toBe(4); // +1, keep
    expect(stabilizeDelay(4, 3)).toBe(4); // -1, keep
    expect(stabilizeDelay(4, 6)).toBe(6); // +2, adopt
    expect(stabilizeDelay(4, 2)).toBe(2); // -2, adopt
  });

  it("at a reasonable ping the recommended delay produces near-zero stalls", async () => {
    // 6-tick one-way (~100ms RTT): the policy's delay fully covers it.
    const delay = recommendDelayTicks(2 * 6 * TICK_MS, 1 * TICK_MS);
    const result = await runLockstepMatch({
      ticks: 800,
      network: { latencyTicks: 6, jitterTicks: 1 },
      seed: 0x99,
      inputDelayTicks: delay
    });
    expect(result.completed).toBe(true);
    expect(result.hashA).toBe(result.hashB);
    // Small stall bursts only (startup + jitter boundary), not the large
    // sustained stalls an under-sized fixed delay would cause.
    expect(result.statsA.maxConsecutiveStalls).toBeLessThan(8);
  }, 60_000);

  it("at extreme ping (beyond what the max delay can hide) the match still completes bit-identically with BOUNDED stalls", async () => {
    // ~233ms RTT one-way exceeds MAX_INPUT_DELAY_TICKS*tick, so stalls are
    // unavoidable (an acknowledged high-RTT limit) — but they must stay
    // bounded (no runaway cascade) and never desync.
    const delay = recommendDelayTicks(2 * 14 * TICK_MS, 4 * TICK_MS);
    expect(delay).toBe(MAX_INPUT_DELAY_TICKS); // clamped
    const result = await runLockstepMatch({
      ticks: 800,
      network: { latencyTicks: 14, jitterTicks: 4 },
      seed: 0x99,
      inputDelayTicks: delay
    });
    expect(result.completed).toBe(true);
    expect(result.hashA).toBe(result.hashB);
    expect(result.statsA.maxConsecutiveStalls).toBeLessThan(30); // bounded, not runaway
  }, 60_000);
});
