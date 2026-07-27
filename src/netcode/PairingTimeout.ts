/**
 * Guards the matched -> room-joined handoff.
 *
 * Quick match hands both players a room code and expects them to reconnect
 * to that room within a second or two. If the other player closes their tab
 * in that window they never take a room slot — so no `peer-left` is ever
 * emitted (the room only reports a peer LEAVING, and this one never
 * arrived), and the surviving player sits on "CONNECTING…" forever with
 * only a CANCEL button. The server prunes dead sockets before pairing, but
 * a socket can still die in the window between that check and the send, so
 * the client needs its own backstop.
 *
 * Deliberately scoped to quick match only:
 *  - "create" legitimately waits indefinitely (that IS the feature — you're
 *    holding a room open for a friend).
 *  - "join" by code also legitimately waits: a friend can paste you a code
 *    and you may well arrive before they finish creating the room.
 * Only quick match has a server-side guarantee that a partner was already
 * matched, which is what makes a timeout there meaningful rather than
 * arbitrary.
 */
export type OnlineIntent = "create" | "join" | "quick";

export type PairingTimeoutAction =
  /** Silently return to the matchmaking queue; `attempt` is 1-based. */
  | { readonly kind: "requeue"; readonly attempt: number }
  /** Out of retries — surface an error rather than loop forever. */
  | { readonly kind: "give-up" };

/** How long to wait, after landing in a room, for the other peer to actually show up. */
export const PAIRING_TIMEOUT_MS = 12_000;

/** Requeue at most this many times before giving up, so a broken server can't spin forever. */
export const MAX_QUICK_MATCH_REQUEUES = 2;

/**
 * What to do when the pairing timer fires. Returns null when the timer
 * should never have been armed for this intent (create/join wait forever).
 */
export function resolvePairingTimeout(
  intent: OnlineIntent,
  requeuesSoFar: number,
  maxRequeues: number = MAX_QUICK_MATCH_REQUEUES
): PairingTimeoutAction | null {
  if (intent !== "quick") {
    return null;
  }
  if (requeuesSoFar >= maxRequeues) {
    return { kind: "give-up" };
  }
  return { kind: "requeue", attempt: requeuesSoFar + 1 };
}

/** Whether a pairing timeout should be armed at all for this intent. */
export function shouldArmPairingTimeout(intent: OnlineIntent | null): boolean {
  return intent === "quick";
}
