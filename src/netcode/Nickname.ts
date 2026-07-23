/**
 * P2.1 (plan/ONLINE_POLISH_PLAN.md): the ONE place a display name is ever
 * sanitized — used both when the local player sets their own nickname in
 * settings AND (via PeerCosmetics.parsePeerPayload) when a name arrives from
 * the remote peer over the handshake. A remote value is never trusted
 * without going through this.
 */
const MAX_NICKNAME_LENGTH = 12;
const FALLBACK_NICKNAME = "PLAYER";
const ALLOWED_CHARS_PATTERN = /[^A-Za-z0-9 _-]/g;
const WHITESPACE_RUN_PATTERN = /\s+/g;

export function sanitizeNickname(raw: unknown): string {
  if (typeof raw !== "string") {
    return FALLBACK_NICKNAME;
  }
  const collapsed = raw.trim().replace(WHITESPACE_RUN_PATTERN, " ");
  const stripped = collapsed.replace(ALLOWED_CHARS_PATTERN, "");
  const truncated = stripped.slice(0, MAX_NICKNAME_LENGTH).trim();
  return truncated.length > 0 ? truncated : FALLBACK_NICKNAME;
}

export { FALLBACK_NICKNAME, MAX_NICKNAME_LENGTH };
