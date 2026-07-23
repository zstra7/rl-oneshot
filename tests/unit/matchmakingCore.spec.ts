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
