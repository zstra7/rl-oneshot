import { describe, expect, it } from "vitest";

import { OPPONENT_CAR_ID, PLAYER_CAR_ID } from "@/game-flow/MatchFlowConstants";
import { LockstepSession } from "@/netcode/LockstepSession";
import { quantizeCarInput } from "@/netcode/InputQuantize";
import { decodePacket, PacketType, type InputFrame } from "@/netcode/protocol";
import { NEUTRAL_CAR_INPUT, type CarInput } from "@/physics/PhysicsTypes";

import { runLockstepMatch } from "../netspike/lockstepHarness";

/**
 * N2 (plan/ONLINE_MULTIPLAYER_PLAN.md): the deterministic-lockstep core.
 * Two independent simulations, each fronted by a LockstepSession that only
 * ever sees the peer's inputs over an impaired link, must stay
 * bit-identical; and any actual state divergence must be caught by the
 * hash exchange rather than pass silently.
 */

const MATRIX_TICKS = 1500; // 12.5s of gameplay per scenario

describe("N2 lockstep core: two sims over an impaired link stay bit-identical", () => {
  const scenarios: { name: string; network: Parameters<typeof runLockstepMatch>[0]["network"]; delay?: number }[] = [
    { name: "perfect link (0ms)", network: {} },
    { name: "50ms +/-10ms jitter", network: { latencyTicks: 6, jitterTicks: 1 } },
    { name: "120ms +/-30ms jitter", network: { latencyTicks: 14, jitterTicks: 4 } },
    { name: "3% loss", network: { latencyTicks: 6, jitterTicks: 1, lossProb: 0.03 } },
    { name: "10% loss + 5% dup", network: { latencyTicks: 8, jitterTicks: 2, lossProb: 0.1, dupProb: 0.05 } }
  ];

  for (const scenario of scenarios) {
    it(`stays synced and completes under: ${scenario.name}`, async () => {
      const result = await runLockstepMatch({
        ticks: MATRIX_TICKS,
        network: scenario.network,
        seed: 0x1234,
        ...(scenario.delay !== undefined ? { inputDelayTicks: scenario.delay } : {})
      });

      expect(result.completed).toBe(true);
      expect(result.statusA).toBe("running");
      expect(result.statusB).toBe("running");
      // The whole point: both peers, fed only each other's inputs over a
      // lossy/jittery link, reach bit-identical final state.
      expect(result.hashA).toBe(result.hashB);
      // Sanity: the sim actually ran (not a trivially-equal empty state).
      expect(result.simulatedTicksA).toBe(MATRIX_TICKS);
    }, 60_000);
  }

  it("stall time is bounded: a clean link never stalls, a laggy link stalls but stays finite", async () => {
    const clean = await runLockstepMatch({ ticks: 600, network: {}, seed: 1 });
    expect(clean.statsA.maxConsecutiveStalls).toBe(0);
    expect(clean.statsB.maxConsecutiveStalls).toBe(0);

    // Latency far exceeding the input delay forces stalls, but they must
    // stay bounded (the sim keeps catching up), and never desync.
    const laggy = await runLockstepMatch({ ticks: 600, network: { latencyTicks: 20, jitterTicks: 5 }, seed: 1 });
    expect(laggy.completed).toBe(true);
    expect(laggy.hashA).toBe(laggy.hashB);
    expect(laggy.statsA.maxConsecutiveStalls).toBeLessThan(60);
  }, 60_000);
});

