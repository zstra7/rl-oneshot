export const FIXED_DT_SECONDS = 1 / 120;

const MAX_FRAME_DELTA_SECONDS = 0.25;
const MAX_CATCH_UP_STEPS = 8;

export type FixedTickCallback = (tick: number) => void;

/**
 * N1 (plan/ONLINE_MULTIPLAYER_PLAN.md): the seam deterministic lockstep
 * needs. Before advancing to a tick, the coordinator asks the gate
 * whether that tick may run. Single-player uses `ALWAYS_ADVANCE` (a
 * no-op, identical to the pre-N1 behaviour); online mode installs a gate
 * that only lets the sim advance to tick T once the remote peer's input
 * for T is in hand, so a missing input STALLS the shared timeline
 * instead of letting the two peers diverge.
 */
export interface TickAdvanceGate {
  canAdvance(tick: number): boolean;
}

export const ALWAYS_ADVANCE: TickAdvanceGate = {
  canAdvance: () => true
};

/**
 * Owns the single accumulator-driven fixed-step advance used by GameRuntime.
 * See core architecture spec section 24. Manual Playwright stepping bypasses
 * requestAnimationFrame entirely via stepOnce().
 */
export class FixedStepCoordinator {
  private accumulator = 0;
  private tickCount = 0;
  private droppedFixedTimeSecondsTotal = 0;
  private advanceGate: TickAdvanceGate = ALWAYS_ADVANCE;

  public constructor(private readonly onFixedTick: FixedTickCallback) {}

  /**
   * Swap the tick-advance gate. Online mode installs a lockstep gate here;
   * passing `ALWAYS_ADVANCE` (the default) restores single-player timing.
   */
  public setAdvanceGate(gate: TickAdvanceGate): void {
    this.advanceGate = gate;
  }

  public advance(frameDelta: number): number {
    this.accumulator += Math.min(frameDelta, MAX_FRAME_DELTA_SECONDS);

    let steps = 0;

    while (
      this.accumulator >= FIXED_DT_SECONDS &&
      steps < MAX_CATCH_UP_STEPS &&
      this.advanceGate.canAdvance(this.tickCount)
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
