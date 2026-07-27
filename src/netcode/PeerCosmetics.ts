import { sanitizeNickname } from "@/netcode/Nickname";

/**
 * P2.2 (plan/ONLINE_POLISH_PLAN.md): the shape carried in the lobby
 * handshake's opaque `payload` (see lobbyProtocol.ts) — a peer's nickname
 * and car cosmetics, relayed verbatim by the control plane. This is the
 * ONLY place a remote peer's payload is ever read; every field is validated
 * with a safe fallback, since the payload is attacker-controlled (a hostile
 * or buggy client could send anything).
 */
export interface PeerHandshakePayload {
  readonly name: string;
  readonly bodyColor: string;
  readonly boostColor: string;
}

export interface ParsedPeerCosmetics {
  readonly name: string;
  readonly bodyColor: string | null;
  readonly boostColor: string | null;
}

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

function parseColor(value: unknown): string | null {
  return typeof value === "string" && HEX_COLOR_PATTERN.test(value) ? value : null;
}

/** Build this client's handshake payload from its own settings. */
export function buildHandshakePayload(nickname: string, bodyColor: string, boostColor: string): PeerHandshakePayload {
  return { name: sanitizeNickname(nickname), bodyColor, boostColor };
}

/**
 * Parse an arbitrary (attacker-controlled) handshake payload into safe
 * cosmetics. `payload` is `unknown` because it arrives as opaque JSON from
 * the control plane — never assume its shape.
 */
export function parsePeerPayload(payload: unknown): ParsedPeerCosmetics {
  if (typeof payload !== "object" || payload === null) {
    return { name: sanitizeNickname(undefined), bodyColor: null, boostColor: null };
  }
  const record = payload as Record<string, unknown>;
  return {
    name: sanitizeNickname(record["name"]),
    bodyColor: parseColor(record["bodyColor"]),
    boostColor: parseColor(record["boostColor"])
  };
}
