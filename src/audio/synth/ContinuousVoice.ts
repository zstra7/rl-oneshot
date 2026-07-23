/** Retro audio module spec section 14. */
export interface ContinuousAudioVoice {
  start(): void;
  setIntensity(value: number): void;
  stop(fadeSeconds?: number): void;
  dispose(): void;
  readonly isActive: boolean;
}

/**
 * A single persistent looping noise source (spec: "do not start a new
 * boost source every physics tick... maintain one stateful voice").
 * `start()`/`stop()` are idempotent — calling `start()` while already
 * active, or `stop()` while already inactive, is a safe no-op, matching
 * the spec's own test requirement ("repeated active events do not create
 * more voices").
 */
export class ContinuousNoiseVoice implements ContinuousAudioVoice {
  private source: AudioBufferSourceNode | null = null;
  private readonly gainNode: GainNode;
  private readonly filterNode: BiquadFilterNode;
  private active = false;
  private stopTimeoutHandle: ReturnType<typeof setTimeout> | null = null;

  public constructor(
    private readonly context: AudioContext,
    private readonly buffer: AudioBuffer,
    destination: AudioNode,
    private readonly baseFilterHz: number,
    private readonly peakGain: number
  ) {
    this.gainNode = context.createGain();
    this.gainNode.gain.value = 0;
    this.filterNode = context.createBiquadFilter();
    this.filterNode.type = "lowpass";
    this.filterNode.frequency.value = baseFilterHz;
    this.filterNode.connect(this.gainNode);
    this.gainNode.connect(destination);
  }

  public get isActive(): boolean {
    return this.active;
  }

  public start(): void {
    if (this.active) {
      return;
    }
    if (this.stopTimeoutHandle !== null) {
      clearTimeout(this.stopTimeoutHandle);
      this.stopTimeoutHandle = null;
    }

    this.source = this.context.createBufferSource();
    this.source.buffer = this.buffer;
    this.source.loop = true;
    this.source.connect(this.filterNode);

    const now = this.context.currentTime;
    this.gainNode.gain.cancelScheduledValues(now);
    this.gainNode.gain.setValueAtTime(0, now);
    this.gainNode.gain.linearRampToValueAtTime(this.peakGain, now + 0.04);

    this.source.start(now);
    this.active = true;
  }

  public setIntensity(value: number): void {
    if (!this.active) {
      return;
    }
    const clamped = Math.min(1, Math.max(0, value));
    const now = this.context.currentTime;
    this.gainNode.gain.setTargetAtTime(this.peakGain * (0.35 + clamped * 0.65), now, 0.05);
    this.filterNode.frequency.setTargetAtTime(this.baseFilterHz * (0.6 + clamped * 0.8), now, 0.08);
  }

  public stop(fadeSeconds = 0.05): void {
    if (!this.active) {
      return;
    }
    const now = this.context.currentTime;
    this.gainNode.gain.cancelScheduledValues(now);
    this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
    this.gainNode.gain.linearRampToValueAtTime(0, now + Math.max(fadeSeconds, 0.01));

    const source = this.source;
    this.active = false;
    this.source = null;

    this.stopTimeoutHandle = setTimeout(
      () => {
        try {
          source?.stop();
        } catch {
          // Already stopped — harmless.
        }
        source?.disconnect();
        this.stopTimeoutHandle = null;
      },
      Math.ceil(Math.max(fadeSeconds, 0.01) * 1000) + 20
    );
  }

  public dispose(): void {
    if (this.stopTimeoutHandle !== null) {
      clearTimeout(this.stopTimeoutHandle);
      this.stopTimeoutHandle = null;
    }
    try {
      this.source?.stop();
    } catch {
      // Already stopped.
    }
    this.source?.disconnect();
    this.source = null;
    this.active = false;
    this.filterNode.disconnect();
    this.gainNode.disconnect();
  }
}
