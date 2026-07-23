import { axisToInt8, int8ToAxis } from "@/netcode/InputQuantize";
import type { CarInput } from "@/physics/PhysicsTypes";
import { isStateSyncSnapshot, type StateSyncSnapshot } from "@/netcode/stateSync";

/**
 * N2 (plan/ONLINE_MULTIPLAYER_PLAN.md, §4.3): the wire format for
 * deterministic lockstep. Everything the two peers exchange rides one
 * unreliable channel, discriminated by a leading 1-byte packet type.
 *
 * Only inputs and periodic state hashes affect the simulation; ping/pong
 * are control-plane. Inputs are the pre-quantized int8 axes (N1) so the
 * value on the wire is exactly the value both peers simulate — decode is
 * lossless with respect to the sender's already-quantized input.
 */
export const enum PacketType {
  Input = 1,
  Hash = 2,
  Ping = 3,
  Pong = 4,
  Snapshot = 5
}

/** Minimal transport contract shared by FakeLink (N2 tests) and PeerLink (N3, real WebRTC). */
export interface NetLink {
  send(bytes: Uint8Array): void;
  /** Drains and returns every packet that has arrived since the last call. */
  receive(): Uint8Array[];
}

export interface InputFrame {
  readonly tick: number;
  readonly input: CarInput;
}

export type DecodedPacket =
  | { readonly type: PacketType.Input; readonly ackTick: number; readonly frames: InputFrame[] }
  | { readonly type: PacketType.Hash; readonly tick: number; readonly hash: number }
  | { readonly type: PacketType.Ping; readonly nonce: number }
  | { readonly type: PacketType.Pong; readonly nonce: number }
  | { readonly type: PacketType.Snapshot; readonly snapshot: StateSyncSnapshot };

const BUTTON_JUMP = 1 << 0;
const BUTTON_BOOST = 1 << 1;
const BUTTON_POWERSLIDE = 1 << 2;

const FRAME_BYTES = 10; // tick(u32) + 5×axis(i8) + buttons(u8)

function encodeButtons(input: CarInput): number {
  return (input.jump ? BUTTON_JUMP : 0) | (input.boost ? BUTTON_BOOST : 0) | (input.powerslide ? BUTTON_POWERSLIDE : 0);
}

function writeFrame(view: DataView, offset: number, frame: InputFrame): void {
  view.setUint32(offset, frame.tick >>> 0, true);
  view.setInt8(offset + 4, axisToInt8(frame.input.throttle));
  view.setInt8(offset + 5, axisToInt8(frame.input.steer));
  view.setInt8(offset + 6, axisToInt8(frame.input.pitch));
  view.setInt8(offset + 7, axisToInt8(frame.input.yaw));
  view.setInt8(offset + 8, axisToInt8(frame.input.roll));
  view.setUint8(offset + 9, encodeButtons(frame.input));
}

function readFrame(view: DataView, offset: number): InputFrame {
  const buttons = view.getUint8(offset + 9);
  return {
    tick: view.getUint32(offset, true),
    input: {
      throttle: int8ToAxis(view.getInt8(offset + 4)),
      steer: int8ToAxis(view.getInt8(offset + 5)),
      pitch: int8ToAxis(view.getInt8(offset + 6)),
      yaw: int8ToAxis(view.getInt8(offset + 7)),
      roll: int8ToAxis(view.getInt8(offset + 8)),
      jump: (buttons & BUTTON_JUMP) !== 0,
      boost: (buttons & BUTTON_BOOST) !== 0,
      powerslide: (buttons & BUTTON_POWERSLIDE) !== 0
    }
  };
}

