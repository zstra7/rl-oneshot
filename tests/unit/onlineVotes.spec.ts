import { describe, expect, it } from "vitest";

import { PLAYER_CAR_ID, OPPONENT_CAR_ID } from "@/game-flow/MatchFlowConstants";
import { MatchFlowController } from "@/game-flow/MatchFlowController";
import { DEFAULT_STATE_SYNC_CONFIG, StateSyncSession } from "@/netcode/StateSyncSession";
import { createFakeNetwork } from "@/netcode/testing/FakeLink";
import { PacketType, VoteKind, decodePacket, encodeVotePacket } from "@/netcode/protocol";
import { shouldPause, shouldRematch, shouldResume } from "@/netcode/VotePolicy";
import { PhysicsFacade } from "@/physics/PhysicsFacade";

const cfg = DEFAULT_STATE_SYNC_CONFIG;

function makeClock(msPerTick: number) {
  let ticks = 0;
  return { now: () => ticks * msPerTick, advance: (n: number) => { ticks += n; } };
}

describe("P3 Vote packet codec", () => {
  it("round-trips every vote kind", () => {
    for (const kind of [VoteKind.PauseRequest, VoteKind.ContinueYes, VoteKind.RematchYes]) {
      const decoded = decodePacket(encodeVotePacket(kind));
      expect(decoded).toEqual({ type: PacketType.Vote, kind });
    }
  });

  it("rejects a malformed vote packet (wrong length or unknown kind) rather than throwing", () => {
    expect(decodePacket(new Uint8Array([PacketType.Vote]))).toBeNull();
    expect(decodePacket(new Uint8Array([PacketType.Vote, 0]))).toBeNull();
    expect(decodePacket(new Uint8Array([PacketType.Vote, 99]))).toBeNull();
    expect(decodePacket(new Uint8Array([PacketType.Vote, 1, 2]))).toBeNull();
  });
});

describe("P3 VotePolicy (pure pause/resume decision)", () => {
  it("shouldPause is true only when both hold the vote and the match isn't already paused", () => {
    expect(shouldPause(true, true, false)).toBe(true);
    expect(shouldPause(true, false, false)).toBe(false);
    expect(shouldPause(false, true, false)).toBe(false);
    expect(shouldPause(false, false, false)).toBe(false);
    expect(shouldPause(true, true, true)).toBe(false); // already paused
  });

  it("shouldResume is true only when both hold continue-yes and the match IS paused", () => {
    expect(shouldResume(true, true, true)).toBe(true);
    expect(shouldResume(true, false, true)).toBe(false);
    expect(shouldResume(false, true, true)).toBe(false);
    expect(shouldResume(true, true, false)).toBe(false); // not paused
  });

  it("shouldRematch (P4.3) is true only when both hold the vote AND the match is at MATCH_RESULTS", () => {
    expect(shouldRematch(true, true, true)).toBe(true);
    expect(shouldRematch(true, false, true)).toBe(false);
    expect(shouldRematch(false, true, true)).toBe(false);
    expect(shouldRematch(true, true, false)).toBe(false); // not at results yet (or a stale vote from a prior phase)
  });
});

