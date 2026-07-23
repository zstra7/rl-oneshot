/**
 * P4.1 (plan/ONLINE_POLISH_PLAN.md): the ONE place a `?room=CODE` deep link
 * is parsed. Matches the alphabet `MultiplayerSession.proposeCode` uses
 * (excludes I/O/0/1 to avoid visual ambiguity in a shared code).
 */
const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const ROOM_CODE_LENGTH = 5;
const ROOM_CODE_PATTERN = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

/**
 * Extract a valid room code from a `location.search` string (e.g.
 * `"?room=ABCDE"`), or null if the `room` param is missing, the wrong
 * length, or contains characters outside the room-code alphabet.
 * Case-insensitive on input — always normalises to uppercase.
 */
export function parseRoomFromSearch(search: string): string | null {
  const raw = new URLSearchParams(search).get("room");
  if (!raw) {
    return null;
  }
  const normalized = raw.trim().toUpperCase();
  return ROOM_CODE_PATTERN.test(normalized) ? normalized : null;
}
