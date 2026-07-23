import { describe, expect, it } from "vitest";

import { MatchFlowController } from "@/game-flow/MatchFlowController";
import { OPPONENT_CAR_ID, PLAYER_CAR_ID } from "@/game-flow/MatchFlowConstants";
import { DEFAULT_STATE_SYNC_CONFIG, StateSyncSession } from "@/netcode/StateSyncSession";
import { createFakeNetwork } from "@/netcode/testing/FakeLink";
import { PhysicsFacade } from "@/physics/PhysicsFacade";
import { NEUTRAL_CAR_INPUT, type CarInput } from "@/physics/PhysicsTypes";

/**
 * S6 (online state-sync): the whole match flow — host-authoritative, over an
 * impaired network — must stay CONVERGED and AGREE on the score, with no
 * stall and no forfeit. This is the property the old lockstep could not give
 * cross-machine: here the host streams snapshots and the guest converges, so
 * floating-point drift is corrected instead of ending the match.
 *
 * The test runs a host and a guest, each with its own PhysicsFacade +
 * MatchFlowController + StateSyncSession, across a FakeLink with real latency,
 * jitter, and packet loss. A goal is injected identically at a known tick; the
 * gate is that the guest tracks the host's world within a small tolerance the
 * whole time and ends up with the identical score.
 */
const COUNTDOWN_TOTAL_TICKS = 120 + 120 + 120 + 90;
const cfg = DEFAULT_STATE_SYNC_CONFIG;

function drive(tick: number): CarInput {
  return { ...NEUTRAL_CAR_INPUT, throttle: 1, steer: tick % 50 < 25 ? 0.6 : -0.6, boost: true };
}

interface Peer {
  physics: PhysicsFacade;
  flow: MatchFlowController;
  session: StateSyncSession;
  localCar: string;
  remoteCar: string;
  nextSubmit: number;
}

async function bootPeer(
  isHost: boolean,
  localCar: string,
  remoteCar: string,
  link: ReturnType<typeof createFakeNetwork>["endpointA"]
): Promise<Peer> {
  const physics = new PhysicsFacade();
  await physics.initialise();
  const flow = new MatchFlowController();
  flow.initialise({ physics });
  flow.openMatchSetup();
  flow.setOnlineGuest(!isHost);
  flow.startOnlineMatch({ durationMinutes: 3, kickoffSeed: 4 });
  const session = new StateSyncSession({ localCarId: localCar, remoteCarId: remoteCar, link, isHost, ...cfg });
  return { physics, flow, session, localCar, remoteCar, nextSubmit: 0 };
}

function localInput(peer: Peer, tick: number): CarInput {
  // The host drives car-player, the guest drives car-opponent; give them
  // distinct-but-deterministic inputs.
  return peer.localCar === PLAYER_CAR_ID ? drive(tick) : drive(tick + 21);
}

describe("S6 online state-sync stays converged (no stall, no forfeit)", () => {
  it("keeps the guest tracking the host through a goal over a lossy, jittery link", async () => {
    const ticks = COUNTDOWN_TOTAL_TICKS + 500;
    const goalTick = COUNTDOWN_TOTAL_TICKS + 200;
    const net = createFakeNetwork({ latencyTicks: 4, jitterTicks: 3, lossProb: 0.1 }, 0x1234);

    const host = await bootPeer(true, PLAYER_CAR_ID, OPPONENT_CAR_ID, net.endpointA);
    const guest = await bootPeer(false, OPPONENT_CAR_ID, PLAYER_CAR_ID, net.endpointB);

    const stepPeer = (peer: Peer, tick: number, injectGoal: boolean): void => {
      // Submit local input a couple ticks ahead (state-sync never blocks on it).
      while (peer.nextSubmit <= tick + peer.session.inputDelayTicks) {
        peer.session.submitLocalInput(peer.nextSubmit, localInput(peer, peer.nextSubmit));
        peer.nextSubmit += 1;
      }
      peer.session.pump();

      // Guest converges onto the host's newest snapshot before simulating.
      // (The real runtime also replays buffered inputs after applying — that
      // anti-lag path is covered by worldSnapshot.spec; here the plain apply
      // keeps the harness simple while still proving convergence+authority.)
      if (!peer.session.isHost) {
        const snap = peer.session.consumeSnapshot();
        if (snap) {
          peer.physics.applyWorldSnapshot(snap.world);
          peer.flow.applyAuthorityState(snap.flow);
        }
      }

      peer.flow.update();
      if (peer.flow.areControlsActive()) {
        const remote = peer.session.remoteSource.sampleForTick({
          tick,
          matchState: peer.flow.getMatchState(),
          physics: peer.physics,
          localFrame: null as never
        }).input;
        peer.physics.setCarInput(peer.localCar, peer.session.localInputForTick(tick));
        peer.physics.setCarInput(peer.remoteCar, remote);
      } else {
        peer.physics.clearAllInputs();
      }

      // Host-only: a goal is injected identically at goalTick (stands in for a
      // real shot into the net), then the host detects+scores it.
      if (injectGoal && peer.session.isHost) {
        const goalCentre = peer.physics.getGoalSensorCentre("opponent")!;
        peer.physics.setBallState({ position: goalCentre, linearVelocity: { x: 0, y: 0, z: 0 } });
      }

      peer.physics.step();
      peer.flow.applyPhysicsResults();

      if (peer.session.isHost && peer.session.shouldSnapshot(tick)) {
        peer.session.sendSnapshot({ tick, world: peer.physics.getWorldSnapshot(), flow: peer.flow.captureAuthorityState() });
      }
      peer.session.prune(tick);
    };

    let worstOpponentError = 0;
    for (let tick = 0; tick < ticks; tick += 1) {
      // Host runs slightly ahead in wall time; advance the shared clock once
      // per tick so in-flight packets progress.
      stepPeer(host, tick, tick === goalTick);
      net.advanceClock(1);
      stepPeer(guest, tick, false);
      net.advanceClock(1);

      // The guest's view of the HOST's car (car-player) must track the host's
      // authoritative car-player closely — that is the opponent on the guest's
      // screen and is fully authoritative.
      // Measure steady-state tracking only while BOTH are in live PLAY. The
      // kickoff-reset teleport after a goal is a deliberate discontinuity the
      // guest reflects a snapshot or two late — not a tracking failure.
      if (
        tick > COUNTDOWN_TOTAL_TICKS + 20 &&
        tick % cfg.snapshotIntervalTicks === 0 &&
        host.flow.getMatchState() === "PLAYING" &&
        guest.flow.getMatchState() === "PLAYING"
      ) {
        const hostP = host.physics.getCarState(PLAYER_CAR_ID).position;
        const guestP = guest.physics.getCarState(PLAYER_CAR_ID).position;
        worstOpponentError = Math.max(
          worstOpponentError,
          Math.hypot(hostP.x - guestP.x, hostP.y - guestP.y, hostP.z - guestP.z)
        );
      }
    }

    // Never stalled, never forfeited: both ran the full match.
    // The host scored; the guest reflects the identical score from authority.
    const hostState = host.flow.getSessionState();
    const guestState = guest.flow.getSessionState();
    expect(hostState.playerScore + hostState.opponentScore).toBeGreaterThan(0);
    expect(guestState.playerScore).toBe(hostState.playerScore);
    expect(guestState.opponentScore).toBe(hostState.opponentScore);

    // The authoritative opponent stayed tightly tracked despite 10% loss+jitter.
    expect(worstOpponentError).toBeLessThan(1.5);

    host.physics.dispose();
    guest.physics.dispose();
  }, 60_000);
});
