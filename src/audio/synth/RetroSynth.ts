/** Retro audio module spec section 8. */
export interface ToneRequest {
  readonly oscillator: "sine" | "square" | "triangle" | "sawtooth";
  readonly frequencyStart: number;
  readonly frequencyEnd?: number;
  readonly durationSeconds: number;
  readonly gain: number;
  readonly attackSeconds: number;
  readonly releaseSeconds: number;
  readonly destination: AudioNode;
}

export interface NoiseRequest {
  readonly durationSeconds: number;
  readonly gain: number;
  readonly highpassHz?: number;
  readonly lowpassHz?: number;
  readonly destination: AudioNode;
}

export type SweepRequest = ToneRequest & { readonly frequencyEnd: number };

export interface ChordRequest {
  readonly oscillator: ToneRequest["oscillator"];
  readonly frequenciesHz: readonly number[];
  readonly durationSeconds: number;
  readonly gain: number;
  readonly attackSeconds: number;
  readonly releaseSeconds: number;
  readonly destination: AudioNode;
  /** Delay between successive notes, for an arpeggio; 0 (default) plays all notes together. */
  readonly staggerSeconds?: number;
}

export interface RetroSynth {
  tone(request: ToneRequest): void;
  noise(request: NoiseRequest): void;
  sweep(request: SweepRequest): void;
  chord(request: ChordRequest): void;
}

const MIN_GAIN = 0.0001;

function applyEnvelope(
  gainNode: GainNode,
  startTime: number,
  peakGain: number,
  attackSeconds: number,
  sustainSeconds: number,
  releaseSeconds: number
): void {
  const attack = Math.max(attackSeconds, 0.001);
  const release = Math.max(releaseSeconds, 0.001);
  const peak = Math.max(peakGain, MIN_GAIN);

  const g = gainNode.gain;
  g.cancelScheduledValues(startTime);
  g.setValueAtTime(MIN_GAIN, startTime);
  g.exponentialRampToValueAtTime(peak, startTime + attack);
  g.setValueAtTime(peak, startTime + attack + Math.max(sustainSeconds, 0));
  g.exponentialRampToValueAtTime(MIN_GAIN, startTime + attack + Math.max(sustainSeconds, 0) + release);
}

/** Deterministic (not `Math.random()`) so the shared noise buffer is stable across contexts. */
function createNoiseBuffer(context: AudioContext): AudioBuffer {
  const length = Math.max(1, Math.floor(context.sampleRate * 2));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);

  let state = 0x9e3779b9;
  for (let i = 0; i < length; i += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    data[i] = ((state >>> 0) / 0xffffffff) * 2 - 1;
  }
  return buffer;
}

/**
 * Real `AudioContext`-backed implementation of `RetroSynth`. Only usable
 * in a real browser (Playwright) — Vitest's Node environment has no Web
 * Audio API, so unit tests exercise `AudioCooldownRegistry`/
 * `clampAudioSettings`/`RetroAudioModule`'s event-routing decisions
 * instead (see docs/audio-deviations.md).
 */
export class WebAudioRetroSynth implements RetroSynth {
  private readonly noiseBuffer: AudioBuffer;

  public constructor(private readonly context: AudioContext) {
    this.noiseBuffer = createNoiseBuffer(context);
  }

  /** Exposed so continuous voices (`ContinuousNoiseVoice`) can loop the same shared buffer rather than allocating their own. */
  public getNoiseBuffer(): AudioBuffer {
    return this.noiseBuffer;
  }

  public tone(request: ToneRequest): void {
    this.playToneAt(request, this.context.currentTime);
  }

  public sweep(request: SweepRequest): void {
    this.playToneAt(request, this.context.currentTime);
  }

  private playToneAt(request: ToneRequest, startTime: number): void {
    const osc = this.context.createOscillator();
    osc.type = request.oscillator;
    osc.frequency.setValueAtTime(Math.max(request.frequencyStart, 1), startTime);
    if (request.frequencyEnd !== undefined && request.frequencyEnd !== request.frequencyStart) {
      osc.frequency.linearRampToValueAtTime(Math.max(request.frequencyEnd, 1), startTime + request.durationSeconds);
    }

    const gainNode = this.context.createGain();
    applyEnvelope(gainNode, startTime, request.gain, request.attackSeconds, request.durationSeconds, request.releaseSeconds);

    osc.connect(gainNode);
    gainNode.connect(request.destination);

    const stopTime = startTime + request.durationSeconds + request.releaseSeconds + 0.05;
    osc.start(startTime);
    osc.stop(stopTime);
    osc.onended = () => {
      osc.disconnect();
      gainNode.disconnect();
    };
  }

  public noise(request: NoiseRequest): void {
    const startTime = this.context.currentTime;
    const source = this.context.createBufferSource();
    source.buffer = this.noiseBuffer;

    let node: AudioNode = source;
    if (request.highpassHz !== undefined) {
      const highpass = this.context.createBiquadFilter();
      highpass.type = "highpass";
      highpass.frequency.value = request.highpassHz;
      node.connect(highpass);
      node = highpass;
    }
    if (request.lowpassHz !== undefined) {
      const lowpass = this.context.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.frequency.value = request.lowpassHz;
      node.connect(lowpass);
      node = lowpass;
    }

    const gainNode = this.context.createGain();
    applyEnvelope(gainNode, startTime, request.gain, 0.005, request.durationSeconds, 0.03);
    node.connect(gainNode);
    gainNode.connect(request.destination);

    const stopTime = startTime + request.durationSeconds + 0.08;
    source.start(startTime);
    source.stop(stopTime);
    source.onended = () => {
      source.disconnect();
      gainNode.disconnect();
    };
  }

  public chord(request: ChordRequest): void {
    const stagger = request.staggerSeconds ?? 0;
    request.frequenciesHz.forEach((frequency, index) => {
      this.playToneAt(
        {
          oscillator: request.oscillator,
          frequencyStart: frequency,
          durationSeconds: request.durationSeconds,
          gain: request.gain,
          attackSeconds: request.attackSeconds,
          releaseSeconds: request.releaseSeconds,
          destination: request.destination
        },
        this.context.currentTime + stagger * index
      );
    });
  }
}
