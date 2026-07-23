import type { NetLink } from "@/netcode/protocol";

/**
 * N2 (plan/ONLINE_MULTIPLAYER_PLAN.md): a deterministic, seeded model of
 * an unreliable full-duplex channel between two peers, for exercising the
 * lockstep core under adverse networks without a real WebRTC connection.
 * Impairments (latency, jitter, loss, duplication, reordering) are all
 * driven by one seeded PRNG so a failing matrix case is perfectly
 * reproducible. Time is measured in ticks; the driver calls
 * `advanceClock` to let in-flight packets progress.
 */
export interface FakeNetworkConfig {
  /** Base one-way delay in ticks. */
  readonly latencyTicks?: number;
  /** Uniform ± jitter in ticks added to each packet's delay (can reorder). */
  readonly jitterTicks?: number;
  /** Probability in [0, 1] that a sent packet is dropped. */
  readonly lossProb?: number;
  /** Probability in [0, 1] that a sent packet is delivered twice. */
  readonly dupProb?: number;
}

export interface FakeNetwork {
  readonly endpointA: NetLink;
  readonly endpointB: NetLink;
  advanceClock(ticks?: number): void;
  readonly now: number;
  inFlightCount(): number;
}

interface InFlight {
  arriveAt: number;
  seq: number;
  bytes: Uint8Array;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createFakeNetwork(config: FakeNetworkConfig = {}, seed = 1): FakeNetwork {
  const latency = Math.max(0, config.latencyTicks ?? 0);
  const jitter = Math.max(0, config.jitterTicks ?? 0);
  const lossProb = config.lossProb ?? 0;
  const dupProb = config.dupProb ?? 0;
  const rng = mulberry32(seed);

  let now = 0;
  let seq = 0;

  // Packets in flight toward each endpoint (filled by the OTHER endpoint's send).
  const towardA: InFlight[] = [];
  const towardB: InFlight[] = [];

  function scheduleDelay(): number {
    const j = jitter > 0 ? Math.round((rng() * 2 - 1) * jitter) : 0;
    return Math.max(0, latency + j);
  }

  function enqueue(target: InFlight[], bytes: Uint8Array): void {
    // Always draw loss/jitter/dup in a fixed order so the PRNG stream
    // stays aligned regardless of the outcome of any single decision.
    const lossRoll = rng();
    const delay = scheduleDelay();
    const dupRoll = rng();
    if (lossRoll < lossProb) {
      return;
    }
    target.push({ arriveAt: now + delay, seq: seq++, bytes });
    if (dupRoll < dupProb) {
      const dupDelay = scheduleDelay();
      target.push({ arriveAt: now + dupDelay, seq: seq++, bytes });
    }
  }

  function drainDue(queue: InFlight[]): Uint8Array[] {
    const due: InFlight[] = [];
    for (let i = queue.length - 1; i >= 0; i -= 1) {
      if (queue[i]!.arriveAt <= now) {
        due.push(queue[i]!);
        queue.splice(i, 1);
      }
    }
    due.sort((x, y) => (x.arriveAt !== y.arriveAt ? x.arriveAt - y.arriveAt : x.seq - y.seq));
    return due.map((p) => p.bytes);
  }

  const endpointA: NetLink = {
    send: (bytes) => enqueue(towardB, bytes),
    receive: () => drainDue(towardA)
  };
  const endpointB: NetLink = {
    send: (bytes) => enqueue(towardA, bytes),
    receive: () => drainDue(towardB)
  };

  return {
    endpointA,
    endpointB,
    advanceClock: (ticks = 1) => {
      now += ticks;
    },
    get now() {
      return now;
    },
    inFlightCount: () => towardA.length + towardB.length
  };
}
