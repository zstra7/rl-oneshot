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
      winner: null,
      forfeitedBy: null
    }
  };
}

/** Recursively assert every number in `actual` is within `eps` of the corresponding number in `expected`. */
function assertCloseDeep(actual: unknown, expected: unknown, eps: number, path = "root"): void {
  if (typeof expected === "number") {
    expect(typeof actual, path).toBe("number");
    expect(Math.abs((actual as number) - expected), path).toBeLessThanOrEqual(eps);
    return;
  }
  if (Array.isArray(expected)) {
    expect(Array.isArray(actual), path).toBe(true);
    const actualArr = actual as unknown[];
    expect(actualArr.length, path).toBe(expected.length);
    expected.forEach((v, i) => assertCloseDeep(actualArr[i], v, eps, `${path}[${i}]`));
    return;
  }
  if (expected !== null && typeof expected === "object") {
    expect(actual !== null && typeof actual === "object", path).toBe(true);
    for (const key of Object.keys(expected)) {
      assertCloseDeep((actual as Record<string, unknown>)[key], (expected as Record<string, unknown>)[key], eps, `${path}.${key}`);
    }
    return;
  }
  expect(actual, path).toEqual(expected);
}

describe("S2 snapshot codec", () => {
  it("round-trips a real snapshot through the wire (P1.4: rounded to 5 decimals, not bit-exact)", async () => {
    const snapshot = await snapshotAfterPlay();
    const decoded = decodePacket(encodeSnapshotPacket(snapshot));
    expect(decoded?.type).toBe(PacketType.Snapshot);
    if (decoded?.type !== PacketType.Snapshot) throw new Error("wrong type");
    // P1.4 rounds wire floats to 5 decimal places (0.01mm) — every field is
    // still within that tolerance of the original, just not bit-identical.
    assertCloseDeep(decoded.snapshot, snapshot, 1e-4);
  });

  it("P1.4: a real captured snapshot is compact on the wire", async () => {
    const snapshot = await snapshotAfterPlay();
    const bytes = encodeSnapshotPacket(snapshot);
    expect(bytes.length).toBeLessThan(4000);

    // And still round-trips with every position within 1e-4 of the original.
    const decoded = decodePacket(bytes);
    if (decoded?.type !== PacketType.Snapshot) throw new Error("wrong type");
    for (let i = 0; i < snapshot.world.cars.length; i += 1) {
      const before = snapshot.world.cars[i]!.position;
      const after = decoded.snapshot.world.cars[i]!.position;
      expect(Math.abs(before.x - after.x)).toBeLessThan(1e-4);
      expect(Math.abs(before.y - after.y)).toBeLessThan(1e-4);
      expect(Math.abs(before.z - after.z)).toBeLessThan(1e-4);
    }
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
