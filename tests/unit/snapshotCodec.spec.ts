import { describe, expect, it } from "vitest";

import { PhysicsFacade } from "@/physics/PhysicsFacade";
import { PLAYER_CAR_ID, OPPONENT_CAR_ID } from "@/game-flow/MatchFlowConstants";
import { PacketType, decodePacket, encodeSnapshotPacket } from "@/netcode/protocol";
import type { StateSyncSnapshot } from "@/netcode/stateSync";

const NEUTRAL = { throttle: 0, steer: 0, pitch: 0, yaw: 0, roll: 0, jump: false, boost: false, powerslide: false };

async function snapshotAfterPlay(): Promise<StateSyncSnapshot> {
  const f = new PhysicsFacade();
  await f.initialise();
  f.resetWorld({ carCreationOrder: [PLAYER_CAR_ID, OPPONENT_CAR_ID], kickoffVariantIndex: 2 });
  for (let t = 0; t < 200; t += 1) {
    f.setCarInput(PLAYER_CAR_ID, { ...NEUTRAL, throttle: 1, steer: 0.5, boost: true });
    f.setCarInput(OPPONENT_CAR_ID, { ...NEUTRAL, throttle: 1, steer: -0.5 });
    f.step();
  }
  const world = f.getWorldSnapshot();
  f.dispose();
  return {
    tick: world.tick,
    world,
    flow: {
      matchState: "PLAYING",
      playerScore: 2,
      opponentScore: 1,
      regulationTimeRemaining: 143.5,
      overtimeElapsed: 0,
      countdownTicksRemaining: 0,
      celebrationTicksRemaining: 0,
      overtimeIntroTicksRemaining: 0,
      kickoffCounter: 3,
      goalLatch: false,
      winner: null
    }
  };
}

describe("S2 snapshot codec", () => {
  it("round-trips a real snapshot losslessly through the wire", async () => {
    const snapshot = await snapshotAfterPlay();
    const decoded = decodePacket(encodeSnapshotPacket(snapshot));
    expect(decoded?.type).toBe(PacketType.Snapshot);
    if (decoded?.type !== PacketType.Snapshot) throw new Error("wrong type");
    // JSON is lossless for the plain number/bool/string fields we carry.
    expect(decoded.snapshot).toEqual(snapshot);
  });

  it("rejects a malformed snapshot packet rather than crashing", () => {
    const junk = new Uint8Array([PacketType.Snapshot, 0x7b, 0x21]); // "{!" — invalid JSON
    expect(decodePacket(junk)).toBeNull();
    const notASnapshot = new Uint8Array([PacketType.Snapshot, ...new TextEncoder().encode('{"a":1}')]);
    expect(decodePacket(notASnapshot)).toBeNull();
  });

  it("still decodes input packets alongside the new snapshot type", () => {
    // Anti-regression: adding the snapshot case didn't break the existing stream.
    const junkPing = new Uint8Array([PacketType.Ping, 1, 0, 0, 0]);
    expect(decodePacket(junkPing)?.type).toBe(PacketType.Ping);
  });
});