describe("P3 StateSyncSession votes", () => {
  it("a held vote is re-sent and the remote sees it as active; it decays after the sender stops", () => {
    const clock = makeClock(50); // 50ms per tick
    const net = createFakeNetwork({ latencyTicks: 1 }, 11);
    const host = new StateSyncSession({
      localCarId: PLAYER_CAR_ID, remoteCarId: OPPONENT_CAR_ID, link: net.endpointA, isHost: true, now: clock.now, ...cfg
    });
    const guest = new StateSyncSession({
      localCarId: OPPONENT_CAR_ID, remoteCarId: PLAYER_CAR_ID, link: net.endpointB, isHost: false, now: clock.now, ...cfg
    });

    guest.setLocalVote(VoteKind.PauseRequest, true);
    expect(guest.hasLocalVote(VoteKind.PauseRequest)).toBe(true);
    expect(host.getRemoteVote(VoteKind.PauseRequest)).toBe(false); // nothing sent yet

    // Drive several resend intervals so the vote is actually transmitted and received.
    for (let i = 0; i < 40; i += 1) {
      guest.maintainVotes();
      clock.advance(5); // 250ms of wall time total, several resend intervals
      net.advanceClock(5);
      host.pump();
    }
    expect(host.getRemoteVote(VoteKind.PauseRequest)).toBe(true);

    // Guest releases the vote and stops re-sending; after the timeout window
    // with no further packets, the host sees it decay to inactive.
    guest.setLocalVote(VoteKind.PauseRequest, false);
    for (let i = 0; i < 30; i += 1) {
      clock.advance(5);
      net.advanceClock(5);
      host.pump();
    }
    expect(host.getRemoteVote(VoteKind.PauseRequest)).toBe(false);
  });

  it("hasLocalVote/getRemoteVote are independent per kind", () => {
    const clock = makeClock(50);
    const net = createFakeNetwork({ latencyTicks: 1 }, 12);
    const host = new StateSyncSession({
      localCarId: PLAYER_CAR_ID, remoteCarId: OPPONENT_CAR_ID, link: net.endpointA, isHost: true, now: clock.now, ...cfg
    });
    host.setLocalVote(VoteKind.PauseRequest, true);
    expect(host.hasLocalVote(VoteKind.PauseRequest)).toBe(true);
    expect(host.hasLocalVote(VoteKind.ContinueYes)).toBe(false);
  });
});

