import { RemoteCarInputSource } from "@/netcode/CarInputSource";
import { quantizeCarInput } from "@/netcode/InputQuantize";
import {
  PacketType,
  decodePacket,
  encodeHashPacket,
  encodeInputPacket,
  encodePongPacket,
  fnv1a32,
  type InputFrame,
  type NetLink
} from "@/netcode/protocol";
import type { CarId, CarInput } from "@/physics/PhysicsTypes";

export type SessionStatus = "running" | "desynced";

export interface LockstepConfig {
  readonly localCarId: CarId;
  readonly remoteCarId: CarId;
  readonly link: NetLink;
  /**
   * How many ticks ahead of the simulation local input is sampled and
   * scheduled. Both peers apply every car's input on the same tick, so a
   * larger delay tolerates more latency before the sim has to stall.
   */
  readonly inputDelayTicks: number;
  /**
   * Each input packet re-sends this many of the most recent frames, so a
   * lost packet's inputs are recovered by any later packet — loss only
   * stalls the sim when an entire window of consecutive packets is lost.
   */
  readonly redundancyWindow: number;
  /** State-hash desync checkpoints are exchanged on ticks that are multiples of this. */
  readonly hashIntervalTicks: number;
}

export const DEFAULT_LOCKSTEP_CONFIG = {
  inputDelayTicks: 4,
  redundancyWindow: 8,
  hashIntervalTicks: 60
} as const;

/**
 * N2 (plan/ONLINE_MULTIPLAYER_PLAN.md, §4.1): the transport-agnostic core
 * of deterministic lockstep. It owns the two peers' input buffers, sends
 * the local car's inputs (with a redundancy window), receives and buffers
 * the remote car's, gates simulation advance on having both, and runs the
 * periodic state-hash exchange that turns any determinism break into a
 * detected, graceful desync rather than a silent divergence.
 *
 * It is deliberately physics-agnostic: the driver (the N2 test harness, or
 * GameRuntime in N5) owns the actual simulation and feeds this class the
 * scheduled local inputs and, after each simulated tick, a serialized
 * world state to hash. `remoteSource` is the very `RemoteCarInputSource`
 * (N1) that GameRuntime installs in its input-source map, so the remote
 * car is driven from exactly the buffer this session fills.
 */
export class LockstepSession {
  public readonly remoteSource: RemoteCarInputSource;

  private readonly localBuffer = new Map<number, CarInput>();
  private readonly localHashes = new Map<number, number>();
  private readonly remoteHashes = new Map<number, number>();

  private status: SessionStatus = "running";
  private desyncTick: number | null = null;
  private stalledFrames = 0;
  private consecutiveStalls = 0;
  private maxConsecutiveStalls = 0;
  private highestLocalTick = -1;
  private highestRemoteTick = -1;

  public constructor(private readonly config: LockstepConfig) {
    this.remoteSource = new RemoteCarInputSource(config.remoteCarId);
  }

  public get inputDelayTicks(): number {
    return this.config.inputDelayTicks;
  }

  public getStatus(): SessionStatus {
    return this.status;
  }

  public getDesyncTick(): number | null {
    return this.desyncTick;
  }

  public getStats(): {
    stalledFrames: number;
    maxConsecutiveStalls: number;
    highestLocalTick: number;
    highestRemoteTick: number;
  } {
    return {
      stalledFrames: this.stalledFrames,
      maxConsecutiveStalls: this.maxConsecutiveStalls,
      highestLocalTick: this.highestLocalTick,
      highestRemoteTick: this.highestRemoteTick
    };
  }

  /**
   * Schedule the local car's input for a future tick and transmit it with
   * the redundancy window. Called `inputDelayTicks` ahead of the tick the
   * simulation is currently on.
   */
  public submitLocalInput(tick: number, input: CarInput): void {
    // Store and simulate exactly the value the peer will decode off the
    // wire (the int8 grid), so the local sim of this car can never
    // disagree with the peer's sim of the same car. LocalDeviceSource
    // already quantizes, so in production this is idempotent; enforcing it
    // here makes the session correct no matter what the caller passes.
    const quantized = quantizeCarInput(input);
    this.localBuffer.set(tick, quantized);
    if (tick > this.highestLocalTick) {
      this.highestLocalTick = tick;
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

  /** Drain the link and route every arrived packet. Malformed packets are dropped. */
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
        case PacketType.Hash:
          this.remoteHashes.set(packet.tick, packet.hash);
          this.compareHashes(packet.tick);
          break;
        case PacketType.Ping:
          this.config.link.send(encodePongPacket(packet.nonce));
          break;
        case PacketType.Pong:
          // RTT estimation is N7; nothing to do in N2.
          break;
      }
    }
  }

  /** The simulation may advance to `tick` only once both cars' inputs for it are in hand. */
  public canSimulate(tick: number): boolean {
    return this.localBuffer.has(tick) && this.remoteSource.hasInputForTick(tick);
  }

  public localInputForTick(tick: number): CarInput {
    const input = this.localBuffer.get(tick);
    if (!input) {
      throw new Error(`LockstepSession: no local input buffered for tick ${tick}`);
    }
    return input;
  }

  public remoteInputForTick(tick: number): CarInput {
    const input = this.remoteSource.getInputForTick(tick);
    if (!input) {
      throw new Error(`LockstepSession: no remote input buffered for tick ${tick}`);
    }
    return input;
  }

  /**
   * Record that the driver simulated `tick`, passing a serialized world
   * state. On hash-checkpoint ticks this stores and transmits the state
   * fingerprint and compares it against the peer's — a mismatch flips the
   * session to `desynced`. Also prunes buffers that can never be needed
   * again.
   */
  public recordSimulated(tick: number, worldStateJson: string): void {
    this.consecutiveStalls = 0;

    if (tick % this.config.hashIntervalTicks === 0) {
      const hash = fnv1a32(worldStateJson);
      this.localHashes.set(tick, hash);
      this.config.link.send(encodeHashPacket(tick, hash));
      this.compareHashes(tick);
    }

    // Inputs and hashes for ticks well behind the confirmed frontier are
    // never needed again.
    const pruneBefore = tick - this.config.hashIntervalTicks * 2;
    if (pruneBefore > 0) {
      this.remoteSource.discardBefore(pruneBefore);
      for (const t of this.localBuffer.keys()) {
        if (t < pruneBefore) {
          this.localBuffer.delete(t);
        }
      }
    }
  }

  /** Called by the driver on a frame where the simulation could not advance. */
  public noteStalledFrame(): void {
    this.stalledFrames += 1;
    this.consecutiveStalls += 1;
    if (this.consecutiveStalls > this.maxConsecutiveStalls) {
      this.maxConsecutiveStalls = this.consecutiveStalls;
    }
  }

  private compareHashes(tick: number): void {
    if (this.status === "desynced") {
      return;
    }
    const local = this.localHashes.get(tick);
    const remote = this.remoteHashes.get(tick);
    if (local !== undefined && remote !== undefined && local !== remote) {
      this.status = "desynced";
      this.desyncTick = tick;
    }
  }
}
