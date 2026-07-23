import { generateRoomCode } from "../../src/netcode/lobbyProtocol";
import { MatchmakingCore } from "./MatchmakingCore";

/**
 * N4 (plan/ONLINE_MULTIPLAYER_PLAN.md, §4.4): the single global
 * matchmaking Durable Object. Thin adapter over the pure `MatchmakingCore`
 * FIFO queue. Each connecting client is queued by its socket id; when two
 * are waiting they are paired, handed a freshly-minted room code, and told
 * to reconnect to that room. A client that drops is evicted from the queue
 * by `webSocketClose`, so a dead socket never lingers as a ghost entry.
 */
interface QueueAttachment {
  playerId: string;
}

export class MatchmakingDO {
  private readonly queue = new MatchmakingCore();

  public constructor(private readonly state: DurableObjectState) {}

  public async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    const playerId = crypto.randomUUID();
    server.serializeAttachment({ playerId } satisfies QueueAttachment);
    this.state.acceptWebSocket(server);

    this.rebuildQueueFromSockets();
    this.queue.enqueue(playerId);
    server.send(JSON.stringify({ type: "queued", position: this.queue.positionOf(playerId) }));
    this.tryPair();

    return new Response(null, { status: 101, webSocket: client });
  }

  public webSocketClose(ws: WebSocket): void {
    const attachment = ws.deserializeAttachment() as QueueAttachment | null;
    if (attachment) {
      this.queue.remove(attachment.playerId);
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

  private tryPair(): void {
    const socketsByPlayer = this.socketsByPlayer();
    for (const [aId, bId] of this.queue.takePairs()) {
      const code = generateRoomCode(Math.random);
      for (const playerId of [aId, bId]) {
        const ws = socketsByPlayer.get(playerId);
        if (ws) {
          ws.send(JSON.stringify({ type: "matched", code }));
        }
      }
    }
  }

  /** After a hibernation wake the in-memory queue may be empty; rebuild it from live sockets. */
  private rebuildQueueFromSockets(): void {
    if (this.queue.size() > 0) {
      return;
    }
    for (const ws of this.state.getWebSockets()) {
      const attachment = ws.deserializeAttachment() as QueueAttachment | null;
      if (attachment) {
        this.queue.enqueue(attachment.playerId);
      }
    }
  }

  private socketsByPlayer(): Map<string, WebSocket> {
    const map = new Map<string, WebSocket>();
    for (const ws of this.state.getWebSockets()) {
      const attachment = ws.deserializeAttachment() as QueueAttachment | null;
      if (attachment) {
        map.set(attachment.playerId, ws);
      }
    }
    return map;
  }
}
