/**
 * N4 (plan/ONLINE_MULTIPLAYER_PLAN.md): the JSON control-plane protocol
 * spoken over the room WebSocket — room lifecycle, WebRTC signaling relay,
 * matchmaking, and the pre-match handshake. Distinct from the binary
 * lockstep wire codec (`protocol.ts`): that is the peer-to-peer gameplay
 * channel; this is the client↔server control channel.
 *
 * This module is dependency-free (no browser, three, or physics imports)
 * precisely so the Cloudflare Worker (`backend/`) and the game client can
 * both import it — one source of truth for the message shapes and the
 * handshake compatibility rule.
 */

/** Bumped when the control-plane message shapes change incompatibly. */
export const LOBBY_PROTOCOL_VERSION = 1;

/** Unambiguous room-code alphabet: no 0/O/1/I/L to avoid transcription errors. */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 5;

export function generateRoomCode(random: () => number): string {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) {
    code += ROOM_CODE_ALPHABET[Math.floor(random() * ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

export function isValidRoomCode(code: string): boolean {
  if (code.length !== ROOM_CODE_LENGTH) {
    return false;
  }
  for (const char of code) {
    if (!ROOM_CODE_ALPHABET.includes(char)) {
      return false;
    }
  }
  return true;
}

/**
 * The pre-match handshake each peer sends. `buildHash` is the identity of
 * the deterministic simulation build (N0's golden hash) — two clients on
 * incompatible builds would desync, so the server refuses to start the
 * match. `payload` is opaque to the server (car control profile + cosmetics)
 * and relayed verbatim to the other peer.
 */
export interface HandshakeInfo {
  readonly protocolVersion: number;
  readonly buildHash: string;
  readonly payload: unknown;
}

export type HandshakeRejectionReason = "protocol-version-mismatch" | "build-hash-mismatch";

/** Returns the rejection reason if two handshakes are incompatible, or null if they may play together. */
export function checkHandshakeCompatibility(a: HandshakeInfo, b: HandshakeInfo): HandshakeRejectionReason | null {
  if (a.protocolVersion !== b.protocolVersion) {
    return "protocol-version-mismatch";
  }
  if (a.buildHash !== b.buildHash) {
    return "build-hash-mismatch";
  }
  return null;
}

export type PeerRole = "offerer" | "answerer";

export interface MatchPeerInfo {
  readonly id: string;
  readonly role: PeerRole;
  /** The peer's handshake payload (profile + cosmetics), relayed verbatim. */
  readonly payload: unknown;
}

// --- Client → Server ---

export type ClientMessage =
  | { readonly type: "ready"; readonly handshake: HandshakeInfo }
  | { readonly type: "signal"; readonly data: unknown };

// --- Server → Client ---

export type ServerMessage =
  | { readonly type: "room-created"; readonly code: string; readonly selfId: string }
  | { readonly type: "room-joined"; readonly code: string; readonly selfId: string }
  | { readonly type: "peer-joined"; readonly peerId: string; readonly role: PeerRole }
  | { readonly type: "peer-left" }
  | { readonly type: "signal"; readonly data: unknown }
  | { readonly type: "match-start"; readonly kickoffSeed: number; readonly peers: readonly MatchPeerInfo[] }
  | { readonly type: "handshake-rejected"; readonly reason: HandshakeRejectionReason }
  | { readonly type: "queued"; readonly position: number }
  | { readonly type: "matched"; readonly code: string }
  | { readonly type: "error"; readonly reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Parse+validate a client message, returning null for anything malformed. */
export function parseClientMessage(raw: string): ClientMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value) || typeof value["type"] !== "string") {
    return null;
  }
  switch (value["type"]) {
    case "ready": {
      const handshake = value["handshake"];
      if (
        !isRecord(handshake) ||
        typeof handshake["protocolVersion"] !== "number" ||
        typeof handshake["buildHash"] !== "string"
      ) {
        return null;
      }
      return {
        type: "ready",
        handshake: {
          protocolVersion: handshake["protocolVersion"],
          buildHash: handshake["buildHash"],
          payload: handshake["payload"]
        }
      };
    }
    case "signal":
      return { type: "signal", data: value["data"] };
    default:
      return null;
  }
}

/** Parse+validate a server message (client-side), returning null for anything malformed. */
export function parseServerMessage(raw: string): ServerMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value) || typeof value["type"] !== "string") {
    return null;
  }
  // The client trusts its own server, so this is a shape guard, not a
  // security boundary — return the parsed object for known types.
  const known = [
    "room-created",
    "room-joined",
    "peer-joined",
    "peer-left",
    "signal",
    "match-start",
    "handshake-rejected",
    "queued",
    "matched",
    "error"
  ];
  return known.includes(value["type"] as string) ? (value as unknown as ServerMessage) : null;
}

export function encodeMessage(message: ClientMessage | ServerMessage): string {
  return JSON.stringify(message);
}
