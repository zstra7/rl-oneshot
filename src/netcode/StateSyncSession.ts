import { RemoteCarInputSource } from "@/netcode/CarInputSource";
import { quantizeCarInput } from "@/netcode/InputQuantize";
import { recommendDelayTicks, stabilizeDelay } from "@/netcode/AdaptiveDelay";
import {
  PacketType,
  VoteKind,
  decodePacket,
  encodeInputPacket,
  encodePingPacket,
  encodePongPacket,
  encodeSnapshotPacket,
  encodeVotePacket,
  type InputFrame,
  type NetLink
} from "@/netcode/protocol";
import type { StateSyncSnapshot } from "@/netcode/stateSync";
import { NEUTRAL_CAR_INPUT, type CarId, type CarInput } from "@/physics/PhysicsTypes";

/**
 * S3 (online state-sync netcode): the transport core that REPLACES lockstep.
 *
 * It keeps lockstep's one genuinely good idea — exchange only quantised
 * inputs, tick-aligned — but drops the two properties that made real matches
 * fragile: the hard STALL when a remote input hadn't arrived (froze the game
 * under any loss), and the DESYNC FORFEIT when two floating-point sims drifted
 * a hair apart (ended the match cross-machine). In their place:
 *
 *  - Prediction, never stalling. A missing remote input holds the last one
 *    (`RemoteCarInputSource`), so the sim always advances smoothly.
 *  - Host authority, never forfeiting. The room creator ("host") streams a
 *    full world+flow snapshot every few ticks; the "guest" applies it and
 *    converges. Determinism stops being load-bearing — a little drift is
 *    simply corrected, not fatal.
 *
 * This class is transport-only and physics-agnostic (like LockstepSession
 * was): the runtime feeds it local inputs and, on the host, the just-captured
 * snapshot; it hands back the remote car's predicted input and, on the guest,
 * the latest authoritative snapshot to apply.
 */
export interface StateSyncConfig {
  readonly localCarId: CarId;
  readonly remoteCarId: CarId;
  readonly link: NetLink;
  readonly isHost: boolean;
  /** How many ticks ahead of the sim local input is sampled/sent. */
  readonly inputDelayTicks: number;
  /** Each input packet re-sends this many recent frames so one lost packet self-heals. */
  readonly redundancyWindow: number;
  /** Host emits a snapshot every this many simulated ticks. */
  readonly snapshotIntervalTicks: number;
  /** Wall-clock source (ms), injectable for tests. Defaults to performance.now/Date.now. */
  readonly now?: () => number;
}

export const DEFAULT_STATE_SYNC_CONFIG = {
  inputDelayTicks: 2,
  redundancyWindow: 12,
  snapshotIntervalTicks: 4
} as const;

/** P3: how often (ms) an actively-held vote is re-sent, and how long since the last sighting a remote vote stays "active". */
const VOTE_RESEND_INTERVAL_MS = 200;
const VOTE_TIMEOUT_MS = 900;

/** P1.1: send a ping every this many ticks to measure RTT/jitter. */
const PING_INTERVAL_TICKS = 30;
/** P1.1: only re-evaluate the adaptive delay this often (ticks), to avoid thrashing. */
const ADAPT_INTERVAL_TICKS = 600;
/** P1.1: EMA smoothing factor for RTT and jitter samples. */
const RTT_EMA_ALPHA = 0.2;

function defaultNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export class StateSyncSession {
  public readonly remoteSource: RemoteCarInputSource;

  private readonly localBuffer = new Map<number, CarInput>();
  private lastLocalInput: CarInput = { ...NEUTRAL_CAR_INPUT };
  private highestLocalTick = -1;
  private highestRemoteTick = -1;
  /** Guest only: the newest authoritative snapshot the runtime hasn't applied yet. */
  private pendingSnapshot: StateSyncSnapshot | null = null;
  private latestSnapshotTick = -1;

  private readonly now: () => number;
  private currentInputDelayTicks: number;
  private lastPingTick = -PING_INTERVAL_TICKS;
  private lastAdaptTick = -ADAPT_INTERVAL_TICKS;
  private nextPingNonce = 1;
  private readonly pingsSentAt = new Map<number, number>();
  private rttEmaMs: number | null = null;
  private jitterEmaMs = 0;

  /** P3: votes this client currently holds (re-sent on every maintainVotes() while held). */
  private readonly localVotes = new Set<VoteKind>();
  /** P3: wall-clock time each vote kind was last SEEN from the remote peer. */
  private readonly remoteVoteLastSeenMs = new Map<VoteKind, number>();
  private lastVoteSendMs = -Infinity;

  public constructor(private readonly config: StateSyncConfig) {
    this.remoteSource = new RemoteCarInputSource(config.remoteCarId);
    this.now = config.now ?? defaultNow;
    this.currentInputDelayTicks = config.inputDelayTicks;
  }

  public get inputDelayTicks(): number {
    return this.currentInputDelayTicks;
  }

  /** EMA round-trip time in milliseconds, or null before any pong has arrived. */
  public getRttMs(): number | null {
    return this.rttEmaMs;
  }

  /** EMA jitter (absolute deviation from the RTT EMA) in milliseconds. */
  public getJitterMs(): number {
    return this.jitterEmaMs;
  }

  public get isHost(): boolean {
    return this.config.isHost;
  }

  public get snapshotIntervalTicks(): number {
    return this.config.snapshotIntervalTicks;
  }

  public get highestRemoteInputTick(): number {
    return this.highestRemoteTick;
  }

  /**
   * Schedule the local car's input for a future tick and transmit it with the
   * redundancy window (same as lockstep). Unlike lockstep, nothing downstream
   * blocks on the peer having received it.
   */
  public submitLocalInput(tick: number, input: CarInput): void {
    const quantized = quantizeCarInput(input);
    this.localBuffer.set(tick, quantized);
    if (tick > this.highestLocalTick) {
      this.highestLocalTick = tick;
      this.lastLocalInput = quantized;
    }

    const frames: InputFrame[] = [];
    const windowStart = Math.max(0, tick - this.config.redundancyWindow + 1);
    for (let t = windowStart; t <= tick; t += 1) {
      const buffered = this.localBuffer.get(t);
      if (buffered) {
        frames.push({ tick: t, input: buffered });
      }
    }
    this.config.link.send(encodeInputPacket(this.highestRemoteTick, frames));
  }

  /**
   * The local car's input for a tick. If the sim outran the submit-ahead (a
   * catch-up burst after a long frame), predict with the last submitted input
   * rather than throwing — a hitch must never crash the match. The runtime
   * submits generously ahead so this fallback is rare.
   */
  public localInputForTick(tick: number): CarInput {
    return this.localBuffer.get(tick) ?? this.lastLocalInput;
  }

  /** Drain the link and route arrivals. Malformed packets are dropped. */
  public pump(): void {
    for (const bytes of this.config.link.receive()) {
      const packet = decodePacket(bytes);
      if (!packet) {
        continue;
      }
      switch (packet.type) {
        case PacketType.Input:
          for (const frame of packet.frames) {
            this.remoteSource.provideInputForTick(frame.tick, frame.input);
            if (frame.tick > this.highestRemoteTick) {
              this.highestRemoteTick = frame.tick;
            }
          }
          break;
        case PacketType.Snapshot:
          // Only the guest consumes snapshots; the host is authoritative and
          // ignores any it somehow receives. Keep only the newest.
          if (!this.config.isHost && packet.snapshot.tick > this.latestSnapshotTick) {
            this.pendingSnapshot = packet.snapshot;
            this.latestSnapshotTick = packet.snapshot.tick;
          }
          break;
        case PacketType.Ping:
          this.config.link.send(encodePongPacket(packet.nonce));
          break;
        case PacketType.Pong: {
          const sentAt = this.pingsSentAt.get(packet.nonce);
          if (sentAt !== undefined) {
            this.pingsSentAt.delete(packet.nonce);
            const sampleMs = Math.max(0, this.now() - sentAt);
            if (this.rttEmaMs === null) {
              this.rttEmaMs = sampleMs;
              this.jitterEmaMs = 0;
            } else {
              this.jitterEmaMs = this.jitterEmaMs + RTT_EMA_ALPHA * (Math.abs(sampleMs - this.rttEmaMs) - this.jitterEmaMs);
              this.rttEmaMs = this.rttEmaMs + RTT_EMA_ALPHA * (sampleMs - this.rttEmaMs);
            }
          }
          break;
        }
        case PacketType.Vote:
          this.remoteVoteLastSeenMs.set(packet.kind, this.now());
          break;
      }
    }
  }

  /** P3: hold (or release) a vote of the given kind — re-sent every frame while held (see `maintainVotes`). */
  public setLocalVote(kind: VoteKind, active: boolean): void {
    if (active) {
      this.localVotes.add(kind);
    } else {
      this.localVotes.delete(kind);
    }
  }

  /** P3: whether THIS client currently holds a vote of the given kind. */
  public hasLocalVote(kind: VoteKind): boolean {
    return this.localVotes.has(kind);
  }

  /** P3: whether the REMOTE peer's vote of the given kind was seen recently enough to count as still active. */
  public getRemoteVote(kind: VoteKind): boolean {
    const seenAt = this.remoteVoteLastSeenMs.get(kind);
    return seenAt !== undefined && this.now() - seenAt <= VOTE_TIMEOUT_MS;
  }

  /**
   * P3: re-send every currently-held local vote at a fixed wall-clock
   * cadence. Call this every rendered FRAME (not gated on simulated ticks —
   * ticks freeze once the match actually pauses, but votes must still flow
   * to ever reach the "both voted" state that unpauses it).
   */
  public maintainVotes(): void {
    if (this.localVotes.size === 0) {
      return;
    }
    if (this.now() - this.lastVoteSendMs < VOTE_RESEND_INTERVAL_MS) {
      return;
    }
    this.lastVoteSendMs = this.now();
    for (const kind of this.localVotes) {
      this.config.link.send(encodeVotePacket(kind));
    }
  }

  /** Host: transmit an authoritative snapshot to the guest. No-op on the guest. */
  public sendSnapshot(snapshot: StateSyncSnapshot): void {
    if (!this.config.isHost) {
      return;
    }
    this.config.link.send(encodeSnapshotPacket(snapshot));
  }

  /** Whether `tick` is a host snapshot boundary. */
  public shouldSnapshot(tick: number): boolean {
    return this.config.isHost && tick % this.config.snapshotIntervalTicks === 0;
  }

  /**
   * Guest: take the newest authoritative snapshot the host has sent since the
   * last call (or null). The runtime applies it to converge, then clears it by
   * virtue of this consume.
   */
  public consumeSnapshot(): StateSyncSnapshot | null {
    const snapshot = this.pendingSnapshot;
    this.pendingSnapshot = null;
    return snapshot;
  }

  /** Drop local inputs well behind the frontier so the buffer can't grow unbounded. */
  public prune(tick: number): void {
    const pruneBefore = tick - this.config.redundancyWindow * 4;
    if (pruneBefore <= 0) {
      return;
    }
    for (const t of this.localBuffer.keys()) {
      if (t < pruneBefore) {
        this.localBuffer.delete(t);
      }
    }
    this.remoteSource.discardBefore(pruneBefore);
  }

  /**
   * P1.1: per-tick housekeeping — send a periodic ping (for RTT/jitter
   * measurement), re-evaluate the adaptive input delay, and prune old
   * buffers. Call once per simulated tick from the runtime (this folds in
   * what used to be a standalone `prune(tick)` call).
   */
  public onTickHousekeeping(tick: number): void {
    if (tick - this.lastPingTick >= PING_INTERVAL_TICKS) {
      this.lastPingTick = tick;
      const nonce = this.nextPingNonce;
      this.nextPingNonce = (this.nextPingNonce + 1) >>> 0;
      this.pingsSentAt.set(nonce, this.now());
      // Bound the pending-ping map so an entirely lost pong stream can't leak.
      if (this.pingsSentAt.size > 32) {
        const oldest = this.pingsSentAt.keys().next().value;
        if (oldest !== undefined) {
          this.pingsSentAt.delete(oldest);
        }
      }
      this.config.link.send(encodePingPacket(nonce));
    }
    this.maybeAdaptDelay(tick);
    this.prune(tick);
  }

  /**
   * P1.1: adopt a new input delay only every ADAPT_INTERVAL_TICKS and only
   * when it differs meaningfully from the current one (stabilizeDelay's
   * hysteresis) — raising the delay is always safe mid-stream (the submit
   * loop simply samples further ahead); lowering it just waits for the
   * frontier to catch up. No cross-peer coordination is needed because,
   * unlike lockstep, the delay is purely local timing under state-sync.
   */
  private maybeAdaptDelay(tick: number): void {
    if (tick - this.lastAdaptTick < ADAPT_INTERVAL_TICKS) {
      return;
    }
    if (this.rttEmaMs === null) {
      return;
    }
    this.lastAdaptTick = tick;
    const recommended = recommendDelayTicks(this.rttEmaMs, this.jitterEmaMs);
    this.currentInputDelayTicks = stabilizeDelay(this.currentInputDelayTicks, recommended);
  }
}
