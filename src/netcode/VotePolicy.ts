/**
 * P3 (plan/ONLINE_POLISH_PLAN.md): pure decision policy for the online
 * pause/resume vote. ESC opens a personal overlay per player and the sim
 * keeps running; only when BOTH players hold an active "pause request" vote
 * does the match actually pause, and only when both hold an active
 * "continue" vote does it resume. Both peers can compute these
 * symmetrically (votes are exchanged peer-to-peer over the same channel as
 * everything else) — only the HOST is allowed to act on the decision (call
 * `MatchFlowController.pauseMatch()`/`resumeMatch()`); the guest mirrors the
 * resulting match-state transition from the host's authoritative snapshot.
 */
export function shouldPause(localRequest: boolean, remoteRequest: boolean, isPaused: boolean): boolean {
  return !isPaused && localRequest && remoteRequest;
}

export function shouldResume(localContinueYes: boolean, remoteContinueYes: boolean, isPaused: boolean): boolean {
  return isPaused && localContinueYes && remoteContinueYes;
}

/**
 * P4.3: same shape for the results-screen REMATCH vote — only fires once
 * both peers hold the vote AND the match has actually reached MATCH_RESULTS
 * (guards against a stale vote from a previous match/phase deciding anything).
 */
export function shouldRematch(localRematchYes: boolean, remoteRematchYes: boolean, atMatchResults: boolean): boolean {
  return atMatchResults && localRematchYes && remoteRematchYes;
}

export interface PauseEdge {
  /** The match just went paused this frame (both voted pause). */
  readonly justPaused: boolean;
  /** The match just resumed this frame (both voted continue) — close the overlay on BOTH peers here. */
  readonly justResumed: boolean;
}

/**
 * P3: the pause/resume EDGE between the previous frame's paused state and the
 * current one. The subtlety that caused a bug: on the GUEST the resume is
 * applied by mirroring the host's snapshot, so `nowPaused` MUST be sampled
 * AFTER that mirror — sampling it before (as the old code did, inside the
 * host-only vote decision) meant the guest never saw `justResumed` and stayed
 * stuck in its pause overlay. Keeping the edge pure makes that ordering
 * explicit and testable.
 */
export function computePauseEdge(wasPaused: boolean, nowPaused: boolean): PauseEdge {
  return { justPaused: !wasPaused && nowPaused, justResumed: wasPaused && !nowPaused };
}
