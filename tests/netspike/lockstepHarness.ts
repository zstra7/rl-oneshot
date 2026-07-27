import { OPPONENT_CAR_ID, PLAYER_CAR_ID } from "@/game-flow/MatchFlowConstants";
import { DEFAULT_LOCKSTEP_CONFIG, LockstepSession } from "@/netcode/LockstepSession";
import { fnv1a32 } from "@/netcode/protocol";
import { createFakeNetwork, type FakeNetworkConfig } from "@/netcode/testing/FakeLink";
import { PhysicsFacade } from "@/physics/PhysicsFacade";
import type { CarInput } from "@/physics/PhysicsTypes";

import { makeInputScript } from "./inputScript";

export interface LockstepMatchResult {
  hashA: string;
  hashB: string;
  simulatedTicksA: number;
  simulatedTicksB: number;
  statusA: string;
  statusB: string;
  desyncTickA: number | null;
  desyncTickB: number | null;
  statsA: ReturnType<LockstepSession["getStats"]>;
  statsB: ReturnType<LockstepSession["getStats"]>;
  wallIterations: number;
  completed: boolean;
}

export interface LockstepMatchOptions {
  ticks: number;
  network: FakeNetworkConfig;
  seed?: number;
  inputDelayTicks?: number;
  /** Corrupt one side's applied remote input at this tick, to force a desync. */
  forge?: { atTick: number; side: "A" | "B" };
}

function worldHash(physics: PhysicsFacade): string {
  const world = physics.getWorldState();
  return String(fnv1a32(JSON.stringify({ cars: world.cars, ball: world.ball, boostPads: world.boostPads })));
}

async function bootPhysics(): Promise<PhysicsFacade> {
  const physics = new PhysicsFacade();
  await physics.initialise();
  physics.resetWorld({ carCreationOrder: [PLAYER_CAR_ID, OPPONENT_CAR_ID], kickoffVariantIndex: 0 });
  physics.clearAllInputs();
  return physics;
}

/**
 * N2 driver: runs a full scripted match on two independent PhysicsFacades,
 * each fronted by its own LockstepSession communicating ONLY over an
 * impaired FakeNetwork. Peer A owns the player car and learns the opponent
 * car's inputs over the wire; peer B is the mirror. Both must simulate to
 * bit-identical state. This is the same premise as the WebRTC spike, now
 * exercising the real buffering / delay / redundancy / hash machinery.
 */
export async function runLockstepMatch(options: LockstepMatchOptions): Promise<LockstepMatchResult> {
  const ticks = options.ticks;
  const delay = options.inputDelayTicks ?? DEFAULT_LOCKSTEP_CONFIG.inputDelayTicks;
  const lastTick = ticks - 1;

  const playerScript = makeInputScript(0xc0ffee, ticks);
  const opponentScript = makeInputScript(0xbeef01, ticks);

  const physicsA = await bootPhysics();
  const physicsB = await bootPhysics();
  const net = createFakeNetwork(options.network, options.seed ?? 1);

  const common = {
    redundancyWindow: DEFAULT_LOCKSTEP_CONFIG.redundancyWindow,
    hashIntervalTicks: DEFAULT_LOCKSTEP_CONFIG.hashIntervalTicks,
    inputDelayTicks: delay
  };
  const sessA = new LockstepSession({ ...common, localCarId: PLAYER_CAR_ID, remoteCarId: OPPONENT_CAR_ID, link: net.endpointA });
  const sessB = new LockstepSession({ ...common, localCarId: OPPONENT_CAR_ID, remoteCarId: PLAYER_CAR_ID, link: net.endpointB });

  let simA = 0;
  let simB = 0;
  let sampleA = 0;
  let sampleB = 0;

  const perturb = (input: CarInput): CarInput => ({ ...input, throttle: input.throttle >= 0 ? -1 : 1, jump: !input.jump });

  const advanceSide = (
    physics: PhysicsFacade,
    session: LockstepSession,
    simTick: number,
    localCarId: string,
    remoteCarId: string,
    side: "A" | "B"
  ): number => {
    let tick = simTick;
    while (tick <= lastTick && session.canSimulate(tick)) {
      const localInput = session.localInputForTick(tick);
      let remoteInput = session.remoteInputForTick(tick);
      if (options.forge && options.forge.side === side && options.forge.atTick === tick) {
        remoteInput = perturb(remoteInput);
      }
      physics.setCarInput(localCarId, localInput);
      physics.setCarInput(remoteCarId, remoteInput);
      physics.stepTicks(1);
      session.recordSimulated(tick, worldHash(physics));
      tick += 1;
    }
    return tick;
  };

  const maxWall = (ticks + 200) * 20 + 2000;
  let wall = 0;

  while (
    (simA <= lastTick || simB <= lastTick) &&
    wall < maxWall &&
    sessA.getStatus() !== "desynced" &&
    sessB.getStatus() !== "desynced"
  ) {
    while (sampleA <= simA + delay && sampleA <= lastTick) {
      sessA.submitLocalInput(sampleA, playerScript[sampleA]!);
      sampleA += 1;
    }
    while (sampleB <= simB + delay && sampleB <= lastTick) {
      sessB.submitLocalInput(sampleB, opponentScript[sampleB]!);
      sampleB += 1;
    }

    net.advanceClock(1);
    wall += 1;
    sessA.pump();
    sessB.pump();

    const nextA = advanceSide(physicsA, sessA, simA, PLAYER_CAR_ID, OPPONENT_CAR_ID, "A");
    const nextB = advanceSide(physicsB, sessB, simB, OPPONENT_CAR_ID, PLAYER_CAR_ID, "B");
    if (nextA === simA && simA <= lastTick) {
      sessA.noteStalledFrame();
    }
    if (nextB === simB && simB <= lastTick) {
      sessB.noteStalledFrame();
    }
    simA = nextA;
    simB = nextB;
  }

  const result: LockstepMatchResult = {
    hashA: worldHash(physicsA),
    hashB: worldHash(physicsB),
    simulatedTicksA: simA,
    simulatedTicksB: simB,
    statusA: sessA.getStatus(),
    statusB: sessB.getStatus(),
    desyncTickA: sessA.getDesyncTick(),
    desyncTickB: sessB.getDesyncTick(),
    statsA: sessA.getStats(),
    statsB: sessB.getStats(),
    wallIterations: wall,
    completed: simA > lastTick && simB > lastTick
  };

  physicsA.dispose();
  physicsB.dispose();
  return result;
}