describe("P3 pause/resume integration: host decides, guest mirrors, state is preserved", () => {
  it("pauses only once both peers request, resumes only once both vote continue, and score/clock survive the pause", async () => {
    const net = createFakeNetwork({ latencyTicks: 2 }, 21);
    const clock = makeClock(50);

    const hostPhysics = new PhysicsFacade();
    await hostPhysics.initialise();
    const hostFlow = new MatchFlowController();
    hostFlow.initialise({ physics: hostPhysics });
    hostFlow.openMatchSetup();
    hostFlow.setOnlineGuest(false);
    hostFlow.startOnlineMatch({ durationMinutes: 3, kickoffSeed: 1 });
    const hostSession = new StateSyncSession({
      localCarId: PLAYER_CAR_ID, remoteCarId: OPPONENT_CAR_ID, link: net.endpointA, isHost: true, now: clock.now, ...cfg
    });

    const guestPhysics = new PhysicsFacade();
    await guestPhysics.initialise();
    const guestFlow = new MatchFlowController();
    guestFlow.initialise({ physics: guestPhysics });
    guestFlow.openMatchSetup();
    guestFlow.setOnlineGuest(true);
    guestFlow.startOnlineMatch({ durationMinutes: 3, kickoffSeed: 1 });
    const guestSession = new StateSyncSession({
      localCarId: OPPONENT_CAR_ID, remoteCarId: PLAYER_CAR_ID, link: net.endpointB, isHost: false, now: clock.now, ...cfg
    });

    // Fast-forward both flows to PLAYING with a nonzero score, mirroring a
    // real match having been underway before anyone paused.
    for (let i = 0; i < 500; i += 1) {
      hostFlow.update();
      hostPhysics.step();
      hostFlow.applyPhysicsResults();
    }
    // Force a score so we can assert it survives the pause round-trip.
    (hostFlow as unknown as { playerScore: number }).playerScore = 2;
    (hostFlow as unknown as { opponentScore: number }).opponentScore = 1;
    const scoreBefore = hostFlow.getSessionState().playerScore + hostFlow.getSessionState().opponentScore;

    let syncTick = 0;
    const syncGuestFromHost = (): void => {
      syncTick += 1;
      hostSession.sendSnapshot({ tick: syncTick, world: hostPhysics.getWorldSnapshot(), flow: hostFlow.captureAuthorityState() });
      net.advanceClock(3);
      guestSession.pump();
      const snap = guestSession.consumeSnapshot();
      if (snap) {
        guestFlow.applyAuthorityState(snap.flow);
      }
    };
    syncGuestFromHost();
    expect(guestFlow.getMatchState()).toBe("PLAYING");

    // Only the HOST requests pause: nothing happens.
    hostSession.setLocalVote(VoteKind.PauseRequest, true);
    expect(shouldPause(hostSession.hasLocalVote(VoteKind.PauseRequest), hostSession.getRemoteVote(VoteKind.PauseRequest), hostFlow.isPaused())).toBe(false);
    expect(hostFlow.getMatchState()).toBe("PLAYING");

    // Guest also requests pause -> votes exchanged over the wire -> host decides to pause.
    guestSession.setLocalVote(VoteKind.PauseRequest, true);
    for (let i = 0; i < 5; i += 1) {
      hostSession.maintainVotes();
      guestSession.maintainVotes();
      clock.advance(5); // 250ms of wall time, past the 200ms resend interval each iteration
      net.advanceClock(2);
      hostSession.pump();
      guestSession.pump();
    }
    expect(hostSession.getRemoteVote(VoteKind.PauseRequest)).toBe(true);
    expect(
      shouldPause(hostSession.hasLocalVote(VoteKind.PauseRequest), hostSession.getRemoteVote(VoteKind.PauseRequest), hostFlow.isPaused())
    ).toBe(true);
    hostFlow.pause();
    expect(hostFlow.getMatchState()).toBe("PAUSED");

    syncGuestFromHost();
    expect(guestFlow.getMatchState()).toBe("PAUSED");
    // Score is preserved across the pause on both sides.
    expect(hostFlow.getSessionState().playerScore + hostFlow.getSessionState().opponentScore).toBe(scoreBefore);
    expect(guestFlow.getSessionState().playerScore + guestFlow.getSessionState().opponentScore).toBe(scoreBefore);

    // Only guest votes continue: nothing happens yet.
    guestSession.setLocalVote(VoteKind.ContinueYes, true);
    expect(
      shouldResume(hostSession.hasLocalVote(VoteKind.ContinueYes), hostSession.getRemoteVote(VoteKind.ContinueYes), hostFlow.isPaused())
    ).toBe(false);

    // Host votes continue too -> both sides agree -> host resumes.
    hostSession.setLocalVote(VoteKind.ContinueYes, true);
    for (let i = 0; i < 5; i += 1) {
      hostSession.maintainVotes();
      guestSession.maintainVotes();
      clock.advance(5); // 250ms of wall time, past the 200ms resend interval each iteration
      net.advanceClock(2);
      hostSession.pump();
      guestSession.pump();
    }
    expect(
      shouldResume(hostSession.hasLocalVote(VoteKind.ContinueYes), hostSession.getRemoteVote(VoteKind.ContinueYes), hostFlow.isPaused())
    ).toBe(true);
    hostFlow.resume();
    expect(hostFlow.getMatchState()).toBe("PLAYING");

    syncGuestFromHost();
    expect(guestFlow.getMatchState()).toBe("PLAYING");
    expect(hostFlow.getSessionState().playerScore + hostFlow.getSessionState().opponentScore).toBe(scoreBefore);
    expect(guestFlow.getSessionState().playerScore + guestFlow.getSessionState().opponentScore).toBe(scoreBefore);

    hostPhysics.dispose();
    guestPhysics.dispose();
  });
});

