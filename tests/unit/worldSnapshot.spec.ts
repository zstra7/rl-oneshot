import { describe, expect, it } from "vitest";

import { PhysicsFacade } from "@/physics/PhysicsFacade";
import { PLAYER_CAR_ID, OPPONENT_CAR_ID } from "@/game-flow/MatchFlowConstants";

/**
 * S1 (online state-sync): a guest that applies the host's snapshot every few
 * ticks must stay tightly converged to the host — even after starting from a
 * completely different history and driving into walls. This is the property
 * the whole host-authoritative netcode leans on: correctness comes from
 * periodic authoritative snapshots, NOT from bit-perfect cross-machine
 * determinism (which the old lockstep fatally required). A single snapshot
 * application only needs to be CLOSE — Rapier renormalises quaternions on
 * setRotation, so exact equality is neither achievable nor needed.
 */
const NEUTRAL = { throttle: 0, steer: 0, pitch: 0, yaw: 0, roll: 0, jump: false, boost: false, powerslide: false };

function drive(tick: number) {
  return { ...NEUTRAL, throttle: 1, steer: tick % 40 < 20 ? 1 : -1, boost: true };
}

function maxCarError(a: PhysicsFacade, b: PhysicsFacade): number {
  const ca = a.getAllCarStates();
  const cb = b.getAllCarStates();
  let err = 0;
  for (let i = 0; i < ca.length; i += 1) {
    const pa = ca[i]!.position;
    const pb = cb[i]!.position;
    err = Math.max(err, Math.abs(pa.x - pb.x), Math.abs(pa.y - pb.y), Math.abs(pa.z - pb.z));
  }
  return err;
}

async function boot(): Promise<PhysicsFacade> {
  const f = new PhysicsFacade();
  await f.initialise();
  f.resetWorld({ carCreationOrder: [PLAYER_CAR_ID, OPPONENT_CAR_ID], kickoffVariantIndex: 0 });
  return f;
}

describe("S1 world snapshot", () => {
  it("captures enough state that a fresh guest snaps onto the host within microns", async () => {
    const host = await boot();
    for (let t = 0; t < 400; t += 1) {
      host.setCarInput(PLAYER_CAR_ID, drive(t));
      host.setCarInput(OPPONENT_CAR_ID, drive(t + 13));
      host.step();
    }
    const snapshot = host.getWorldSnapshot();

    const guest = await boot();
    for (let t = 0; t < 137; t += 1) {
      guest.setCarInput(PLAYER_CAR_ID, drive(t + 7));
      guest.setCarInput(OPPONENT_CAR_ID, drive(t));
      guest.step();
    }
    guest.applyWorldSnapshot(snapshot);

    // Snapping onto the authoritative frame lands within floating-point noise.
    expect(maxCarError(guest, host)).toBeLessThan(1e-5);

    host.dispose();
    guest.dispose();
  }, 60_000);

  it("keeps a differently-started guest converged when snapshots arrive every few ticks", async () => {
    const host = await boot();
    const guest = await boot();
    // Guest starts 40 ticks ahead on a different input history → wildly
    // diverged before the first correction.
    for (let t = 0; t < 40; t += 1) {
      guest.setCarInput(PLAYER_CAR_ID, drive(t + 5));
      guest.setCarInput(OPPONENT_CAR_ID, drive(t + 99));
      guest.step();
    }

    const SNAPSHOT_EVERY = 4;
    let worstAfterCorrection = 0;
    for (let t = 0; t < 900; t += 1) {
      const p = drive(t);
      const o = drive(t + 13);
      host.setCarInput(PLAYER_CAR_ID, p);
      host.setCarInput(OPPONENT_CAR_ID, o);
      host.step();

      // Guest predicts the same inputs locally...
      guest.setCarInput(PLAYER_CAR_ID, p);
      guest.setCarInput(OPPONENT_CAR_ID, o);
      guest.step();

      // ...and the host's authoritative snapshot lands every few ticks.
      if (t % SNAPSHOT_EVERY === 0) {
        guest.applyWorldSnapshot(host.getWorldSnapshot());
        worstAfterCorrection = Math.max(worstAfterCorrection, maxCarError(guest, host));
      }
    }

    // After each correction the guest is essentially on top of the host —
    // no runaway divergence, no desync, ever.
    expect(worstAfterCorrection).toBeLessThan(1e-4);
    host.dispose();
    guest.dispose();
  }, 60_000);

  it("rewind + replay reconstructs the guest's present from an OLD snapshot (S5 anti-lag reconciliation)", async () => {
    // The runtime never applies a snapshot as-is (that would yank the world
    // ~RTT into the past every 33ms — perceived lag): it rewinds to the
    // snapshot's tick and replays the buffered inputs forward. This test
    // proves the replay path lands the guest on the host's CURRENT state,
    // not its delayed one.
    const host = await boot();
    for (let t = 0; t < 300; t += 1) {
      host.setCarInput(PLAYER_CAR_ID, drive(t));
      host.setCarInput(OPPONENT_CAR_ID, drive(t + 13));
      host.step();
    }
    const delayedSnapshot = host.getWorldSnapshot(); // host tick 300 — "the past"
    // Host keeps simulating 8 more ticks while the snapshot is "in flight".
    for (let t = 300; t < 308; t += 1) {
      host.setCarInput(PLAYER_CAR_ID, drive(t));
      host.setCarInput(OPPONENT_CAR_ID, drive(t + 13));
      host.step();
    }

    // Guest: apply the old snapshot, then REPLAY the 8 known input ticks.
    const guest = await boot();
    guest.applyWorldSnapshot(delayedSnapshot);
    for (let t = 300; t < 308; t += 1) {
      guest.setCarInput(PLAYER_CAR_ID, drive(t));
      guest.setCarInput(OPPONENT_CAR_ID, drive(t + 13));
      guest.step();
    }

    // The guest's present == the host's present, even though the snapshot it
    // received was 8 ticks stale. Tolerance is millimetres (quaternion
    // renormalisation noise amplified through 8 contact-heavy steps, and
    // re-corrected by the next snapshot anyway) — a broken replay would be
    // off by metres, the full 8 ticks of motion.
    expect(maxCarError(guest, host)).toBeLessThan(0.01);
    const hostBall = host.getBallState().position;
    const guestBall = guest.getBallState().position;
    expect(Math.hypot(hostBall.x - guestBall.x, hostBall.y - guestBall.y, hostBall.z - guestBall.z)).toBeLessThan(0.01);

    host.dispose();
    guest.dispose();
  }, 60_000);
});