/** Encode an input packet: an ack of the newest remote tick we hold, plus the redundancy window of our own recent frames. */
export function encodeInputPacket(ackTick: number, frames: readonly InputFrame[]): Uint8Array {
  if (frames.length > 255) {
    throw new RangeError(`input packet frame count ${frames.length} exceeds 255`);
  }
  const bytes = new Uint8Array(6 + frames.length * FRAME_BYTES);
  const view = new DataView(bytes.buffer);
  view.setUint8(0, PacketType.Input);
  view.setUint32(1, ackTick >>> 0, true);
  view.setUint8(5, frames.length);
  let offset = 6;
  for (const frame of frames) {
    writeFrame(view, offset, frame);
    offset += FRAME_BYTES;
  }
  return bytes;
}

export function encodeHashPacket(tick: number, hash: number): Uint8Array {
  const bytes = new Uint8Array(9);
  const view = new DataView(bytes.buffer);
  view.setUint8(0, PacketType.Hash);
  view.setUint32(1, tick >>> 0, true);
  view.setUint32(5, hash >>> 0, true);
  return bytes;
}

export function encodePingPacket(nonce: number): Uint8Array {
  const bytes = new Uint8Array(5);
  const view = new DataView(bytes.buffer);
  view.setUint8(0, PacketType.Ping);
  view.setUint32(1, nonce >>> 0, true);
  return bytes;
}

export function encodePongPacket(nonce: number): Uint8Array {
  const bytes = new Uint8Array(5);
  const view = new DataView(bytes.buffer);
  view.setUint8(0, PacketType.Pong);
  view.setUint32(1, nonce >>> 0, true);
  return bytes;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/**
 * Encode a host-authoritative snapshot: type byte + UTF-8 JSON. JSON (not a
 * packed binary layout) because a snapshot carries ~30 heterogeneous fields
 * per car and the whole point of state-sync is robustness, not squeezing
 * bytes — at 20-30Hz the size is trivial for a DataChannel.
 */
export function encodeSnapshotPacket(snapshot: StateSyncSnapshot): Uint8Array {
  const json = textEncoder.encode(JSON.stringify(snapshot));
  const bytes = new Uint8Array(1 + json.length);
  bytes[0] = PacketType.Snapshot;
  bytes.set(json, 1);
  return bytes;
}

/**
 * Decode any packet, or return null for a malformed/truncated/unknown one
 * — a hostile or corrupt peer must never crash the decoder or be able to
 * inject an out-of-contract packet.
 */
export function decodePacket(bytes: Uint8Array): DecodedPacket | null {
  if (bytes.length < 1) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const type = view.getUint8(0);

  switch (type) {
    case PacketType.Input: {
      if (bytes.length < 6) {
        return null;
      }
      const ackTick = view.getUint32(1, true);
      const frameCount = view.getUint8(5);
      if (bytes.length !== 6 + frameCount * FRAME_BYTES) {
        return null;
      }
      const frames: InputFrame[] = [];
      let offset = 6;
      for (let i = 0; i < frameCount; i += 1) {
        frames.push(readFrame(view, offset));
        offset += FRAME_BYTES;
      }
      return { type: PacketType.Input, ackTick, frames };
    }
    case PacketType.Hash: {
      if (bytes.length !== 9) {
        return null;
      }
      return { type: PacketType.Hash, tick: view.getUint32(1, true), hash: view.getUint32(5, true) };
    }
    case PacketType.Ping: {
      if (bytes.length !== 5) {
        return null;
      }
      return { type: PacketType.Ping, nonce: view.getUint32(1, true) };
    }
    case PacketType.Pong: {
      if (bytes.length !== 5) {
        return null;
      }
      return { type: PacketType.Pong, nonce: view.getUint32(1, true) };
    }
    case PacketType.Snapshot: {
      try {
        const json = textDecoder.decode(bytes.subarray(1));
        const parsed = JSON.parse(json) as unknown;
        if (!isStateSyncSnapshot(parsed)) {
          return null;
        }
        return { type: PacketType.Snapshot, snapshot: parsed };
      } catch {
        return null;
      }
    }
    default:
      return null;
  }
}

/**
 * FNV-1a 32-bit over a string — the desync fingerprint. Kept here (not in
 * a test helper) because the session sends it on the wire; a shared,
 * canonical implementation is exactly the point.
 */
export function fnv1a32(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
