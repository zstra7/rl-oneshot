export const FIXED_DT_SECONDS = 1 / 120;

const MAX_FRAME_DELTA_SECONDS = 0.25;
const MAX_CATCH_UP_STEPS = 8;

export type FixedTickCallback = (tick: number) => void;

/**
 * Owns the single accumulator-driven fixed-step advance used by GameRuntime.
 * See core architecture spec section 24. Manual Playwright stepping bypasses
 * requestAnimationFrame entirely via stepOnce().
 */
export class FixedStepCoordinator {
  private accumulator = 0;
  private tickCount = 0;
  private droppedFixedTimeSecondsTotal = 0;

  public constructor(private readonly onFixedTick: FixedTickCallback) {}

  public advance(frameDelta: number): number {
    this.accumulator += Math.min(frameDelta, MAX_FRAME_DELTA_SECONDS);

    let steps = 0;

    while (
      this.accumulator >= FIXED_DT_SECONDS &&
      steps < MAX_CATCH_UP_STEPS
    ) {
      this.onFixedTick(this.tickCount);

      this.accumulator -= FIXED_DT_SECONDS;
      this.tickCount += 1;
      steps += 1;
    }

    if (steps === MAX_CATCH_UP_STEPS && this.accumulator >= FIXED_DT_SECONDS) {
      this.handleSpiralPrevention();
    }

    return steps;
  }

  public stepOnce(): void {
    this.onFixedTick(this.tickCount);
    this.tickCount += 1;
  }

  private handleSpiralPrevention(): void {
    this.droppedFixedTimeSecondsTotal += this.accumulator;
    this.accumulator = 0;
  }

  public get alpha(): number {
    return this.accumulator / FIXED_DT_SECONDS;
  }

  public get tick(): number {
    return this.tickCount;
  }

  public get accumulatorSeconds(): number {
    return this.accumulator;
  }

  public get droppedFixedTimeSeconds(): number {
    return this.droppedFixedTimeSecondsTotal;
  }

  public reset(): void {
    this.accumulator = 0;
    this.tickCount = 0;
    this.droppedFixedTimeSecondsTotal = 0;
  }
}
