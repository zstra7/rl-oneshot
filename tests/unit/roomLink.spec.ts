import { describe, expect, it } from "vitest";

import { parseRoomFromSearch } from "@/netcode/RoomLink";

describe("P4.1 parseRoomFromSearch", () => {
  it("extracts a valid 5-character room code", () => {
    expect(parseRoomFromSearch("?room=ABCDE")).toBe("ABCDE");
    expect(parseRoomFromSearch("?foo=bar&room=T3XY2")).toBe("T3XY2");
  });

  it("normalises lowercase input to uppercase", () => {
    expect(parseRoomFromSearch("?room=abcde")).toBe("ABCDE");
  });

  it("returns null when the room param is missing", () => {
    expect(parseRoomFromSearch("")).toBeNull();
    expect(parseRoomFromSearch("?foo=bar")).toBeNull();
  });

  it("returns null for a code of the wrong length", () => {
    expect(parseRoomFromSearch("?room=ABCD")).toBeNull();
    expect(parseRoomFromSearch("?room=ABCDEF")).toBeNull();
    expect(parseRoomFromSearch("?room=")).toBeNull();
  });

  it("returns null for a code containing characters outside the room-code alphabet", () => {
    // I, O, 0, 1 are excluded from the alphabet (visual ambiguity).
    expect(parseRoomFromSearch("?room=AI0O1")).toBeNull();
    expect(parseRoomFromSearch("?room=AB-DE")).toBeNull();
    expect(parseRoomFromSearch("?room=<scr>")).toBeNull();
  });
});
