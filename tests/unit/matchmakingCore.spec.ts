import { describe, expect, it } from "vitest";

import { MatchmakingCore } from "../../backend/src/MatchmakingCore";

describe("N4 MatchmakingCore", () => {
  it("pairs the two longest-waiting players, oldest first", () => {
    const mm = new MatchmakingCore();
    mm.enqueue("a");
    mm.enqueue("b");
    mm.enqueue("c");
    const pairs = mm.takePairs();
    expect(pairs).toEqual([["a", "b"]]);
    // c is left waiting.
    expect(mm.size()).toBe(1);
    expect(mm.positionOf("c")).toBe(1);
  });

  it("pairs several waiting players at once", () => {
    const mm = new MatchmakingCore();
    for (const id of ["a", "b", "c", "d", "e"]) mm.enqueue(id);
    expect(mm.takePairs()).toEqual([
      ["a", "b"],
      ["c", "d"]
    ]);
    expect(mm.size()).toBe(1); // e still waiting
  });

  it("reports 1-based queue position and 0 when not queued", () => {
    const mm = new MatchmakingCore();
    mm.enqueue("a");
    mm.enqueue("b");
    expect(mm.positionOf("a")).toBe(1);
    expect(mm.positionOf("b")).toBe(2);
    expect(mm.positionOf("z")).toBe(0);
  });

  it("evicts a dropped player (dead socket) so they are never paired", () => {
    const mm = new MatchmakingCore();
    mm.enqueue("a");
    mm.enqueue("b");
    mm.remove("a"); // a's socket closed
    mm.enqueue("c");
    expect(mm.takePairs()).toEqual([["b", "c"]]);
    expect(mm.size()).toBe(0);
  });

  it("ignores duplicate enqueues of the same player", () => {
    const mm = new MatchmakingCore();
    mm.enqueue("a");
    mm.enqueue("a");
    expect(mm.size()).toBe(1);
  });

  it("does not pair a lone waiting player", () => {
    const mm = new MatchmakingCore();
    mm.enqueue("solo");
    expect(mm.takePairs()).toEqual([]);
    expect(mm.size()).toBe(1);
  });
});

/**
 * Queue-position staleness fix: a client used to be told its position only
 * once, at connect time, so a queue draining around it still displayed the
 * original number ("FINDING A MATCH — #7" while actually next). The adapter
 * now re-broadcasts positions whenever the queue shifts, which needs the
 * queue's current order.
 */
describe("MatchmakingCore.queuedIds (live queue-position broadcast)", () => {
  it("returns the waiting players oldest-first", () => {
    const mm = new MatchmakingCore();
    for (const id of ["a", "b", "c"]) mm.enqueue(id);
    expect(mm.queuedIds()).toEqual(["a", "b", "c"]);
  });

  it("shifts everyone up after a pairing — the whole point of re-broadcasting", () => {
    const mm = new MatchmakingCore();
    for (const id of ["a", "b", "c", "d", "e"]) mm.enqueue(id);
    expect(mm.positionOf("e")).toBe(5);

    mm.takePairs(); // a+b and c+d leave together
    expect(mm.queuedIds()).toEqual(["e"]);
    // Without a re-broadcast, e's client would still be showing #5.
    expect(mm.positionOf("e")).toBe(1);
  });

  it("shifts everyone behind a departing player up one place", () => {
    const mm = new MatchmakingCore();
    for (const id of ["a", "b", "c"]) mm.enqueue(id);
    mm.remove("a");
    expect(mm.queuedIds()).toEqual(["b", "c"]);
    expect(mm.positionOf("c")).toBe(2);
  });

  it("hands back a copy — mutating it cannot corrupt the queue", () => {
    const mm = new MatchmakingCore();
    mm.enqueue("a");
    (mm.queuedIds() as string[]).push("ghost");
    expect(mm.size()).toBe(1);
  });
});

/**
 * Stranded-partner fix: pairing a player whose socket already died consumes
 * a real waiting player into a room the ghost never joins. Because the ghost
 * never takes a room slot, no `peer-left` is ever emitted, so the survivor
 * waits on "CONNECTING…" indefinitely.
 */
describe("MatchmakingCore.retainOnly (never pair a dead socket)", () => {
  it("drops queued players whose sockets are gone, preserving the order of the rest", () => {
    const mm = new MatchmakingCore();
    for (const id of ["a", "b", "c", "d"]) mm.enqueue(id);
    mm.retainOnly(new Set(["a", "c", "d"])); // b's socket died
    expect(mm.queuedIds()).toEqual(["a", "c", "d"]);
  });

  it("a ghost is never handed to a live player as a partner", () => {
    const mm = new MatchmakingCore();
    mm.enqueue("ghost");
    mm.enqueue("live");
    mm.retainOnly(new Set(["live"]));
    // Pre-fix this paired ["ghost", "live"] and stranded `live` in an empty room.
    expect(mm.takePairs()).toEqual([]);
    expect(mm.queuedIds()).toEqual(["live"]);
  });

  it("is a no-op when every queued player is still live", () => {
    const mm = new MatchmakingCore();
    for (const id of ["a", "b"]) mm.enqueue(id);
    mm.retainOnly(new Set(["a", "b"]));
    expect(mm.takePairs()).toEqual([["a", "b"]]);
  });

  it("clears the queue when nothing is live", () => {
    const mm = new MatchmakingCore();
    for (const id of ["a", "b"]) mm.enqueue(id);
    mm.retainOnly(new Set());
    expect(mm.size()).toBe(0);
  });
});
