import { describe, expect, it } from "vitest";

import { SeededRandom } from "@/assets/procedural/SeededRandom";

describe("SeededRandom", () => {
  it("produces the same sequence for the same seed", () => {
    const a = new SeededRandom(12345);
    const b = new SeededRandom(12345);

    const sequenceA = Array.from({ length: 50 }, () => a.nextFloat());
    const sequenceB = Array.from({ length: 50 }, () => b.nextFloat());

    expect(sequenceA).toEqual(sequenceB);
  });

  it("produces different sequences for different seeds", () => {
    const a = new SeededRandom(1);
    const b = new SeededRandom(2);

    const sequenceA = Array.from({ length: 20 }, () => a.nextFloat());
    const sequenceB = Array.from({ length: 20 }, () => b.nextFloat());

    expect(sequenceA).not.toEqual(sequenceB);
  });

  it("nextFloat() stays within [0, 1)", () => {
    const random = new SeededRandom(999);

    for (let i = 0; i < 1000; i += 1) {
      const value = random.nextFloat();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("range() respects bounds", () => {
    const random = new SeededRandom(42);

    for (let i = 0; i < 200; i += 1) {
      const value = random.range(-5, 5);
      expect(value).toBeGreaterThanOrEqual(-5);
      expect(value).toBeLessThan(5);
    }
  });

  it("integer() returns values within [min, max)", () => {
    const random = new SeededRandom(7);
    const seen = new Set<number>();

    for (let i = 0; i < 500; i += 1) {
      const value = random.integer(0, 4);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(4);
      seen.add(value);
    }

    expect(seen.size).toBe(4);
  });
});
