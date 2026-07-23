import { describe, expect, it } from "vitest";

import { RoomCore } from "../../backend/src/RoomCore";
import type { HandshakeInfo } from "@/netcode/lobbyProtocol";

const HS = (buildHash = "d12dfc99", version = 1, payload: unknown = {}): HandshakeInfo => ({
  protocolVersion: version,
  buildHash,
  payload
});

function seedGen(): () => number {
  let n = 100;
  return () => n++;
}

describe("N4 RoomCore", () => {
  it("assigns offerer to the first peer and answerer to the second, and pairs them", () => {
    const room = new RoomCore("ABCDE", seedGen());
    const first = room.addPeer("p1", true);
    expect(first).toEqual([{ to: "p1", message: { type: "room-created", code: "ABCDE", selfId: "p1" } }]);
    expect(room.peerCount).toBe(1);

    const second = room.addPeer("p2", false);
    // p2 gets room-joined, then both learn their partner + own role.
    expect(second).toContainEqual({ to: "p2", message: { type: "room-joined", code: "ABCDE", selfId: "p2" } });
    expect(second).toContainEqual({ to: "p1", message: { type: "peer-joined", peerId: "p2", role: "offerer" } });
    expect(second).toContainEqual({ to: "p2", message: { type: "peer-joined", peerId: "p1", role: "answerer" } });
    expect(room.isFull()).toBe(true);
  });

  it("refuses a third peer with a room-full error", () => {
    const room = new RoomCore("ABCDE", seedGen());
    room.addPeer("p1", true);
    room.addPeer("p2", false);
    expect(room.addPeer("p3", false)).toEqual([{ to: "p3", message: { type: "error", reason: "room-full" } }]);
    expect(room.peerCount).toBe(2);
  });

  it("relays a signal only to the other peer", () => {
    const room = new RoomCore("ABCDE", seedGen());
    room.addPeer("p1", true);
    room.addPeer("p2", false);
    expect(room.handleMessage("p1", { type: "signal", data: { sdp: "offer" } })).toEqual([
      { to: "p2", message: { type: "signal", data: { sdp: "offer" } } }
    ]);
    expect(room.handleMessage("p2", { type: "signal", data: { candidate: "c" } })).toEqual([
      { to: "p1", message: { type: "signal", data: { candidate: "c" } } }
    ]);
  });

  it("starts the match with a shared kickoff seed once both send compatible handshakes", () => {
    const room = new RoomCore("ABCDE", seedGen());
    room.addPeer("p1", true);
    room.addPeer("p2", false);

    expect(room.handleMessage("p1", { type: "ready", handshake: HS("d12dfc99", 1, { name: "A" }) })).toEqual([]);
    const start = room.handleMessage("p2", { type: "ready", handshake: HS("d12dfc99", 1, { name: "B" }) });
    expect(start).toHaveLength(2);
    const msg = start[0]!.message;
    if (msg.type !== "match-start") throw new Error("expected match-start");
    expect(msg.kickoffSeed).toBe(100);
    expect(msg.peers).toEqual([
      { id: "p1", role: "offerer", payload: { name: "A" } },
      { id: "p2", role: "answerer", payload: { name: "B" } }
    ]);
    // Both peers receive the identical match-start.
    expect(start[1]!.message).toEqual(start[0]!.message);
  });

  it("rejects the match when build hashes differ (would desync)", () => {
    const room = new RoomCore("ABCDE", seedGen());
    room.addPeer("p1", true);
    room.addPeer("p2", false);
    room.handleMessage("p1", { type: "ready", handshake: HS("d12dfc99") });
    const rejected = room.handleMessage("p2", { type: "ready", handshake: HS("cafef00d") });
    expect(rejected).toEqual([
      { to: "p1", message: { type: "handshake-rejected", reason: "build-hash-mismatch" } },
      { to: "p2", message: { type: "handshake-rejected", reason: "build-hash-mismatch" } }
    ]);
  });

  it("notifies the survivor and voids negotiation when a peer leaves", () => {
    const room = new RoomCore("ABCDE", seedGen());
    room.addPeer("p1", true);
    room.addPeer("p2", false);
    room.handleMessage("p1", { type: "ready", handshake: HS() });

    expect(room.removePeer("p2")).toEqual([{ to: "p1", message: { type: "peer-left" } }]);
    expect(room.isFull()).toBe(false);

    // A new peer takes the freed answerer slot; p1's stale handshake was
    // cleared, so the match only starts after BOTH re-handshake.
    const rejoin = room.addPeer("p3", false);
    expect(rejoin).toContainEqual({ to: "p1", message: { type: "peer-joined", peerId: "p3", role: "offerer" } });
    expect(room.handleMessage("p3", { type: "ready", handshake: HS() })).toEqual([]); // p1 not ready again yet
    const restart = room.handleMessage("p1", { type: "ready", handshake: HS() });
    expect(restart[0]!.message.type).toBe("match-start");
  });

  it("becomes empty when the last peer leaves (so the DO can self-destruct)", () => {
    const room = new RoomCore("ABCDE", seedGen());
    room.addPeer("p1", true);
    expect(room.removePeer("p1")).toEqual([]);
    expect(room.isEmpty()).toBe(true);
  });
});
