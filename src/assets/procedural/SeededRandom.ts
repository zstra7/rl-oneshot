export interface ProceduralRandom {
  nextFloat(): number;
  range(min: number, max: number): number;
  integer(minInclusive: number, maxExclusive: number): number;
  chance(probability: number): boolean;
}

/**
 * Deterministic PRNG (mulberry32). Never use Math.random() for procedural
 * gameplay-visible content — see asset pipeline spec section 28.
 */
export class SeededRandom implements ProceduralRandom {
  private state: number;

  public constructor(seed: number) {
    this.state = seed >>> 0;
  }

  public nextFloat(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  public range(min: number, max: number): number {
    return min + this.nextFloat() * (max - min);
  }

  public integer(minInclusive: number, maxExclusive: number): number {
    return Math.floor(this.range(minInclusive, maxExclusive));
  }

  public chance(probability: number): boolean {
    return this.nextFloat() < probability;
  }
}

export function deriveSubSeed(
  baseSeed: number,
  eventTick: number,
  entityId: number,
  eventSequence: number
): number {
  return (
    (baseSeed ^ Math.imul(eventTick, 0x9e3779b1) ^
      Math.imul(entityId, 0x85ebca6b) ^
      Math.imul(eventSequence, 0xc2b2ae35)) >>>
    0
  );
}
