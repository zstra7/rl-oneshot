import { describe, expect, it } from "vitest";

import { deriveOnlineEndReason, resolveForfeit } from "@/core/OnlineForfeit";

// The host is always the offerer and drives the "player" team; the guest
// drives "opponent". These tests use that fixed mapping.
const HOST_TEAM = "player" as const;

describe("resolveForfeit (host-authoritative leave decision)", () => {
  it("nobody leaving -> no forfeit", () => {
    expect(resolveForfeit(HOST_TEAM, false, false)).toBeNull();
  });

  it("host leaves -> guest (opponent) wins, host recorded as forfeiter", () => {
    expect(resolveForfeit(HOST_TEAM, true, false)).toEqual({ winner: "opponent", forfeitedBy: "player" });
  });

  it("guest leaves -> host (player) wins, guest recorded as forfeiter", () => {
    expect(resolveForfeit(HOST_TEAM, false, true)).toEqual({ winner: "player", forfeitedBy: "opponent" });
  });

  it("both somehow hold it -> resolves deterministically to the host leaving (no flap)", () => {
    expect(resolveForfeit(HOST_TEAM, true, true)).toEqual({ winner: "opponent", forfeitedBy: "player" });
  });
});

describe("deriveOnlineEndReason (one source of truth for the message)", () => {
  it("natural finish (no forfeiter) -> null for both sides", () => {
    expect(deriveOnlineEndReason(null, "player")).toBeNull();
    expect(deriveOnlineEndReason(null, "opponent")).toBeNull();
  });

  it("the forfeiting side sees 'you-left', the other sees 'opponent-left' — never both the same", () => {
    // Host (player) forfeited.
    expect(deriveOnlineEndReason("player", "player")).toBe("you-left"); // host's own screen
    expect(deriveOnlineEndReason("player", "opponent")).toBe("opponent-left"); // guest's screen

    // Guest (opponent) forfeited.
    expect(deriveOnlineEndReason("opponent", "opponent")).toBe("you-left"); // guest's own screen
    expect(deriveOnlineEndReason("opponent", "player")).toBe("opponent-left"); // host's screen
  });
});
