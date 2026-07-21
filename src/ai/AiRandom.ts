/**
 * AI spec section 8: a seeded PRNG so "same seed plus same observations
 * produces same decisions" — the AI module must never call
 * `Math.random()` directly. Mulberry32, the same algorithm the asset
 * pipeline's `SeededRandom` uses, kept as an independent local copy
 * rather than imported from `@/assets` to keep the AI module
 * self-contained (no cross-module dependency for a few lines of math).
 */
export class AiRandom {
  private state: number;

  public constructor(seed: number) {
    this.state = (seed >>> 0) || 1;
  }

  public nextFloat(): number {
    this.state |= 0;
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  public range(min: number, max: number): number {
    return min + this.nextFloat() * (max - min);
  }

  public chance(probability: number): boolean {
    return this.nextFloat() < probability;
  }
}
