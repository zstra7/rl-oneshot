import { describe, expect, it } from "vitest";

import { LobbyClient, type LobbySocket } from "@/netcode/LobbyClient";
import { MultiplayerSession, type MultiplayerEvent } from "@/netcode/MultiplayerSession";
import type { PeerLink, PeerLinkState } from "@/netcode/PeerLink";
import { encodeMessage, type ServerMessage } from "@/netcode/lobbyProtocol";

class MockSocket implements LobbySocket {
  public onopen: ((event: unknown) => void) | null = null;
  public onmessage: ((event: { data: unknown }) => void) | null = null;
  public onclose: ((event: unknown) => void) | null = null;
  public onerror: ((event: unknown) => void) | null = null;
  public readonly sent: string[] = [];
  public constructor(public readonly url: string) {}
  public send(data: string): void {
    this.sent.push(data);
  }
  public close(): void {}
  public _open(): void {
    this.onopen?.(null);
  }
  public _server(message: ServerMessage): void {
    this.onmessage?.({ data: encodeMessage(message) });
  }
}

function makeSession() {
  const events: MultiplayerEvent[] = [];
  let socket: MockSocket | null = null;
  let peerRole: string | null = null;
  let peerStateChange: ((state: PeerLinkState) => void) | null = null;
  let peerStarted = false;

  const session = new MultiplayerSession({
    controlUrl: "wss://mp.example.dev",
    buildHash: "d12dfc99",
    handshakePayload: { name: "me" },
    onEvent: (e) => events.push(e),
    createLobbyClient: (onEvent) =>
      new LobbyClient({
        url: "wss://mp.example.dev",
        onEvent,
        createWebSocket: (url) => {
          socket = new MockSocket(url);
          return socket;
        }
      }),
    createPeerLink: (role, _signaling, onStateChange) => {
      peerRole = role;
      peerStateChange = onStateChange;
      return {
        start: async () => {
          peerStarted = true;
        },
        close: () => {},
        send: () => {},
        receive: () => []
      } as unknown as PeerLink;
    }
  });

  return {
    session,
    events,
    getSocket: () => socket!,
    getPeerRole: () => peerRole,
    firePeerState: (s: PeerLinkState) => peerStateChange?.(s),
    peerStarted: () => peerStarted
  };
}

describe("N5 MultiplayerSession orchestration", () => {
  it("drives lobby -> peer -> handshake -> match-ready in order", () => {
    const h = makeSession();
    h.session.joinRoom("ABCDE");
    expect(h.getSocket().url).toBe("wss://mp.example.dev/room?code=ABCDE");

    h.getSocket()._server({ type: "room-joined", code: "ABCDE", selfId: "p2" });
    expect(h.events).toContainEqual({ type: "room-ready", code: "ABCDE", created: false });

    // Peer joins with our assigned role -> we open the PeerLink and connect.
    h.getSocket()._server({ type: "peer-joined", peerId: "p1", role: "answerer" });
    expect(h.getPeerRole()).toBe("answerer");
    expect(h.peerStarted()).toBe(true);
    expect(h.events).toContainEqual({ type: "connecting" });

    // DataChannel connects -> we send the build-hash handshake.
    h.getSocket()._open(); // lobby socket open so the ready send goes through
    h.firePeerState("connected");
    const readyMessages = h.getSocket().sent.map((s) => JSON.parse(s)).filter((m) => m.type === "ready");
    expect(readyMessages).toHaveLength(1);
    expect(readyMessages[0].handshake).toEqual({ protocolVersion: 1, buildHash: "d12dfc99", payload: { name: "me" } });

    // Server starts the match -> we surface a ready-to-run context.
    h.getSocket()._server({
      type: "match-start",
      kickoffSeed: 7,
      peers: [
        { id: "p1", role: "offerer", payload: { name: "them" } },
        { id: "p2", role: "answerer", payload: { name: "me" } }
      ]
    });
    const matchReady = h.events.find((e) => e.type === "match-ready");
    expect(matchReady).toBeDefined();
    if (matchReady?.type !== "match-ready") throw new Error("no match-ready");
    expect(matchReady.context.kickoffSeed).toBe(7);
    // This client was assigned the answerer role, so it drives car-opponent —
    // the offerer drives car-player. The answerer is the GUEST (converges to
    // the host's snapshots); the offerer is the authoritative host.
    expect(matchReady.context.localCarId).toBe("car-opponent");
    expect(matchReady.context.remoteCarId).toBe("car-player");
    expect(matchReady.context.isHost).toBe(false);
    expect(matchReady.context.session.isHost).toBe(false);
  });

  it("assigns the offerer to car-player and makes it the authoritative host", () => {
    const h = makeSession();
    h.session.createRoom();
    h.getSocket()._server({ type: "room-created", code: "ABCDE", selfId: "p1" });
    h.getSocket()._server({ type: "peer-joined", peerId: "p2", role: "offerer" });
    expect(h.getPeerRole()).toBe("offerer");

    h.getSocket()._open();
    h.firePeerState("connected");
    h.getSocket()._server({
      type: "match-start",
      kickoffSeed: 9,
      peers: [
        { id: "p1", role: "offerer", payload: { name: "me" } },
        { id: "p2", role: "answerer", payload: { name: "them" } }
      ]
    });
    const matchReady = h.events.find((e) => e.type === "match-ready");
    if (matchReady?.type !== "match-ready") throw new Error("no match-ready");
    expect(matchReady.context.localCarId).toBe("car-player");
    expect(matchReady.context.remoteCarId).toBe("car-opponent");
    expect(matchReady.context.isHost).toBe(true);
    expect(matchReady.context.session.isHost).toBe(true);
  });

  it("surfaces a handshake rejection (incompatible builds)", () => {
    const h = makeSession();
    h.session.joinRoom("ABCDE");
    h.getSocket()._server({ type: "handshake-rejected", reason: "build-hash-mismatch" });
    expect(h.events).toContainEqual({ type: "handshake-rejected", reason: "build-hash-mismatch" });
  });

  it("surfaces a peer disconnect", () => {
    const h = makeSession();
    h.session.joinRoom("ABCDE");
    h.getSocket()._server({ type: "peer-left" });
    expect(h.events).toContainEqual({ type: "disconnected", reason: "peer-left" });
  });

  it("forwards matchmaking queue position", () => {
    const h = makeSession();
    h.session.quickMatch();
    expect(h.getSocket().url).toBe("wss://mp.example.dev/matchmaking");
    h.getSocket()._server({ type: "queued", position: 3 });
    expect(h.events).toContainEqual({ type: "queued", position: 3 });
  });
});
