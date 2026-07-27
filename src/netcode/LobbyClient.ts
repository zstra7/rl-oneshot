import {
  encodeMessage,
  parseServerMessage,
  type HandshakeInfo,
  type MatchPeerInfo,
  type PeerRole,
  type HandshakeRejectionReason
} from "@/netcode/lobbyProtocol";
import type { SignalingChannel } from "@/netcode/Signaling";

/**
 * N5 (plan/ONLINE_MULTIPLAYER_PLAN.md): the client side of the control
 * plane. Opens the room / matchmaking WebSocket to the N4 Worker, speaks
 * the lobby protocol, and exposes a `SignalingChannel` view so a PeerLink
 * (N3) can trickle SDP + ICE through the same socket. Emits typed lobby
 * events the UI (N6) reacts to.
 *
 * The WebSocket is created through an injectable factory so the whole
 * lobby state machine is unit-testable in node with a mock socket.
 */
export type LobbyEvent =
  | { readonly type: "room-ready"; readonly code: string; readonly selfId: string; readonly created: boolean }
  | { readonly type: "peer-joined"; readonly peerId: string; readonly role: PeerRole }
  | { readonly type: "peer-left" }
  | { readonly type: "match-start"; readonly kickoffSeed: number; readonly peers: readonly MatchPeerInfo[] }
  | { readonly type: "handshake-rejected"; readonly reason: HandshakeRejectionReason }
  | { readonly type: "queued"; readonly position: number }
  | { readonly type: "matched"; readonly code: string }
  | { readonly type: "error"; readonly reason: string }
  | { readonly type: "closed" };

/** Minimal WebSocket surface the client needs (the browser WebSocket satisfies it). */
export interface LobbySocket {
  send(data: string): void;
  close(): void;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
}

export interface LobbyClientConfig {
  /** Base control-plane URL, e.g. wss://space-carball-mp.example.workers.dev */
  readonly url: string;
  readonly onEvent: (event: LobbyEvent) => void;
  readonly createWebSocket?: (url: string) => LobbySocket;
}

/** The signal envelope carried inside the server-relayed opaque `data` field. */
type SignalEnvelope =
  | { readonly kind: "description"; readonly description: RTCSessionDescriptionInit }
  | { readonly kind: "candidate"; readonly candidate: RTCIceCandidateInit };

export class LobbyClient {
  private socket: LobbySocket | null = null;
  private descriptionHandler: ((description: RTCSessionDescriptionInit) => void) | null = null;
  private candidateHandler: ((candidate: RTCIceCandidateInit) => void) | null = null;
  private queuedSignals: SignalEnvelope[] = [];
  private socketOpen = false;

  public constructor(private readonly config: LobbyClientConfig) {}

  /** Open a room socket to create (`create=true`) or join a room by code. */
  public connectToRoom(code: string, create: boolean): void {
    const suffix = create ? `/room?code=${code}&create=1` : `/room?code=${code}`;
    this.open(`${this.config.url}${suffix}`);
  }

  /** Open the matchmaking queue socket. */
  public connectToMatchmaking(): void {
    this.open(`${this.config.url}/matchmaking`);
  }

  /** Send this peer's handshake (build hash / profile / cosmetics) to start the match. */
  public sendReady(handshake: HandshakeInfo): void {
    this.socket?.send(encodeMessage({ type: "ready", handshake }));
  }

  /** A SignalingChannel view for a PeerLink to trickle SDP + ICE over this socket. */
  public get signaling(): SignalingChannel {
    return {
      sendDescription: (description) => this.sendSignal({ kind: "description", description }),
      sendCandidate: (candidate) => this.sendSignal({ kind: "candidate", candidate }),
      onDescription: (handler) => {
        this.descriptionHandler = handler;
      },
      onCandidate: (handler) => {
        this.candidateHandler = handler;
      },
      close: () => this.close()
    };
  }

  public close(): void {
    const socket = this.socket;
    this.socket = null;
    if (!socket) {
      return;
    }
    // Detach the handlers BEFORE closing so an intentional close never emits a
    // spurious event. This matters most on quick-match: when the server pairs
    // us it sends `matched`, and we close the matchmaking socket to reconnect
    // to the assigned room — without detaching, that stale socket's `onclose`
    // would fire a "closed" → "disconnected" the UI surfaces as a lost
    // connection, moments before the real room connects. Genuine drops still
    // surface, because they come through the *active* socket we never
    // deliberately closed.
    socket.onopen = null;
    socket.onmessage = null;
    socket.onclose = null;
    socket.onerror = null;
    socket.close();
  }

  private open(fullUrl: string): void {
    const factory = this.config.createWebSocket ?? ((u) => new WebSocket(u) as unknown as LobbySocket);
    const socket = factory(fullUrl);
    this.socket = socket;
    this.socketOpen = false;
    this.queuedSignals = [];

    socket.onopen = () => {
      this.socketOpen = true;
      // Flush any signals a fast PeerLink produced before the socket opened.
      for (const envelope of this.queuedSignals) {
        socket.send(encodeMessage({ type: "signal", data: envelope }));
      }
      this.queuedSignals = [];
    };
    socket.onmessage = (event) => this.handleMessage(event.data);
    socket.onclose = () => this.config.onEvent({ type: "closed" });
    socket.onerror = () => this.config.onEvent({ type: "error", reason: "socket-error" });
  }

  private sendSignal(envelope: SignalEnvelope): void {
    if (this.socket && this.socketOpen) {
      this.socket.send(encodeMessage({ type: "signal", data: envelope }));
    } else {
      this.queuedSignals.push(envelope);
    }
  }

  private handleMessage(data: unknown): void {
    if (typeof data !== "string") {
      return;
    }
    const message = parseServerMessage(data);
    if (!message) {
      return;
    }
    switch (message.type) {
      case "room-created":
        this.config.onEvent({ type: "room-ready", code: message.code, selfId: message.selfId, created: true });
        break;
      case "room-joined":
        this.config.onEvent({ type: "room-ready", code: message.code, selfId: message.selfId, created: false });
        break;
      case "peer-joined":
        this.config.onEvent({ type: "peer-joined", peerId: message.peerId, role: message.role });
        break;
      case "peer-left":
        this.config.onEvent({ type: "peer-left" });
        break;
      case "signal":
        this.routeSignal(message.data);
        break;
      case "match-start":
        this.config.onEvent({ type: "match-start", kickoffSeed: message.kickoffSeed, peers: message.peers });
        break;
      case "handshake-rejected":
        this.config.onEvent({ type: "handshake-rejected", reason: message.reason });
        break;
      case "queued":
        this.config.onEvent({ type: "queued", position: message.position });
        break;
      case "matched":
        this.config.onEvent({ type: "matched", code: message.code });
        break;
      case "error":
        this.config.onEvent({ type: "error", reason: message.reason });
        break;
    }
  }

  private routeSignal(data: unknown): void {
    if (typeof data !== "object" || data === null || !("kind" in data)) {
      return;
    }
    const envelope = data as SignalEnvelope;
    if (envelope.kind === "description") {
      this.descriptionHandler?.(envelope.description);
    } else if (envelope.kind === "candidate") {
      this.candidateHandler?.(envelope.candidate);
    }
  }
}
