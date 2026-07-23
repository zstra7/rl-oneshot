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
