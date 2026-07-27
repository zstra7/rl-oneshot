import { describe, expect, it } from "vitest";

import { quantizeCarInput } from "@/netcode/InputQuantize";
import {
  PacketType,
  decodePacket,
  encodeHashPacket,
  encodeInputPacket,
  encodePingPacket,
  encodePongPacket,
  fnv1a32,
  type InputFrame
} from "@/netcode/protocol";
import { NEUTRAL_CAR_INPUT, type CarInput } from "@/physics/PhysicsTypes";

/**
 * N2 (plan/ONLINE_MULTIPLAYER_PLAN.md, §4.3): the wire codec must be a
 * lossless round trip for already-quantized inputs, and must reject any
 * malformed packet rather than crash or fabricate one.
 */
describe("N2 wire protocol codec", () => {
  it("round-trips an input packet losslessly for quantized inputs", () => {
    const frames: InputFrame[] = [
      { tick: 0, input: quantizeCarInput({ ...NEUTRAL_CAR_INPUT, throttle: 1, steer: -0.5, jump: true }) },
      { tick: 1, input: quantizeCarInput({ ...NEUTRAL_CAR_INPUT, throttle: -1, boost: true, powerslide: true }) },
      { tick: 2, input: quantizeCarInput({ ...NEUTRAL_CAR_INPUT, pitch: 0.25, yaw: -0.75, roll: 0.125 }) }
    ];
    const encoded = encodeInputPacket(7, frames);
    const decoded = decodePacket(encoded);
    if (!decoded || decoded.type !== PacketType.Input) {
      throw new Error("expected a decodable input packet");
    }
    expect(decoded.ackTick).toBe(7);
    expect(decoded.frames).toEqual(frames);
  });

  it("round-trips every quantized axis level exactly", () => {
    for (let level = -127; level <= 127; level += 1) {
      const axis = level / 127;
      const input: CarInput = { ...NEUTRAL_CAR_INPUT, throttle: axis, steer: axis, pitch: axis, yaw: axis, roll: axis };
      const decoded = decodePacket(encodeInputPacket(0, [{ tick: 5, input }]));
      if (decoded?.type !== PacketType.Input) throw new Error("expected input packet");
      expect(decoded.frames[0]!.input).toEqual(input);
    }
  });

  it("round-trips hash, ping, and pong packets", () => {
    const hash = decodePacket(encodeHashPacket(1234, 0xdeadbeef));
    expect(hash).toEqual({ type: PacketType.Hash, tick: 1234, hash: 0xdeadbeef });

    const ping = decodePacket(encodePingPacket(99));
    expect(ping).toEqual({ type: PacketType.Ping, nonce: 99 });

    const pong = decodePacket(encodePongPacket(99));
    expect(pong).toEqual({ type: PacketType.Pong, nonce: 99 });
  });

  it("rejects malformed packets instead of crashing or fabricating", () => {
    expect(decodePacket(new Uint8Array([]))).toBeNull(); // empty
    expect(decodePacket(new Uint8Array([99, 0, 0]))).toBeNull(); // unknown type
    expect(decodePacket(new Uint8Array([PacketType.Hash, 1, 2]))).toBeNull(); // truncated hash
    expect(decodePacket(new Uint8Array([PacketType.Input, 0, 0, 0, 0, 5]))).toBeNull(); // claims 5 frames, has none
    // An input packet whose declared frame count doesn't match its length.
    const good = encodeInputPacket(0, [{ tick: 0, input: NEUTRAL_CAR_INPUT }]);
    expect(decodePacket(good.slice(0, good.length - 1))).toBeNull();
  });

  it("fnv1a32 is stable and distinguishes different states", () => {
    expect(fnv1a32("hello")).toBe(fnv1a32("hello"));
    expect(fnv1a32("hello")).not.toBe(fnv1a32("hellp"));
    expect(fnv1a32("")).toBe(0x811c9dc5);
  });
});
