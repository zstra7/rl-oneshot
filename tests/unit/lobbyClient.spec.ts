import { describe, expect, it } from "vitest";

import { LobbyClient, type LobbyEvent, type LobbySocket } from "@/netcode/LobbyClient";
import { encodeMessage, type ServerMessage } from "@/netcode/lobbyProtocol";

class MockSocket implements LobbySocket {
  public onopen: ((event: unknown) => void) | null = null;
  public onmessage: ((event: { data: unknown }) => void) | null = null;
  public onclose: ((event: unknown) => void) | null = null;
  public onerror: ((event: unknown) => void) | null = null;
  public readonly sent: string[] = [];
  public closed = false;
  public constructor(public readonly url: string) {}
  public send(data: string): void {
    this.sent.push(data);
  }
  public close(): void {
    this.closed = true;
  }
  public _open(): void {
    this.onopen?.(null);
  }
  public _server(message: ServerMessage): void {
    this.onmessage?.({ data: encodeMessage(message) });
  }
}

function makeClient() {
  const events: LobbyEvent[] = [];
  let socket: MockSocket | null = null;
  const client = new LobbyClient({
    url: "wss://mp.example.dev",
    onEvent: (e) => events.push(e),
    createWebSocket: (url) => {
      socket = new MockSocket(url);
      return socket;
    }
  });
  return { client, events, getSocket: () => socket! };
}

describe("N5 LobbyClient", () => {
  it("opens the correct URL for creating vs joining a room", () => {
    const create = makeClient();
    create.client.connectToRoom("ABCDE", true);
    expect(create.getSocket().url).toBe("wss://mp.example.dev/room?code=ABCDE&create=1");

    const join = makeClient();
    join.client.connectToRoom("ABCDE", false);
    expect(join.getSocket().url).toBe("wss://mp.example.dev/room?code=ABCDE");
  });

  it("emits room-ready with created flag from room-created / room-joined", () => {
    const { client, events, getSocket } = makeClient();
    client.connectToRoom("ABCDE", true);
    getSocket()._server({ type: "room-created", code: "ABCDE", selfId: "p1" });
    expect(events).toContainEqual({ type: "room-ready", code: "ABCDE", selfId: "p1", created: true });
  });

  it("relays match-start, queued, matched, peer-left, and rejection events", () => {
    const { client, events, getSocket } = makeClient();
    client.connectToMatchmaking();
    const s = getSocket();
    s._server({ type: "queued", position: 2 });
    s._server({ type: "matched", code: "ZZZZZ" });
    s._server({ type: "peer-joined", peerId: "p2", role: "answerer" });
    s._server({ type: "match-start", kickoffSeed: 99, peers: [{ id: "p1", role: "offerer", payload: {} }] });
    s._server({ type: "peer-left" });
    s._server({ type: "handshake-rejected", reason: "build-hash-mismatch" });

    expect(events).toEqual([
      { type: "queued", position: 2 },
      { type: "matched", code: "ZZZZZ" },
      { type: "peer-joined", peerId: "p2", role: "answerer" },
      { type: "match-start", kickoffSeed: 99, peers: [{ id: "p1", role: "offerer", payload: {} }] },
      { type: "peer-left" },
      { type: "handshake-rejected", reason: "build-hash-mismatch" }
    ]);
  });

  it("sends the ready handshake as a lobby message", () => {
    const { client, getSocket } = makeClient();
    client.connectToRoom("ABCDE", false);
    getSocket()._open();
    client.sendReady({ protocolVersion: 1, buildHash: "d12dfc99", payload: { name: "x" } });
    expect(getSocket().sent).toContainEqual(
      encodeMessage({ type: "ready", handshake: { protocolVersion: 1, buildHash: "d12dfc99", payload: { name: "x" } } })
    );
  });

  it("queues PeerLink signals sent before the socket opens, then flushes on open", () => {
    const { client, getSocket } = makeClient();
    client.connectToRoom("ABCDE", true);
    const s = getSocket();
    // PeerLink produces an offer before the WS is open.
    client.signaling.sendDescription({ type: "offer", sdp: "o" });
    expect(s.sent).toHaveLength(0); // buffered
    s._open();
    expect(s.sent).toHaveLength(1);
    expect(JSON.parse(s.sent[0]!)).toEqual({ type: "signal", data: { kind: "description", description: { type: "offer", sdp: "o" } } });
  });

  it("routes incoming signal envelopes to the description and candidate handlers", () => {
    const { client, getSocket } = makeClient();
    client.connectToRoom("ABCDE", false);
    const s = getSocket();
    const descriptions: RTCSessionDescriptionInit[] = [];
    const candidates: RTCIceCandidateInit[] = [];
    client.signaling.onDescription((d) => descriptions.push(d));
    client.signaling.onCandidate((c) => candidates.push(c));

    s._server({ type: "signal", data: { kind: "description", description: { type: "answer", sdp: "a" } } });
    s._server({ type: "signal", data: { kind: "candidate", candidate: { candidate: "c1" } } });

    expect(descriptions).toEqual([{ type: "answer", sdp: "a" }]);
    expect(candidates).toEqual([{ candidate: "c1" }]);
  });

  it("emits closed and error events", () => {
    const { client, events, getSocket } = makeClient();
    client.connectToMatchmaking();
    getSocket().onerror?.(null);
    getSocket().onclose?.(null);
    expect(events).toContainEqual({ type: "error", reason: "socket-error" });
    expect(events).toContainEqual({ type: "closed" });
  });

  it("detaches handlers on an intentional close so a stale onclose can't emit a spurious event", () => {
    const { client, events, getSocket } = makeClient();
    client.connectToMatchmaking();
    const socket = getSocket();
    client.close();
    expect(socket.closed).toBe(true);
    // A real browser fires onclose asynchronously AFTER close() — with the
    // handlers detached it's a no-op, so quick-match's queue->room socket swap
    // no longer surfaces a false "connection lost". onerror is detached too.
    expect(socket.onclose).toBeNull();
    expect(socket.onerror).toBeNull();
    socket.onclose?.(null);
    socket.onerror?.(null);
    expect(events).toHaveLength(0);
  });
});
