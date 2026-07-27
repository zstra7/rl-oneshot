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
    // Whoever is still waiting has just moved up (or had someone slot in
    // behind them) — push everyone their current position.
    this.broadcastPositions();

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
    // A departure shifts everyone behind them up one place.
    this.broadcastPositions();
  }

  public webSocketError(ws: WebSocket): void {
    this.webSocketClose(ws);
  }

  private tryPair(): void {
    const socketsByPlayer = this.socketsByPlayer();
    // Never pair a player whose socket has already gone away: the surviving
    // partner would be sent to a room the ghost never joins, and (with no
    // `peer-left` ever firing, since the ghost never took a slot) would wait
    // there indefinitely. The client also guards this with its own pairing
    // timeout — the two are complementary, since a socket can die in the
    // window between the last liveness check and the send.
    this.queue.retainOnly(new Set(socketsByPlayer.keys()));

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

  /** Push every still-waiting player their CURRENT 1-based queue position. */
  private broadcastPositions(): void {
    const socketsByPlayer = this.socketsByPlayer();
    const ids = this.queue.queuedIds();
    for (let i = 0; i < ids.length; i += 1) {
      const ws = socketsByPlayer.get(ids[i]!);
      if (!ws) {
        continue;
      }
      try {
        ws.send(JSON.stringify({ type: "queued", position: i + 1 }));
      } catch {
        // Socket is mid-close; its `webSocketClose` will evict it shortly.
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