describe("N2 desync detector", () => {
  it("catches a single forged remote input within one hash interval and flags DESYNCED", async () => {
    const result = await runLockstepMatch({
      ticks: 800,
      network: { latencyTicks: 4 },
      seed: 7,
      forge: { atTick: 300, side: "A" }
    });

    // At least one side must flag desync (the side whose hash the other
    // contradicts). The forged tick is 300; the next checkpoint is 360, so
    // detection must land within one 60-tick interval of it.
    const desynced = result.statusA === "desynced" || result.statusB === "desynced";
    expect(desynced).toBe(true);
    const detectionTick = result.desyncTickA ?? result.desyncTickB ?? Number.MAX_SAFE_INTEGER;
    expect(detectionTick).toBeGreaterThanOrEqual(300);
    expect(detectionTick).toBeLessThanOrEqual(360);
  }, 60_000);

  it("does NOT flag desync on a clean, honest match", async () => {
    const result = await runLockstepMatch({ ticks: 800, network: { latencyTicks: 4 }, seed: 7 });
    expect(result.statusA).toBe("running");
    expect(result.statusB).toBe("running");
    expect(result.hashA).toBe(result.hashB);
  }, 60_000);
});

describe("N2 redundancy window", () => {
  it("a single surviving packet confirms its whole window of ticks", () => {
    // A session whose link captures everything it sends, delivering nothing.
    const sent: Uint8Array[] = [];
    const captureLink = { send: (b: Uint8Array) => sent.push(b), receive: () => [] };
    const sender = new LockstepSession({
      localCarId: PLAYER_CAR_ID,
      remoteCarId: OPPONENT_CAR_ID,
      link: captureLink,
      inputDelayTicks: 4,
      redundancyWindow: 8,
      hashIntervalTicks: 60
    });

    // Real inputs arrive pre-quantized from LocalDeviceSource; the wire is
    // lossless with respect to that quantized value.
    const driving: CarInput = quantizeCarInput({ ...NEUTRAL_CAR_INPUT, throttle: 1, steer: 0.25 });
    for (let tick = 0; tick <= 15; tick += 1) {
      sender.submitLocalInput(tick, driving);
    }

    // The packet emitted when tick 15 was submitted carries the last 8
    // frames: ticks 8..15. Deliver ONLY that packet to a fresh receiver.
    const lastPacket = sent[sent.length - 1]!;
    const decoded = decodePacket(lastPacket);
    expect(decoded?.type).toBe(PacketType.Input);

    const receiver = new LockstepSession({
      localCarId: OPPONENT_CAR_ID,
      remoteCarId: PLAYER_CAR_ID,
      link: { send: () => {}, receive: () => [lastPacket] },
      inputDelayTicks: 4,
      redundancyWindow: 8,
      hashIntervalTicks: 60
    });
    receiver.pump();

    // Even though every packet for ticks 8..14 was "lost", the single
    // surviving tick-15 packet's redundancy window confirms all of them.
    for (let tick = 8; tick <= 15; tick += 1) {
      expect(receiver.remoteSource.hasInputForTick(tick), `tick ${tick} confirmed`).toBe(true);
      expect(receiver.remoteInputForTick(tick)).toEqual(driving);
    }
    // Ticks before the window were only in dropped packets — still missing.
    expect(receiver.remoteSource.hasInputForTick(7)).toBe(false);
  });

  it("input packets carry the configured redundancy window, not just the newest frame", () => {
    const sent: Uint8Array[] = [];
    const session = new LockstepSession({
      localCarId: PLAYER_CAR_ID,
      remoteCarId: OPPONENT_CAR_ID,
      link: { send: (b) => sent.push(b), receive: () => [] },
      inputDelayTicks: 4,
      redundancyWindow: 8,
      hashIntervalTicks: 60
    });
    for (let tick = 0; tick <= 10; tick += 1) {
      session.submitLocalInput(tick, { ...NEUTRAL_CAR_INPUT, throttle: 1 });
    }
    const decoded = decodePacket(sent[sent.length - 1]!);
    if (decoded?.type !== PacketType.Input) throw new Error("expected input packet");
    const ticksInLastPacket = decoded.frames.map((f: InputFrame) => f.tick);
    expect(ticksInLastPacket).toEqual([3, 4, 5, 6, 7, 8, 9, 10]);
  });
});
