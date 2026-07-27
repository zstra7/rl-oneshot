import { describe, expect, it } from "vitest";

import { FALLBACK_NICKNAME, MAX_NICKNAME_LENGTH, sanitizeNickname } from "@/netcode/Nickname";
import { buildHandshakePayload, parsePeerPayload } from "@/netcode/PeerCosmetics";

describe("P2.1 sanitizeNickname", () => {
  it("trims, collapses whitespace, and caps at 12 characters", () => {
    expect(sanitizeNickname("  spacey   name  ")).toBe("spacey name");
    expect(sanitizeNickname("a".repeat(47))).toBe("a".repeat(MAX_NICKNAME_LENGTH));
  });

  it("strips disallowed characters", () => {
    expect(sanitizeNickname("<script>")).toBe("script");
    expect(sanitizeNickname("💥💥💥💥💥💥💥💥💥💥💥💥💥💥💥💥💥💥💥💥💥💥💥💥💥💥💥💥💥💥💥💥💥💥💥💥💥💥💥💥💥💥💥💥💥💥💥")).toBe(
      FALLBACK_NICKNAME
    );
  });

  it("falls back to PLAYER for empty, non-string, or all-disallowed input", () => {
    expect(sanitizeNickname("")).toBe(FALLBACK_NICKNAME);
    expect(sanitizeNickname("   ")).toBe(FALLBACK_NICKNAME);
    expect(sanitizeNickname(null)).toBe(FALLBACK_NICKNAME);
    expect(sanitizeNickname(undefined)).toBe(FALLBACK_NICKNAME);
    expect(sanitizeNickname(42)).toBe(FALLBACK_NICKNAME);
    expect(sanitizeNickname("!!!")).toBe(FALLBACK_NICKNAME);
  });

  it("allows letters, digits, spaces, underscore, and hyphen", () => {
    expect(sanitizeNickname("Player_1-2 3")).toBe("Player_1-2 3");
  });
});

describe("P2.2 PeerCosmetics", () => {
  it("buildHandshakePayload sanitizes the nickname and passes colors through", () => {
    const payload = buildHandshakePayload("  <bad> name  ", "#ff0000", "#00ff00");
    expect(payload.name).toBe("bad name");
    expect(payload.bodyColor).toBe("#ff0000");
    expect(payload.boostColor).toBe("#00ff00");
  });

  it("parsePeerPayload accepts a valid payload untouched", () => {
    const parsed = parsePeerPayload({ name: "Rival", bodyColor: "#123abc", boostColor: "#abc123" });
    expect(parsed).toEqual({ name: "Rival", bodyColor: "#123abc", boostColor: "#abc123" });
  });

  it("parsePeerPayload sanitizes a hostile/malformed name and rejects bad hex colors", () => {
    const parsed = parsePeerPayload({ name: "<script>alert(1)</script>", bodyColor: "not-a-color", boostColor: 12345 });
    // Stripped of <, >, (, ), / then capped at MAX_NICKNAME_LENGTH (12).
    expect(parsed.name).toBe("scriptalert1");
    expect(parsed.bodyColor).toBeNull();
    expect(parsed.boostColor).toBeNull();
  });

  it("parsePeerPayload handles null/undefined/non-object payloads with safe defaults", () => {
    expect(parsePeerPayload(null)).toEqual({ name: FALLBACK_NICKNAME, bodyColor: null, boostColor: null });
    expect(parsePeerPayload(undefined)).toEqual({ name: FALLBACK_NICKNAME, bodyColor: null, boostColor: null });
    expect(parsePeerPayload("just a string")).toEqual({ name: FALLBACK_NICKNAME, bodyColor: null, boostColor: null });
    expect(parsePeerPayload(42)).toEqual({ name: FALLBACK_NICKNAME, bodyColor: null, boostColor: null });
  });

  it("parsePeerPayload rejects a hex color with wrong length/format", () => {
    expect(parsePeerPayload({ bodyColor: "#fff" }).bodyColor).toBeNull();
    expect(parsePeerPayload({ bodyColor: "#gggggg" }).bodyColor).toBeNull();
    expect(parsePeerPayload({ bodyColor: "ff0000" }).bodyColor).toBeNull();
    expect(parsePeerPayload({ bodyColor: "#FF00AA" }).bodyColor).toBe("#FF00AA");
  });
});
