import { parseClientMessage } from "../../src/netcode/lobbyProtocol";
import { RoomCore, type RoomEffect } from "./RoomCore";

/**
 * N4 (plan/ONLINE_MULTIPLAYER_PLAN.md, §4.4): thin Durable Object adapter
 * around the pure `RoomCore`. One instance per room code. It accepts the
 * two peers' WebSockets with the HIBERNATION api (`acceptWebSocket`) so an
 * idle room costs nothing, relays the control-plane JSON both ways, and
 * dispatches `RoomCore`'s emitted effects to the addressed socket.
 *
 * All room LOGIC (roles, signaling routing, handshake compatibility, match
 * start) lives in `RoomCore` and is covered by the normal vitest suite;
 * this file is only the Cloudflare plumbing, typechecked by
 * `backend/tsconfig.json`. If the DO is evicted mid-lobby, membership is
 * rebuilt from the live sockets' attachments on wake (handshakes, if lost,
 * are simply re-sent — the protocol allows re-negotiation).
 */
interface SocketAttachment {
  peerId: string;
  isCreator: boolean;
  order: number;
}

export class RoomDO {
  private room: RoomCore | null = null;
  private code = "";

  public constructor(
    private readonly state: DurableObjectState,
    private readonly env: unknown
  ) {
    void this.env;
  }

  public async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }

    this.code = url.searchParams.get("code") ?? this.code;
    const isCreator = url.searchParams.get("create") === "1";

    // Reconstruct the room from the peers ALREADY connected, BEFORE accepting
    // the new socket — otherwise `getRoom()` would rebuild membership from
    // `getWebSockets()` including the socket we just accepted, and the
    // `addPeer` below would add that peer a second time (filling both slots
    // with one player and rejecting the real second player as "room-full").
    const room = this.getRoom();
    const order = this.state.getWebSockets().length;

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    const peerId = crypto.randomUUID();
    server.serializeAttachment({ peerId, isCreator, order } satisfies SocketAttachment);
    this.state.acceptWebSocket(server);

    this.dispatch(room.addPeer(peerId, isCreator));

    return new Response(null, { status: 101, webSocket: client });
  }

  public webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    if (typeof message !== "string") {
      return;
    }
    const attachment = ws.deserializeAttachment() as SocketAttachment | null;
    if (!attachment) {
      return;
    }
    const parsed = parseClientMessage(message);
    if (!parsed) {
      return;
    }
    this.dispatch(this.getRoom().handleMessage(attachment.peerId, parsed));
  }

  public webSocketClose(ws: WebSocket): void {
    const attachment = ws.deserializeAttachment() as SocketAttachment | null;
    if (attachment) {
      this.dispatch(this.getRoom().removePeer(attachment.peerId));
    }
    try {
      ws.close();
    } catch {
      // already closing
    }
  }

  public webSocketError(ws: WebSocket): void {
    this.webSocketClose(ws);
  }

  /** Rebuild the in-memory RoomCore from the live sockets if this DO woke without it. */
  private getRoom(): RoomCore {
    if (this.room) {
      return this.room;
    }
    const room = new RoomCore(this.code, () => Math.floor(Math.random() * 0x7fffffff));
    const sockets = this.state
      .getWebSockets()
      .map((ws) => ({ ws, attachment: ws.deserializeAttachment() as SocketAttachment | null }))
      .filter((entry): entry is { ws: WebSocket; attachment: SocketAttachment } => entry.attachment !== null)
      .sort((a, b) => a.attachment.order - b.attachment.order);
    for (const { attachment } of sockets) {
      room.addPeer(attachment.peerId, attachment.isCreator);
    }
    this.room = room;
    return room;
  }

  private dispatch(effects: RoomEffect[]): void {
    if (effects.length === 0) {
      return;
    }
    const byPeer = new Map<string, WebSocket>();
    for (const ws of this.state.getWebSockets()) {
      const attachment = ws.deserializeAttachment() as SocketAttachment | null;
      if (attachment) {
        byPeer.set(attachment.peerId, ws);
      }
    }
    for (const effect of effects) {
      const target = byPeer.get(effect.to);
      if (target) {
        target.send(JSON.stringify(effect.message));
      }
    }
  }
}
