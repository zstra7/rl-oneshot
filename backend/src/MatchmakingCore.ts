/**
 * N4 (plan/ONLINE_MULTIPLAYER_PLAN.md, §4.4): the pure FIFO matchmaking
 * queue — pairs the two longest-waiting players, no skill rating. Cloudflare
 * -free so it runs in the normal vitest suite; `MatchmakingDO` is the thin
 * adapter. A queued player is identified by a stable id (its WebSocket's
 * connection id); the adapter removes it on socket close so a dropped
 * client never lingers as a ghost entry.
 */
export class MatchmakingCore {
  private readonly queue: string[] = [];

  public enqueue(playerId: string): void {
    if (!this.queue.includes(playerId)) {
      this.queue.push(playerId);
    }
  }

  public remove(playerId: string): void {
    const index = this.queue.indexOf(playerId);
    if (index !== -1) {
      this.queue.splice(index, 1);
    }
  }

  /** 1-based position in the queue, or 0 if not queued. */
  public positionOf(playerId: string): number {
    return this.queue.indexOf(playerId) + 1;
  }

  public size(): number {
    return this.queue.length;
  }

  /** Remove and return as many oldest-first pairs as the queue currently allows. */
  public takePairs(): [string, string][] {
    const pairs: [string, string][] = [];
    while (this.queue.length >= 2) {
      pairs.push([this.queue.shift()!, this.queue.shift()!]);
    }
    return pairs;
  }
}