describe("P4.3 rematch: both vote at MATCH_RESULTS -> host restarts -> guest mirrors the reset", () => {
  it("resets both peers' score to 0-0 and moves them into a fresh kickoff sequence", async () => {
    const net = createFakeNetwork({ latencyTicks: 2 }, 22);
    const clock = makeClock(50);

    const hostPhysics = new PhysicsFacade();
    await hostPhysics.initialise();
    const hostFlow = new MatchFlowController();
    hostFlow.initialise({ physics: hostPhysics });
    hostFlow.openMatchSetup();
    hostFlow.setOnlineGuest(false);
    hostFlow.startOnlineMatch({ durationMinutes: 3, kickoffSeed: 1 });
    const hostSession = new StateSyncSession({
      localCarId: PLAYER_CAR_ID, remoteCarId: OPPONENT_CAR_ID, link: net.endpointA, isHost: true, now: clock.now, ...cfg
    });

    const guestPhysics = new PhysicsFacade();
    await guestPhysics.initialise();
    const guestFlow = new MatchFlowController();
    guestFlow.initialise({ physics: guestPhysics });
    guestFlow.openMatchSetup();
    guestFlow.setOnlineGuest(true);
    guestFlow.startOnlineMatch({ durationMinutes: 3, kickoffSeed: 1 });
    const guestSession = new StateSyncSession({
      localCarId: OPPONENT_CAR_ID, remoteCarId: PLAYER_CAR_ID, link: net.endpointB, isHost: false, now: clock.now, ...cfg
    });

    let syncTick = 0;
    const syncGuestFromHost = (): void => {
      syncTick += 1;
      hostSession.sendSnapshot({ tick: syncTick, world: hostPhysics.getWorldSnapshot(), flow: hostFlow.captureAuthorityState() });
      net.advanceClock(3);
      guestSession.pump();
      const snap = guestSession.consumeSnapshot();
      if (snap) {
        guestFlow.applyAuthorityState(snap.flow);
      }
    };

    // Force a forfeit-free finish (a real clock-expiry win, out of scope for
    // this unit test) directly to MATCH_RESULTS with a nonzero score, and
    // mirror that to the guest — exactly the state both peers are in when
    // the results screen with the REMATCH vote is showing.
    (hostFlow as unknown as { playerScore: number }).playerScore = 3;
    (hostFlow as unknown as { opponentScore: number }).opponentScore = 1;
    (hostFlow as unknown as { winner: string | null }).winner = "player";
    (hostFlow as unknown as { setMatchState: (next: string) => void }).setMatchState("MATCH_RESULTS");
    syncGuestFromHost();
    expect(guestFlow.getMatchState()).toBe("MATCH_RESULTS");
    expect(guestFlow.getSessionState().playerScore).toBe(3);

    // Only the guest votes rematch: nothing happens yet.
    guestSession.setLocalVote(VoteKind.RematchYes, true);
    expect(
      shouldRematch(hostSession.hasLocalVote(VoteKind.RematchYes), hostSession.getRemoteVote(VoteKind.RematchYes), hostFlow.getMatchState() === "MATCH_RESULTS")
    ).toBe(false);

    // Host votes too -> exchanged over the wire -> host decides to rematch
    // (mirrors GameRuntime.driveOnlineRematchVotes: host calls
    // startOnlineMatch with the next kickoff seed once both hold the vote).
    hostSession.setLocalVote(VoteKind.RematchYes, true);
    for (let i = 0; i < 5; i += 1) {
      hostSession.maintainVotes();
      guestSession.maintainVotes();
      clock.advance(5);
      net.advanceClock(2);
      hostSession.pump();
      guestSession.pump();
    }
    expect(
      shouldRematch(hostSession.hasLocalVote(VoteKind.RematchYes), hostSession.getRemoteVote(VoteKind.RematchYes), hostFlow.getMatchState() === "MATCH_RESULTS")
    ).toBe(true);
    hostFlow.startOnlineMatch({ durationMinutes: 3, kickoffSeed: 2 });
    expect(hostFlow.getMatchState()).toBe("COUNTDOWN_3");
    expect(hostFlow.getSessionState().playerScore).toBe(0);
    expect(hostFlow.getSessionState().opponentScore).toBe(0);

    // Guest needs no local call — it mirrors the reset from the host's next snapshot.
    syncGuestFromHost();
    expect(guestFlow.getMatchState()).toBe("COUNTDOWN_3");
    expect(guestFlow.getSessionState().playerScore).toBe(0);
    expect(guestFlow.getSessionState().opponentScore).toBe(0);
    expect(guestFlow.getSessionState().winner).toBeNull();

    hostPhysics.dispose();
    guestPhysics.dispose();
  });
});
