import { otherTeam, type TeamId } from "@/core/TeamTypes";

/**
 * Pure decision logic for leaving an online match, kept out of GameRuntime so
 * it can be exhaustively unit-tested.
 *
 * Leaving is host-authoritative like pause/resume/rematch: a player who wants
 * to leave holds a Forfeit signal (VoteKind.Forfeit, re-sent over the vote
 * channel), and only the HOST enacts the end. This guarantees both clients
 * agree on the outcome — the previous bug was the guest ending locally and
 * then being resurrected by the host's next "still playing" snapshot, so only
 * the host could actually leave.
 */

/** Why the online match ended, for the results screen. null = natural clock/score finish (rematch offered). */
export type OnlineMatchEndReason = "opponent-left" | "you-left" | null;

/**
 * The host's forfeit decision. Whichever side holds the Forfeit signal loses;
 * the other wins. The local side is checked first so that if — through some
 * race — both hold it, the host still resolves deterministically (host leaves,
 * guest wins) rather than flapping. Returns null when nobody is leaving.
 */
export function resolveForfeit(
  hostTeam: TeamId,
  hostHoldsForfeit: boolean,
  guestHoldsForfeit: boolean
): { winner: TeamId; forfeitedBy: TeamId } | null {
  if (hostHoldsForfeit) {
    return { winner: otherTeam(hostTeam), forfeitedBy: hostTeam };
  }
  if (guestHoldsForfeit) {
    return { winner: hostTeam, forfeitedBy: otherTeam(hostTeam) };
  }
  return null;
}

/**
 * The end-reason THIS client shows, derived from the single authoritative
 * `forfeitedBy` (the host's own value, or the guest's mirrored copy from the
 * snapshot) and which team this client drives. One source of truth, so the
 * two screens can never both say "you left".
 */
export function deriveOnlineEndReason(forfeitedBy: TeamId | null, localTeam: TeamId): OnlineMatchEndReason {
  if (forfeitedBy === null) {
    return null;
  }
  return forfeitedBy === localTeam ? "you-left" : "opponent-left";
}
