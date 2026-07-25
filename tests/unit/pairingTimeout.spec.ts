import { describe, expect, it } from "vitest";

import {
  MAX_QUICK_MATCH_REQUEUES,
  PAIRING_TIMEOUT_MS,
  resolvePairingTimeout,
  shouldArmPairingTimeout
} from "@/netcode/PairingTimeout";

/**
 * Guards the matched -> room-joined handoff. If a quick-match partner closes
 * their tab after being paired but before joining the assigned room, they
 * never take a room slot — so no `peer-left` is ever emitted and the
 * surviving player waits on "CONNECTING…" forever with only a CANCEL button.
 */
describe("shouldArmPairingTimeout", () => {
  it("arms only for quick match", () => {
    expect(shouldArmPairingTimeout("quick")).toBe(true);
  });

  it("never arms for CREATE ROOM — holding a room open for a friend is the feature", () => {
    expect(shouldArmPairingTimeout("create")).toBe(false);
  });

  it("never arms for JOIN BY CODE — you may legitimately arrive before the creator", () => {
    expect(shouldArmPairingTimeout("join")).toBe(false);
  });

  it("never arms with no active intent", () => {
    expect(shouldArmPairingTimeout(null)).toBe(false);
  });
});

describe("resolvePairingTimeout", () => {
  it("requeues on the first stall, reporting a 1-based attempt number", () => {
    expect(resolvePairingTimeout("quick", 0)).toEqual({ kind: "requeue", attempt: 1 });
  });

  it("keeps requeuing up to the cap", () => {
    expect(resolvePairingTimeout("quick", 1)).toEqual({ kind: "requeue", attempt: 2 });
  });

  it("gives up once the cap is reached, so a broken server can't spin forever", () => {
    expect(resolvePairingTimeout("quick", MAX_QUICK_MATCH_REQUEUES)).toEqual({ kind: "give-up" });
    expect(resolvePairingTimeout("quick", MAX_QUICK_MATCH_REQUEUES + 5)).toEqual({ kind: "give-up" });
  });

  it("returns null for intents that should never have armed a timer", () => {
    expect(resolvePairingTimeout("create", 0)).toBeNull();
    expect(resolvePairingTimeout("join", 0)).toBeNull();
  });

  it("honours a caller-supplied cap", () => {
    expect(resolvePairingTimeout("quick", 0, 1)).toEqual({ kind: "requeue", attempt: 1 });
    expect(resolvePairingTimeout("quick", 1, 1)).toEqual({ kind: "give-up" });
  });

  it("a full retry sequence terminates rather than looping", () => {
    const actions: string[] = [];
    let requeues = 0;
    for (let i = 0; i < 10; i += 1) {
      const action = resolvePairingTimeout("quick", requeues);
      if (!action) break;
      actions.push(action.kind);
      if (action.kind === "give-up") break;
      requeues = action.attempt;
    }
    expect(actions).toEqual(["requeue", "requeue", "give-up"]);
  });
});

describe("pairing timeout budget", () => {
  it("waits long enough for a real room reconnect but not so long it feels hung", () => {
    // The handoff is: close queue socket -> open room socket -> both peers
    // seated. Seconds, not tens of seconds, even on a bad connection.
    expect(PAIRING_TIMEOUT_MS).toBeGreaterThanOrEqual(8_000);
    expect(PAIRING_TIMEOUT_MS).toBeLessThanOrEqual(20_000);
  });
});
