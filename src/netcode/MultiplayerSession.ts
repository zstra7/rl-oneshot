import { LobbyClient, type LobbyEvent } from "@/netcode/LobbyClient";
import { LockstepSession } from "@/netcode/LockstepSession";
import { PeerLink, type PeerLinkState } from "@/netcode/PeerLink";
import { DEFAULT_LOCKSTEP_CONFIG } from "@/netcode/LockstepSession";
import { LOBBY_PROTOCOL_VERSION, type HandshakeInfo, type MatchPeerInfo, type PeerRole } from "@/netcode/lobbyProtocol";
import type { SignalingChannel } from "@/netcode/Signaling";
import { OPPONENT_CAR_ID, PLAYER_CAR_ID } from "@/game-flow/MatchFlowConstants";

/**
 * N5 (plan/ONLINE_MULTIPLAYER_PLAN.md): the orchestrator that turns a
 * lobby connection into a running lockstep match. It sequences
 * LobbyClient (N4 control plane) → PeerLink (N3 WebRTC) → LockstepSession
 * (N2), and emits high-level events the game runtime and lobby UI (N6)
 * react to. Every collaborator is created through an injectable factory so
 * the whole sequence is unit-testable without a real network.
 *
 * Flow: connect to a room (create/join/quick-match) → both peers present →
 * open a PeerLink with the assigned role over the lobby's signaling → on
 * DataChannel connect, send the build-hash handshake → on `match-start`,
 * spin up the LockstepSession and hand the runtime everything it needs to
 * begin a synchronized online match.
 */
export type MultiplayerEvent =
  | { readonly type: "queued"; readonly position: number }
  | { readonly type: "room-ready"; readonly code: string; readonly created: boolean }
  | { readonly type: "connecting" }
  | { readonly type: "match-ready"; readonly context: OnlineMatchContext }
  | { readonly type: "handshake-rejected"; readonly reason: string }
  | { readonly type: "disconnected"; readonly reason: string }
  | { readonly type: "error"; readonly reason: string };

export interface OnlineMatchContext {
  readonly session: LockstepSession;
  readonly kickoffSeed: number;
  readonly localCarId: string;
  readonly remoteCarId: string;
  /** The two peers' handshake payloads (profile + cosmetics), for applying to the correct cars. */
  readonly peers: readonly MatchPeerInfo[];
}

export interface MultiplayerSessionConfig {
  /** Control-plane base URL (wss://…). */
  readonly controlUrl: string;
  /** Identity of the deterministic build — both peers must match or the match is refused. */
  readonly buildHash: string;
  /** This client's profile + cosmetics, relayed to the peer verbatim. */
  readonly handshakePayload: unknown;
  readonly onEvent: (event: MultiplayerEvent) => void;
  readonly createLobbyClient?: (onEvent: (event: LobbyEvent) => void) => LobbyClient;
  readonly createPeerLink?: (
    role: PeerRole,
    signaling: SignalingChannel,
    onStateChange: (state: PeerLinkState) => void
  ) => PeerLink;
  readonly iceServers?: RTCIceServer[];
}

export class MultiplayerSession {
  private readonly lobby: LobbyClient;
  private peer: PeerLink | null = null;
  private matchStarted = false;

  public constructor(private readonly config: MultiplayerSessionConfig) {
    this.lobby = config.createLobbyClient
      ? config.createLobbyClient((event) => this.handleLobbyEvent(event))
      : new LobbyClient({ url: config.controlUrl, onEvent: (event) => this.handleLobbyEvent(event) });
  }

  public createRoom(): void {
    // The RoomDO issues the code; the client connects to a placeholder and
    // the server replies with room-created. We connect to the create
    // endpoint with a client-proposed code so both share one URL scheme.
    this.lobby.connectToRoom(this.proposeCode(), true);
  }

  public joinRoom(code: string): void {
    this.lobby.connectToRoom(code, false);
  }

  public quickMatch(): void {
    this.lobby.connectToMatchmaking();
  }

  public close(): void {
    this.peer?.close();
    this.lobby.close();
  }

  private proposeCode(): string {
    // The server is authoritative on the code, but the /room endpoint needs
    // a code in the path; generate a candidate the RoomDO will adopt.
    let code = "";
    const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    for (let i = 0; i < 5; i += 1) {
      code += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return code;
  }

  private handleLobbyEvent(event: LobbyEvent): void {
    switch (event.type) {
      case "queued":
        this.config.onEvent({ type: "queued", position: event.position });
        break;
      case "matched":
        // Paired by matchmaking → join the assigned room.
        this.lobby.close();
        this.lobby.connectToRoom(event.code, false);
        break;
      case "room-ready":
        this.config.onEvent({ type: "room-ready", code: event.code, created: event.created });
        break;
      case "peer-joined":
        this.startPeerLink(event.role);
        break;
      case "peer-left":
        this.config.onEvent({ type: "disconnected", reason: "peer-left" });
        break;
      case "match-start":
        this.beginMatch(event.kickoffSeed, event.peers);
        break;
      case "handshake-rejected":
        this.config.onEvent({ type: "handshake-rejected", reason: event.reason });
        break;
      case "error":
        this.config.onEvent({ type: "error", reason: event.reason });
        break;
      case "closed":
        if (!this.matchStarted) {
          this.config.onEvent({ type: "disconnected", reason: "lobby-closed" });
        }
        break;
    }
  }

  private startPeerLink(role: PeerRole): void {
    this.config.onEvent({ type: "connecting" });
    const onStateChange = (state: PeerLinkState): void => {
      if (state === "connected") {
        this.sendHandshake();
      } else if (state === "failed") {
        this.config.onEvent({ type: "disconnected", reason: "peer-connection-failed" });
      }
    };
    this.peer = this.config.createPeerLink
      ? this.config.createPeerLink(role, this.lobby.signaling, onStateChange)
      : new PeerLink({
          role,
          signaling: this.lobby.signaling,
          iceServers: this.config.iceServers ?? [],
          onStateChange
        });
    void this.peer.start();
  }

  private sendHandshake(): void {
    const handshake: HandshakeInfo = {
      protocolVersion: LOBBY_PROTOCOL_VERSION,
      buildHash: this.config.buildHash,
      payload: this.config.handshakePayload
    };
    this.lobby.sendReady(handshake);
  }

  private beginMatch(kickoffSeed: number, peers: readonly MatchPeerInfo[]): void {
    if (!this.peer || this.matchStarted) {
      return;
    }
    this.matchStarted = true;
    // Local player always drives PLAYER_CAR_ID; the remote peer is OPPONENT.
    const session = new LockstepSession({
      localCarId: PLAYER_CAR_ID,
      remoteCarId: OPPONENT_CAR_ID,
      link: this.peer,
      inputDelayTicks: DEFAULT_LOCKSTEP_CONFIG.inputDelayTicks,
      redundancyWindow: DEFAULT_LOCKSTEP_CONFIG.redundancyWindow,
      hashIntervalTicks: DEFAULT_LOCKSTEP_CONFIG.hashIntervalTicks
    });
    this.config.onEvent({
      type: "match-ready",
      context: { session, kickoffSeed, localCarId: PLAYER_CAR_ID, remoteCarId: OPPONENT_CAR_ID, peers }
    });
  }
}
