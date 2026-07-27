import {
  checkHandshakeCompatibility,
  type ClientMessage,
  type HandshakeInfo,
  type PeerRole,
  type ServerMessage
} from "../../src/netcode/lobbyProtocol";

/**
 * N4 (plan/ONLINE_MULTIPLAYER_PLAN.md, §4.4): the pure state machine for a
 * single 1v1 room, with no Cloudflare dependency so it runs in the normal
 * vitest suite. `RoomDO` is a thin Durable Object adapter that pipes
 * WebSocket messages in and the emitted `RoomEffect`s out.
 *
 * Two fixed slots: slot 0 is the WebRTC offerer, slot 1 the answerer. Roles
 * are tied to slots (not join order) so a mid-lobby leave + rejoin is clean.
 * The room relays signaling verbatim, and when BOTH peers have sent a
 * compatible handshake it mints a shared kickoff seed and starts the match;
 * incompatible builds (which would desync) are refused.
 */
export interface RoomEffect {
  readonly to: string;
  readonly message: ServerMessage;
}

interface PeerState {
  id: string;
  readonly role: PeerRole;
  handshake: HandshakeInfo | null;
}

const SLOT_ROLES: readonly PeerRole[] = ["offerer", "answerer"];

export class RoomCore {
  private readonly slots: (PeerState | null)[] = [null, null];
  private started = false;

  public constructor(
    public readonly code: string,
    private readonly nextKickoffSeed: () => number
  ) {}

  public get peerCount(): number {
    return this.slots.filter((slot) => slot !== null).length;
  }

  public isFull(): boolean {
    return this.peerCount >= 2;
  }

  public isEmpty(): boolean {
    return this.peerCount === 0;
  }

  public addPeer(id: string, isCreator: boolean): RoomEffect[] {
    // Idempotent per peer id — a peer already seated never takes a second
    // slot (defence-in-depth against an adapter reconstructing membership
    // and re-adding the same socket).
    if (this.slots.some((slot) => slot?.id === id)) {
      return [];
    }

    const freeSlot = this.slots.findIndex((slot) => slot === null);
    if (freeSlot === -1) {
      return [{ to: id, message: { type: "error", reason: "room-full" } }];
    }

    this.slots[freeSlot] = { id, role: SLOT_ROLES[freeSlot]!, handshake: null };

    const effects: RoomEffect[] = [
      {
        to: id,
        message: isCreator
          ? { type: "room-created", code: this.code, selfId: id }
          : { type: "room-joined", code: this.code, selfId: id }
      }
    ];

    if (this.isFull()) {
      // A fresh pairing: clear any stale handshake so both renegotiate, and
      // tell each peer who its partner is and what its own role is.
      this.started = false;
      for (const slot of this.slots) {
        if (slot) {
          slot.handshake = null;
        }
      }
      const [a, b] = this.slots as [PeerState, PeerState];
      effects.push({ to: a.id, message: { type: "peer-joined", peerId: b.id, role: a.role } });
      effects.push({ to: b.id, message: { type: "peer-joined", peerId: a.id, role: b.role } });
    }

    return effects;
  }

  public removePeer(id: string): RoomEffect[] {
    const slotIndex = this.slots.findIndex((slot) => slot?.id === id);
    if (slotIndex === -1) {
      return [];
    }
    this.slots[slotIndex] = null;
    this.started = false;

    const other = this.slots.find((slot) => slot !== null);
    if (other) {
      // The remaining peer's negotiation is void; make it re-handshake with
      // whoever joins next.
      other.handshake = null;
      return [{ to: other.id, message: { type: "peer-left" } }];
    }
    return [];
  }

  public handleMessage(id: string, message: ClientMessage): RoomEffect[] {
    const peer = this.slots.find((slot) => slot?.id === id);
    if (!peer) {
      return [];
    }

    switch (message.type) {
      case "signal": {
        const other = this.slots.find((slot) => slot !== null && slot.id !== id);
        if (!other) {
          return [];
        }
        return [{ to: other.id, message: { type: "signal", data: message.data } }];
      }
      case "ready": {
        peer.handshake = message.handshake;
        return this.maybeStart();
      }
    }
  }

  private maybeStart(): RoomEffect[] {
    if (this.started || !this.isFull()) {
      return [];
    }
    const [a, b] = this.slots as [PeerState, PeerState];
    if (!a.handshake || !b.handshake) {
      return [];
    }

    const rejection = checkHandshakeCompatibility(a.handshake, b.handshake);
    if (rejection) {
      return [
        { to: a.id, message: { type: "handshake-rejected", reason: rejection } },
        { to: b.id, message: { type: "handshake-rejected", reason: rejection } }
      ];
    }

    this.started = true;
    const kickoffSeed = this.nextKickoffSeed();
    const peers = [
      { id: a.id, role: a.role, payload: a.handshake.payload },
      { id: b.id, role: b.role, payload: b.handshake.payload }
    ];
    const message: ServerMessage = { type: "match-start", kickoffSeed, peers };
    return [
      { to: a.id, message },
      { to: b.id, message }
    ];
  }
}
