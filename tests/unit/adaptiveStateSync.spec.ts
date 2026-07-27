import { describe, expect, it } from "vitest";

import { PLAYER_CAR_ID, OPPONENT_CAR_ID } from "@/game-flow/MatchFlowConstants";
import { DEFAULT_STATE_SYNC_CONFIG, StateSyncSession } from "@/netcode/StateSyncSession";
import { createFakeNetwork } from "@/netcode/testing/FakeLink";
import { recommendDelayTicks } from "@/netcode/AdaptiveDelay";

const cfg = DEFAULT_STATE_SYNC_CONFIG;

/** A fake clock: N ticks of FakeLink time = N * msPerTick of wall time. */
function makeClock(msPerTick: number) {
  let ticks = 0;
  return {
    now: () => ticks * msPerTick,
    advance: (n: number) => { ticks += n; }
  };
}

describe("P1.1 adaptive state-sync (RTT/jitter measurement + delay adaptation)", () => {
  it("measures a positive RTT after ping/pong round-trips over a lagged link", () => {
    // 12-tick one-way latency, msPerTick chosen so wall time tracks tick time.
    const clock = makeClock(8.33);
    const net = createFakeNetwork({ latencyTicks: 12 }, 5);
    const host = new StateSyncSession({
      localCarId: PLAYER_CAR_ID,
      remoteCarId: OPPONENT_CAR_ID,
      link: net.endpointA,
      isHost: true,
      now: clock.now,
      ...cfg
    });
    const guest = new StateSyncSession({
      localCarId: OPPONENT_CAR_ID,
      remoteCarId: PLAYER_CAR_ID,
      link: net.endpointB,
      isHost: false,
      now: clock.now,
      ...cfg
    });

    expect(host.getRttMs()).toBeNull();

    // Drive several ping intervals so a full ping -> pong round trip happens.
    for (let tick = 0; tick < 200; tick += 1) {
      host.onTickHousekeeping(tick);
      guest.onTickHousekeeping(tick);
      clock.advance(1);
      net.advanceClock(1);
      host.pump();
      guest.pump();
    }

    expect(host.getRttMs()).not.toBeNull();
    expect(host.getRttMs()!).toBeGreaterThan(0);
    // ~24 ticks round trip (12 out + 12 back) * 8.33ms/tick ≈ 200ms.
    expect(host.getRttMs()!).toBeGreaterThan(50);
  });

  it("raises the input delay for a high-RTT link and holds steady under small changes (hysteresis)", () => {
    const clock = makeClock(8.33);
    const net = createFakeNetwork({ latencyTicks: 30 }, 9); // ~500ms RTT
    const host = new StateSyncSession({
      localCarId: PLAYER_CAR_ID,
      remoteCarId: OPPONENT_CAR_ID,
      link: net.endpointA,
      isHost: true,
      now: clock.now,
      ...cfg
    });
    const guest = new StateSyncSession({
      localCarId: OPPONENT_CAR_ID,
      remoteCarId: PLAYER_CAR_ID,
      link: net.endpointB,
      isHost: false,
      now: clock.now,
      ...cfg
    });

    const initialDelay = host.inputDelayTicks;
    expect(initialDelay).toBe(cfg.inputDelayTicks);

    // Run long enough to cross the adapt interval (600 ticks) with a
    // measured RTT so maybeAdaptDelay actually fires.
    for (let tick = 0; tick < 700; tick += 1) {
      host.onTickHousekeeping(tick);
      guest.onTickHousekeeping(tick);
      clock.advance(1);
      net.advanceClock(1);
      host.pump();
      guest.pump();
    }

    expect(host.getRttMs()).not.toBeNull();
    const recommended = recommendDelayTicks(host.getRttMs()!, host.getJitterMs());
    expect(recommended).toBeGreaterThan(initialDelay);
    expect(host.inputDelayTicks).toBe(recommended);

    // A further short run with the same link should not change it again
    // (hysteresis + adapt-interval both apply).
    const afterFirstAdapt = host.inputDelayTicks;
    for (let tick = 700; tick < 750; tick += 1) {
      host.onTickHousekeeping(tick);
      clock.advance(1);
      net.advanceClock(1);
      host.pump();
    }
    expect(host.inputDelayTicks).toBe(afterFirstAdapt);
  });
});
