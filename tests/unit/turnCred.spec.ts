import { afterEach, describe, expect, it, vi } from "vitest";

import { STUN_ONLY, mintIceServers } from "../../backend/src/turn";

describe("N4 TURN credential minting", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns STUN-only when no TURN credentials are configured", async () => {
    expect(await mintIceServers({})).toEqual(STUN_ONLY);
    expect(await mintIceServers({ TURN_KEY_ID: "k" })).toEqual(STUN_ONLY); // token missing
  });

  it("appends Cloudflare Realtime TURN servers when configured", async () => {
    const turnServer = { urls: "turn:turn.cloudflare.com:3478", username: "u", credential: "c" };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ iceServers: turnServer }), { status: 200 }))
    );
    const result = await mintIceServers({ TURN_KEY_ID: "k", TURN_API_TOKEN: "t" });
    expect(result).toEqual([...STUN_ONLY, turnServer]);
  });

  it("falls back to STUN-only if the TURN API errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    expect(await mintIceServers({ TURN_KEY_ID: "k", TURN_API_TOKEN: "t" })).toEqual(STUN_ONLY);
  });

  it("falls back to STUN-only if the TURN fetch throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      })
    );
    expect(await mintIceServers({ TURN_KEY_ID: "k", TURN_API_TOKEN: "t" })).toEqual(STUN_ONLY);
  });
});
