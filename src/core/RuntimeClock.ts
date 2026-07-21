const MAX_FRAME_DELTA_SECONDS = 0.25;

export class RuntimeClock {
  private lastTimestampMs: number | null = null;

  public computeFrameDelta(timestampMs: number): number {
    if (this.lastTimestampMs === null) {
      this.lastTimestampMs = timestampMs;
      return 0;
    }

    const deltaSeconds = (timestampMs - this.lastTimestampMs) / 1000;
    this.lastTimestampMs = timestampMs;

    return Math.max(0, Math.min(deltaSeconds, MAX_FRAME_DELTA_SECONDS));
  }

  public reset(): void {
    this.lastTimestampMs = null;
  }
}
