import { describe, expect, it } from "vitest";

import { PLAYER_CAR_ID, OPPONENT_CAR_ID } from "@/game-flow/MatchFlowConstants";
import { MatchFlowController } from "@/game-flow/MatchFlowController";
import { DEFAULT_STATE_SYNC_CONFIG, StateSyncSession } from "@/netcode/StateSyncSession";
import { createFakeNetwork } from "@/netcode/testing/FakeLink";
import type { StateSyncSnapshot } from "@/netcode/stateSync";
import { PhysicsFacade } from "@/physics/PhysicsFacade";
import { NEUTRAL_CAR_INPUT, type CarInput } from "@/physics/PhysicsTypes";

const cfg = DEFAULT_STATE_SYNC_CONFIG;

function makeClock(msPerTick: number) {
  let ticks = 0;
  return { now: () => ticks * msPerTick, advance: (n: number) => { ticks += n; } };
}

function makeSnapshot(tick: number): StateSyncSnapshot {
  return {
    tick,
    world: {
      tick,
      simulationTime: tick / 120,
      cars: [],
      ball: {
        position: { x: 0, y: 1, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        linearVelocity: { x: 0, y: 0, z: 0 },
        angularVelocity: { x: 0, y: 0, z: 0 }
      },
      pads: [],
      goalOverlap: { player: false, opponent: false }
    },
    flow: {
      matchState: "PLAYING",
      playerScore: 0,
      opponentScore: 0,
      regulationTimeRemaining: 180,
      overtimeElapsed: 0,
      countdownTicksRemaining: 0,
      celebrationTicksRemaining: 0,
      overtimeIntroTicksRemaining: 0,
      kickoffCounter: 0,
      goalLatch: false,
      winner: null,
      forfeitedBy: null
    }
  };
}

const input = (throttle: number): CarInput => ({ ...NEUTRAL_CAR_INPUT, throttle });

describe("S3 StateSyncSession", () => {
  it("predicts (holds last input) instead of stalling when a remote input is missing", () => {
    const net = createFakeNetwork({ latencyTicks: 1 }, 7);
    const host = new StateSyncSession({
      localCarId: PLAYER_CAR_ID,
      remoteCarId: OPPONENT_CAR_ID,
      link: net.endpointA,
      isHost: true,
      ...cfg
    });
    const guest = new StateSyncSession({
      localCarId: OPPONENT_CAR_ID,
      remoteCarId: PLAYER_CAR_ID,
      link: net.endpointB,
      isHost: false,
      ...cfg
    });

    // Guest sends input for tick 0 only, then goes silent (total loss after).
    guest.submitLocalInput(0, input(0.7));
    net.advanceClock(3);
    host.pump();

    // Tick 0 was received; ticks 1..5 were never sent — prediction holds 0.7.
    for (let t = 0; t <= 5; t += 1) {
      const sample = host.remoteSource.sampleForTick({
        tick: t,
        matchState: "PLAYING",
        physics: null as never,
        localFrame: null as never
      });
      // 0.7 quantised to the int8 wire grid ≈ 0.7008 — the point is it held
      // the last input, not that it fell back to neutral 0.
      expect(sample.input.throttle).toBeCloseTo(0.7, 2);
    }
  });

  it("delivers host snapshots to the guest, newest-only, and never to the host", () => {
    const net = createFakeNetwork({ latencyTicks: 1 }, 3);
    const host = new StateSyncSession({
      localCarId: PLAYER_CAR_ID,
      remoteCarId: OPPONENT_CAR_ID,
      link: net.endpointA,
      isHost: true,
      ...cfg
    });
    const guest = new StateSyncSession({
      localCarId: OPPONENT_CAR_ID,
      remoteCarId: PLAYER_CAR_ID,
      link: net.endpointB,
      isHost: false,
      ...cfg
    });

    host.sendSnapshot(makeSnapshot(10));
    host.sendSnapshot(makeSnapshot(14));
    net.advanceClock(3);
    guest.pump();

    // Guest keeps only the newest.
    const applied = guest.consumeSnapshot();
    expect(applied?.tick).toBe(14);
    expect(guest.consumeSnapshot()).toBeNull();

    // A guest's sendSnapshot is a no-op (only the host is authoritative).
    guest.sendSnapshot(makeSnapshot(99));
    net.advanceClock(3);
    host.pump();
    // Host ignores snapshots entirely.
    expect(host.consumeSnapshot()).toBeNull();
  });

  it("shouldSnapshot only fires on the host at the configured interval", () => {
    const net = createFakeNetwork({}, 1);
    const host = new StateSyncSession({
      localCarId: PLAYER_CAR_ID, remoteCarId: OPPONENT_CAR_ID, link: net.endpointA, isHost: true, ...cfg
    });
    const guest = new StateSyncSession({
      localCarId: OPPONENT_CAR_ID, remoteCarId: PLAYER_CAR_ID, link: net.endpointB, isHost: false, ...cfg
    });
    expect(host.shouldSnapshot(0)).toBe(true);
    expect(host.shouldSnapshot(cfg.snapshotIntervalTicks)).toBe(true);
    expect(host.shouldSnapshot(1)).toBe(false);
    expect(guest.shouldSnapshot(0)).toBe(false);
  });
});

describe("P4.2 msSinceRemoteActivity (silent-abandonment detection signal)", () => {
  it("grows with an injected clock and resets to ~0 on any received packet", () => {
    const clock = makeClock(50); // 50ms per tick
    const net = createFakeNetwork({ latencyTicks: 1 }, 31);
    const host = new StateSyncSession({
      localCarId: PLAYER_CAR_ID, remoteCarId: OPPONENT_CAR_ID, link: net.endpointA, isHost: true, now: clock.now, ...cfg
    });
    const guest = new StateSyncSession({
      localCarId: OPPONENT_CAR_ID, remoteCarId: PLAYER_CAR_ID, link: net.endpointB, isHost: false, now: clock.now, ...cfg
    });

    expect(host.msSinceRemoteActivity()).toBe(0);

    // Silence: nothing arrives, the clock advances, the signal grows.
    clock.advance(100); // 5000ms
    expect(host.msSinceRemoteActivity()).toBe(5000);

    // Any packet at all — here, an input submission from the guest — counts
    // as proof of life and resets the signal.
    guest.submitLocalInput(0, { ...NEUTRAL_CAR_INPUT, throttle: 0.5 });
    net.advanceClock(3);
    host.pump();
    expect(host.msSinceRemoteActivity()).toBeLessThan(200);

    clock.advance(40); // another 2000ms of silence
    expect(host.msSinceRemoteActivity()).toBeGreaterThanOrEqual(2000);
  });
});

describe("P4.2 forfeit-by-abandonment lands the flow in MATCH_RESULTS with the given winner", () => {
  it("awards the given team and ends a live online match", async () => {
    const physics = new PhysicsFacade();
    await physics.initialise();
    const flow = new MatchFlowController();
    flow.initialise({ physics });
    flow.openMatchSetup();
    flow.setOnlineGuest(false);
    flow.startOnlineMatch({ durationMinutes: 3, kickoffSeed: 1 });
    for (let i = 0; i < 500; i += 1) {
      flow.update();
      physics.step();
      flow.applyPhysicsResults();
    }
    expect(flow.getMatchState()).toBe("PLAYING");

    flow.endOnlineMatchByForfeit("player");

    expect(flow.getMatchState()).toBe("MATCH_RESULTS");
    expect(flow.getSessionState().winner).toBe("player");

    physics.dispose();
  });

  it("is a no-op outside a live/pausable online match", async () => {
    const physics = new PhysicsFacade();
    await physics.initialise();
    const flow = new MatchFlowController();
    flow.initialise({ physics });
    // Never entered an online match — plain menu state.
    flow.endOnlineMatchByForfeit("opponent");
    expect(flow.getMatchState()).not.toBe("MATCH_RESULTS");
    physics.dispose();
  });
});
