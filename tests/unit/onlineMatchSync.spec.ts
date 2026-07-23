import { describe, expect, it } from "vitest";

import { MatchFlowController } from "@/game-flow/MatchFlowController";
import { OPPONENT_CAR_ID, PLAYER_CAR_ID } from "@/game-flow/MatchFlowConstants";
import { DEFAULT_LOCKSTEP_CONFIG, LockstepSession } from "@/netcode/LockstepSession";
import { fnv1a32 } from "@/netcode/protocol";
import { createFakeNetwork } from "@/netcode/testing/FakeLink";
import { PhysicsFacade } from "@/physics/PhysicsFacade";
import type { CarInput } from "@/physics/PhysicsTypes";

import { makeInputScript } from "../netspike/inputScript";

/**
 * N5 (plan/ONLINE_MULTIPLAYER_PLAN.md): the whole online match flow — not
 * just raw physics — must stay in lockstep. Two independent
 * MatchFlowControllers + PhysicsFacades, each fronted by a LockstepSession
 * over an impaired FakeLink, run a full online match through the
 * countdown, a scored goal, the celebration, and the next kickoff. The
 * gate is bit-identical world state on EVERY tick: if goal detection,
 * celebration timing, or the kickoff reset diverged between the two peers,
 * a hash would split.
 */

const COUNTDOWN_TOTAL_TICKS = 120 + 120 + 120 + 90;
const KICKOFF_SEED = 3;

function worldHash(physics: PhysicsFacade): string {
  const w = physics.getWorldState();
  return String(fnv1a32(JSON.stringify({ cars: w.cars, ball: w.ball, boostPads: w.boostPads, tick: w.tick })));
}

interface Peer {
  physics: PhysicsFacade;
  gameFlow: MatchFlowController;
  session: LockstepSession;
  localCar: string;
  remoteCar: string;
  localScript: CarInput[];
}

async function bootPeer(
  localCar: string,
  remoteCar: string,
  link: ReturnType<typeof createFakeNetwork>["endpointA"],
  localScript: CarInput[]
): Promise<Peer> {
  const physics = new PhysicsFacade();
  await physics.initialise();
  const gameFlow = new MatchFlowController();
  gameFlow.initialise({ physics });
  gameFlow.openMatchSetup();
  const session = new LockstepSession({
    localCarId: localCar,
    remoteCarId: remoteCar,
    link,
    inputDelayTicks: DEFAULT_LOCKSTEP_CONFIG.inputDelayTicks,
    redundancyWindow: DEFAULT_LOCKSTEP_CONFIG.redundancyWindow,
    hashIntervalTicks: DEFAULT_LOCKSTEP_CONFIG.hashIntervalTicks
  });
  return { physics, gameFlow, session, localCar, remoteCar, localScript };
}

describe("N5 online match flow stays in lockstep", () => {
  it("two peers run through a goal, celebration, and kickoff bit-identically every tick", async () => {
    const ticks = COUNTDOWN_TOTAL_TICKS + 900; // countdown + play + goal + celebration + next kickoff
    const delay = DEFAULT_LOCKSTEP_CONFIG.inputDelayTicks;
    const playerScript = makeInputScript(0xc0ffee, ticks + delay + 8);
    const opponentScript = makeInputScript(0xbeef01, ticks + delay + 8);
    const goalTick = COUNTDOWN_TOTAL_TICKS + 300;

    const net = createFakeNetwork({ latencyTicks: 5, jitterTicks: 2 }, 0x51);

    const peerA = await bootPeer(PLAYER_CAR_ID, OPPONENT_CAR_ID, net.endpointA, playerScript);
    const peerB = await bootPeer(OPPONENT_CAR_ID, PLAYER_CAR_ID, net.endpointB, opponentScript);

    // Both peers start the online match with the SAME kickoff seed.
    peerA.gameFlow.startOnlineMatch({ durationMinutes: 3, kickoffSeed: KICKOFF_SEED });
    peerB.gameFlow.startOnlineMatch({ durationMinutes: 3, kickoffSeed: KICKOFF_SEED });

    // One lockstep-driven tick on one peer, mirroring GameRuntime.onFixedTick.
    const stepPeer = (peer: Peer, simTick: number, injectGoal: boolean): void => {
      peer.gameFlow.update();
      if (peer.gameFlow.areControlsActive()) {
        peer.physics.setCarInput(peer.localCar, peer.session.localInputForTick(simTick));
        peer.physics.setCarInput(peer.remoteCar, peer.session.remoteInputForTick(simTick));
      } else {
        peer.physics.clearAllInputs();
      }
      // A goal, injected identically on both peers at the same tick (stands
      // in for the ball being scripted into the net) — both must react to
      // it identically.
      if (injectGoal) {
        const goalCentre = peer.physics.getGoalSensorCentre("opponent")!;
        peer.physics.setBallState({ position: goalCentre, linearVelocity: { x: 0, y: 0, z: 0 } });
      }
      peer.physics.step();
      peer.gameFlow.applyPhysicsResults();
      peer.session.recordSimulated(simTick, worldHash(peer.physics));
    };

    // Per-tick hashes, so we compare same-tick states even though the two
    // peers reach a given tick at different wall moments (latency lag).
    const hashesA: string[] = [];
    const hashesB: string[] = [];

    let simA = 0;
    let simB = 0;
    let sampleA = 0;
    let sampleB = 0;
    const lastTick = ticks - 1;
    let wall = 0;
    const maxWall = ticks * 12 + 3000;

    const advance = (peer: Peer, sim: number, hashes: string[]): number => {
      let t = sim;
      while (t <= lastTick && peer.session.canSimulate(t)) {
        stepPeer(peer, t, t === goalTick);
        hashes[t] = worldHash(peer.physics);
        t += 1;
      }
      return t;
    };

    while ((simA <= lastTick || simB <= lastTick) && wall < maxWall) {
      while (sampleA <= simA + delay && sampleA <= lastTick) peerA.session.submitLocalInput(sampleA, playerScript[sampleA]!), (sampleA += 1);
      while (sampleB <= simB + delay && sampleB <= lastTick) peerB.session.submitLocalInput(sampleB, opponentScript[sampleB]!), (sampleB += 1);
      net.advanceClock(1);
      wall += 1;
      peerA.session.pump();
      peerB.session.pump();
      simA = advance(peerA, simA, hashesA);
      simB = advance(peerB, simB, hashesB);
    }

    expect(simA).toBe(ticks);
    expect(simB).toBe(ticks);
    expect(peerA.session.getStatus()).toBe("running");
    expect(peerB.session.getStatus()).toBe("running");

    // Bit-identical on EVERY tick — any divergence in goal detection,
    // celebration timing, or the kickoff reset would split a hash here.
    for (let t = 0; t < ticks; t += 1) {
      expect(hashesA[t], `tick ${t} A vs B`).toBe(hashesB[t]);
    }

    // The match actually progressed through a goal and back into play, and
    // both peers agree on the whole session state.
    const finalState = peerA.gameFlow.getSessionState();
    expect(finalState.playerScore + finalState.opponentScore).toBeGreaterThan(0);
    expect(finalState).toEqual(peerB.gameFlow.getSessionState());

    peerA.physics.dispose();
    peerB.physics.dispose();
  }, 60_000);
});
