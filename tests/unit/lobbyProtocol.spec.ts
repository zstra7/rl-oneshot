import { describe, expect, it } from "vitest";

import {
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  checkHandshakeCompatibility,
  generateRoomCode,
  isValidRoomCode,
  parseClientMessage,
  parseServerMessage,
  type HandshakeInfo
} from "@/netcode/lobbyProtocol";

describe("N4 lobby protocol", () => {
  it("generates valid, unambiguous room codes", () => {
    let seed = 12345;
    const rng = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let i = 0; i < 100; i += 1) {
      const code = generateRoomCode(rng);
      expect(code).toHaveLength(ROOM_CODE_LENGTH);
      expect(isValidRoomCode(code)).toBe(true);
      // No ambiguous characters.
      expect(/[01OIL]/.test(code)).toBe(false);
    }
  });

  it("rejects malformed room codes", () => {
    expect(isValidRoomCode("")).toBe(false);
    expect(isValidRoomCode("ABC")).toBe(false); // too short
    expect(isValidRoomCode("ABCDEF")).toBe(false); // too long
    expect(isValidRoomCode("ABCD0")).toBe(false); // contains ambiguous 0
    expect(isValidRoomCode(ROOM_CODE_ALPHABET.slice(0, ROOM_CODE_LENGTH))).toBe(true);
  });

  it("accepts compatible handshakes and names the reason for incompatible ones", () => {
    const base: HandshakeInfo = { protocolVersion: 1, buildHash: "d12dfc99", payload: {} };
    expect(checkHandshakeCompatibility(base, base)).toBeNull();
    expect(checkHandshakeCompatibility(base, { ...base, protocolVersion: 2 })).toBe("protocol-version-mismatch");
    expect(checkHandshakeCompatibility(base, { ...base, buildHash: "deadbeef" })).toBe("build-hash-mismatch");
  });

  it("parses valid client messages and rejects malformed ones", () => {
    expect(parseClientMessage(JSON.stringify({ type: "signal", data: { sdp: "x" } }))).toEqual({
      type: "signal",
      data: { sdp: "x" }
    });
    expect(
      parseClientMessage(JSON.stringify({ type: "ready", handshake: { protocolVersion: 1, buildHash: "h", payload: 5 } }))
    ).toEqual({ type: "ready", handshake: { protocolVersion: 1, buildHash: "h", payload: 5 } });

    expect(parseClientMessage("not json")).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "unknown" }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "ready", handshake: { buildHash: "h" } }))).toBeNull(); // missing version
    expect(parseClientMessage(JSON.stringify({ noType: true }))).toBeNull();
  });

  it("parses known server messages and rejects unknown ones", () => {
    expect(parseServerMessage(JSON.stringify({ type: "matched", code: "ABCDE" }))).toEqual({
      type: "matched",
      code: "ABCDE"
    });
    expect(parseServerMessage(JSON.stringify({ type: "bogus" }))).toBeNull();
    expect(parseServerMessage("{")).toBeNull();
  });
});
