import { describe, expect, it } from "vitest";

import { PLAYER_CAR_ID, OPPONENT_CAR_ID } from "@/game-flow/MatchFlowConstants";
import { DEFAULT_STATE_SYNC_CONFIG, StateSyncSession } from "@/netcode/StateSyncSession";
import { createFakeNetwork } from "@/netcode/testing/FakeLink";
import type { StateSyncSnapshot } from "@/netcode/stateSync";
import { NEUTRAL_CAR_INPUT, type CarInput } from "@/physics/PhysicsTypes";

const cfg = DEFAULT_STATE_SYNC_CONFIG;

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
      winner: null
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
