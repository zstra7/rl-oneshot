import { AudioCooldownRegistry } from "@/audio/AudioCooldownRegistry";
import type {
  AudioDiagnostics,
  AudioGameEvent,
  AudioModule,
  AudioSettings,
  AudioUpdateFrame,
  MusicState
} from "@/audio/AudioTypes";
import { clampAudioSettings, DEFAULT_AUDIO_SETTINGS } from "@/audio/AudioTypes";
import { ContinuousNoiseVoice, type ContinuousAudioVoice } from "@/audio/synth/ContinuousVoice";
import { WebAudioRetroSynth } from "@/audio/synth/RetroSynth";

const GAIN_RAMP_SECONDS = 0.05;

function getAudioContextCtor(): typeof AudioContext | undefined {
  const globalWindow = window as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  return globalWindow.AudioContext ?? globalWindow.webkitAudioContext;
}

interface AudioGraph {
  readonly context: AudioContext;
  readonly masterGain: GainNode;
  readonly effectsMasterGain: GainNode;
  readonly musicMasterGain: GainNode;
  readonly uiBus: GainNode;
  readonly vehicleBus: GainNode;
  readonly impactBus: GainNode;
  readonly matchBus: GainNode;
}

function buildGraph(context: AudioContext): AudioGraph {
  const masterGain = context.createGain();
  masterGain.connect(context.destination);

  const effectsMasterGain = context.createGain();
  effectsMasterGain.connect(masterGain);

  const musicMasterGain = context.createGain();
  musicMasterGain.connect(masterGain);

  const uiBus = context.createGain();
  const vehicleBus = context.createGain();
  const impactBus = context.createGain();
  const matchBus = context.createGain();
  uiBus.connect(effectsMasterGain);
  vehicleBus.connect(effectsMasterGain);
  impactBus.connect(effectsMasterGain);
  matchBus.connect(effectsMasterGain);

  return { context, masterGain, effectsMasterGain, musicMasterGain, uiBus, vehicleBus, impactBus, matchBus };
}

/** Retro audio module spec section 12: `minGain + intensity^2 * (maxGain - minGain)`, never raw impulse -> gain. */
function intensityGain(intensity: number, minGain: number, maxGain: number): number {
  const clamped = Math.min(1, Math.max(0, intensity));
  return minGain + clamped * clamped * (maxGain - minGain);
}

/**
 * The real `AudioModule` (Master Brief Phase 16), replacing
 * `NullAudioModule` once constructed. Implements retro audio module spec
 * sections 1-16, 20 in full and section 21 (browser test API) via
 * `installAudioTestApi`; procedural music (section 10) is deferred — see
 * docs/audio-deviations.md.
 */
export class RetroAudioModule implements AudioModule {
  private graph: AudioGraph | null = null;
  private synth: WebAudioRetroSynth | null = null;
  private settings: AudioSettings = { ...DEFAULT_AUDIO_SETTINGS };
  private readonly cooldowns = new AudioCooldownRegistry();
  private readonly continuousVoices = new Map<string, ContinuousAudioVoice>();
  private scheduledOneShots = 0;
  private musicState: MusicState = "silent";
  private lastError: string | null = null;
  private supported = true;

  public async initialise(): Promise<void> {
    const ContextCtor = getAudioContextCtor();
    if (!ContextCtor) {
      this.supported = false;
      return;
    }

    try {
      const context = new ContextCtor();
      this.graph = buildGraph(context);
      this.synth = new WebAudioRetroSynth(context);
      this.applyGainsToGraph();
    } catch (error) {
      this.supported = false;
      this.lastError = String(error instanceof Error ? error.message : error);
    }
  }

  public async resumeFromUserGesture(): Promise<void> {
    if (!this.graph) {
      return;
    }
    try {
      await this.graph.context.resume();
    } catch (error) {
      this.lastError = String(error instanceof Error ? error.message : error);
    }
  }

  public async suspend(): Promise<void> {
    if (!this.graph) {
      return;
    }
    try {
      await this.graph.context.suspend();
    } catch (error) {
      this.lastError = String(error instanceof Error ? error.message : error);
    }
  }

  public setSettings(settings: AudioSettings): void {
    this.settings = clampAudioSettings(settings);
    this.applyGainsToGraph();
  }

  public getSettings(): AudioSettings {
    return this.settings;
  }

  private applyGainsToGraph(): void {
    if (!this.graph) {
      return;
    }
    const now = this.graph.context.currentTime;
    const masterTarget = this.settings.enabled ? this.settings.masterVolume : 0;
    const musicTarget = this.settings.musicEnabled ? this.settings.musicVolume : 0;

    this.graph.masterGain.gain.setTargetAtTime(masterTarget, now, GAIN_RAMP_SECONDS);
    this.graph.effectsMasterGain.gain.setTargetAtTime(this.settings.effectsVolume, now, GAIN_RAMP_SECONDS);
    this.graph.musicMasterGain.gain.setTargetAtTime(musicTarget, now, GAIN_RAMP_SECONDS);
  }

  public consumeEvent(event: AudioGameEvent): void {
    if (!this.graph || !this.synth) {
      return;
    }
    const graph = this.graph;
    const synth = this.synth;
    const now = graph.context.currentTime;

    switch (event.type) {
      case "audio:ui-navigate": {
        if (!this.cooldowns.canPlay("ui-navigate", now, 0.035)) {
          return;
        }
        const shift = event.direction === "left" || event.direction === "up" ? -60 : 0;
        synth.tone({
          oscillator: "square",
          frequencyStart: 800 + shift,
          durationSeconds: 0.03,
          gain: 0.22,
          attackSeconds: 0.002,
          releaseSeconds: 0.02,
          destination: graph.uiBus
        });
        this.scheduledOneShots += 1;
        return;
      }
      case "audio:ui-confirm": {
        synth.tone({
          oscillator: "square",
          frequencyStart: 520,
          frequencyEnd: 780,
          durationSeconds: 0.1,
          gain: 0.25,
          attackSeconds: 0.004,
          releaseSeconds: 0.03,
          destination: graph.uiBus
        });
        this.scheduledOneShots += 1;
        return;
      }
      case "audio:ui-cancel": {
        synth.tone({
          oscillator: "square",
          frequencyStart: 480,
          frequencyEnd: 300,
          durationSeconds: 0.11,
          gain: 0.22,
          attackSeconds: 0.004,
          releaseSeconds: 0.03,
          destination: graph.uiBus
        });
        this.scheduledOneShots += 1;
        return;
      }
      case "audio:countdown": {
        if (event.value === "GO") {
          synth.chord({
            oscillator: "square",
            frequenciesHz: [660, 990],
            durationSeconds: 0.28,
            gain: 0.28,
            attackSeconds: 0.005,
            releaseSeconds: 0.08,
            destination: graph.matchBus
          });
        } else {
          synth.tone({
            oscillator: "triangle",
            frequencyStart: 440,
            durationSeconds: 0.14,
            gain: 0.24,
            attackSeconds: 0.004,
            releaseSeconds: 0.05,
            destination: graph.matchBus
          });
        }
        this.scheduledOneShots += 1;
        return;
      }
      case "audio:jump": {
        synth.sweep({
          oscillator: "triangle",
          frequencyStart: 160,
          frequencyEnd: 430,
          durationSeconds: 0.1,
          gain: 0.3,
          attackSeconds: 0.003,
          releaseSeconds: 0.04,
          destination: graph.vehicleBus
        });
        synth.noise({ durationSeconds: 0.02, gain: 0.12, highpassHz: 2000, destination: graph.vehicleBus });
        this.scheduledOneShots += 1;
        return;
      }
      case "audio:dodge": {
        synth.sweep({
          oscillator: "square",
          frequencyStart: 120,
          frequencyEnd: 500,
          durationSeconds: 0.13,
          gain: 0.34,
          attackSeconds: 0.002,
          releaseSeconds: 0.05,
          destination: graph.vehicleBus
        });
        synth.tone({
          oscillator: "sine",
          frequencyStart: 90,
          durationSeconds: 0.09,
          gain: 0.2,
          attackSeconds: 0.002,
          releaseSeconds: 0.05,
          destination: graph.vehicleBus
        });
        this.scheduledOneShots += 1;
        return;
      }
      case "audio:boost-state": {
        this.handleContinuousVoice(
          `boost:${event.carId}`,
          event.active,
          () => new ContinuousNoiseVoice(graph.context, this.sharedNoiseBuffer(), graph.vehicleBus, 1800, 0.22),
          () => {
            synth.tone({
              oscillator: "sawtooth",
              frequencyStart: 220,
              frequencyEnd: 340,
              durationSeconds: 0.08,
              gain: 0.2,
              attackSeconds: 0.002,
              releaseSeconds: 0.03,
              destination: graph.vehicleBus
            });
          }
        );
        return;
      }
      case "audio:powerslide-state": {
        this.handleContinuousVoice(
          `powerslide:${event.carId}`,
          event.active,
          () => new ContinuousNoiseVoice(graph.context, this.sharedNoiseBuffer(), graph.vehicleBus, 900, 0.15),
          undefined,
          event.active ? Math.min(1, event.slipAmount) : undefined
        );
        return;
      }
      case "audio:engine-state": {
        // WS7.E: speed-scaled continuous hum, player car only.
        this.handleContinuousVoice(
          `engine:${event.carId}`,
          event.active,
          () => new ContinuousNoiseVoice(graph.context, this.sharedNoiseBuffer(), graph.vehicleBus, 320, 0.07),
          undefined,
          event.active ? Math.min(1, event.speed / 23) : undefined
        );
        return;
      }
      case "audio:ball-hit": {
        const key = "ball-hit";
        if (!this.cooldowns.canPlay(key, now, 0.03, event.intensity)) {
          return;
        }
        const gain = intensityGain(event.intensity, 0.15, 0.4);
        synth.tone({
          oscillator: "triangle",
          frequencyStart: 220 - event.intensity * 40,
          durationSeconds: 0.06 + event.intensity * 0.04,
          gain,
          attackSeconds: 0.002,
          releaseSeconds: 0.05,
          destination: graph.impactBus
        });
        synth.noise({ durationSeconds: 0.03, gain: gain * 0.6, highpassHz: 1500, destination: graph.impactBus });
        this.scheduledOneShots += 1;
        return;
      }
      case "audio:car-impact": {
        const key = `car-impact:${[...event.carIds].sort().join(",")}`;
        if (!this.cooldowns.canPlay(key, now, 0.08, event.intensity)) {
          return;
        }
        const gain = intensityGain(event.intensity, 0.15, 0.38);
        synth.tone({
          oscillator: "square",
          frequencyStart: 110,
          durationSeconds: 0.09,
          gain,
          attackSeconds: 0.002,
          releaseSeconds: 0.06,
          destination: graph.impactBus
        });
        synth.noise({ durationSeconds: 0.06, gain: gain * 0.8, lowpassHz: 2500, destination: graph.impactBus });
        this.scheduledOneShots += 1;
        return;
      }
      case "audio:boost-pad-pickup": {
        if (event.padType === "small") {
          synth.sweep({
            oscillator: "square",
            frequencyStart: 900,
            frequencyEnd: 1200,
            durationSeconds: 0.07,
            gain: 0.22,
            attackSeconds: 0.002,
            releaseSeconds: 0.03,
            destination: graph.vehicleBus
          });
        } else {
          synth.chord({
            oscillator: "square",
            frequenciesHz: [500, 750, 1000],
            durationSeconds: 0.16,
            gain: 0.26,
            attackSeconds: 0.002,
            releaseSeconds: 0.05,
            destination: graph.vehicleBus,
            staggerSeconds: 0.045
          });
        }
        this.scheduledOneShots += 1;
        return;
      }
      case "audio:boost-pad-respawn": {
        if (!event.nearPlayer) {
          return;
        }
        if (!this.cooldowns.canPlay(`pad-respawn:${event.padId}`, now, 0.5)) {
          return;
        }
        synth.tone({
          oscillator: "sine",
          frequencyStart: 600,
          frequencyEnd: 500,
          durationSeconds: 0.09,
          gain: 0.1,
          attackSeconds: 0.01,
          releaseSeconds: 0.05,
          destination: graph.vehicleBus
        });
        this.scheduledOneShots += 1;
        return;
      }
      case "audio:goal": {
        synth.chord({
          oscillator: "square",
          frequenciesHz: [330, 440, 550, 660],
          durationSeconds: 0.5,
          gain: 0.3,
          attackSeconds: 0.006,
          releaseSeconds: 0.4,
          destination: graph.matchBus,
          staggerSeconds: 0.09
        });
        synth.noise({ durationSeconds: 0.2, gain: 0.18, highpassHz: 800, destination: graph.matchBus });
        this.duckMusic(0.3, 1.0);
        this.scheduledOneShots += 1;
        return;
      }
      case "audio:overtime": {
        synth.sweep({
          oscillator: "triangle",
          frequencyStart: 420,
          frequencyEnd: 620,
          durationSeconds: 0.35,
          gain: 0.26,
          attackSeconds: 0.01,
          releaseSeconds: 0.1,
          destination: graph.matchBus
        });
        this.musicState = "overtime";
        this.duckMusic(0.5, 0.5);
        this.scheduledOneShots += 1;
        return;
      }
      case "audio:match-end": {
        const ascending = event.winner === "player";
        const frequencies = ascending ? [440, 550, 660, 880] : [660, 550, 440, 330];
        synth.chord({
          oscillator: "triangle",
          frequenciesHz: frequencies,
          durationSeconds: 0.3,
          gain: 0.28,
          attackSeconds: 0.006,
          releaseSeconds: 0.15,
          destination: graph.matchBus,
          staggerSeconds: 0.12
        });
        this.musicState = "results";
        this.stopContinuousVoicesMatching(() => true);
        this.scheduledOneShots += 1;
        return;
      }
    }
  }

  private sharedNoiseBuffer(): AudioBuffer {
    return this.synth!.getNoiseBuffer();
  }

  private handleContinuousVoice(
    key: string,
    active: boolean,
    factory: () => ContinuousAudioVoice,
    onActivate?: () => void,
    intensity?: number
  ): void {
    let voice = this.continuousVoices.get(key);

    if (active) {
      if (!voice) {
        voice = factory();
        this.continuousVoices.set(key, voice);
      }
      if (!voice.isActive) {
        voice.start();
        onActivate?.();
      }
      if (intensity !== undefined) {
        voice.setIntensity(intensity);
      }
    } else if (voice?.isActive) {
      voice.stop(0.06);
    }
  }

  private stopContinuousVoicesMatching(predicate: (key: string) => boolean): void {
    for (const [key, voice] of this.continuousVoices) {
      if (predicate(key) && voice.isActive) {
        voice.stop(0.08);
      }
    }
  }

  private duckMusic(_toFraction: number, _forSeconds: number): void {
    // Music sequencer is deferred (docs/audio-deviations.md) — nothing to
    // duck yet. Kept as a real call site so wiring music in later needs
    // no call-site changes, just a real implementation here.
  }

  public update(frame: AudioUpdateFrame): void {
    if (!this.graph) {
      return;
    }
    if (frame.matchPaused || !frame.windowFocused) {
      this.stopContinuousVoicesMatching(
        (key) => key.startsWith("boost:") || key.startsWith("powerslide:") || key.startsWith("engine:")
      );
    }
  }

  public stopAll(): void {
    for (const voice of this.continuousVoices.values()) {
      voice.dispose();
    }
    this.continuousVoices.clear();
    this.cooldowns.clear();
  }

  public getDiagnostics(): AudioDiagnostics {
    const activeVoices = [...this.continuousVoices.entries()]
      .filter(([, voice]) => voice.isActive)
      .map(([key]) => key);

    return {
      supported: this.supported,
      contextState: this.graph?.context.state ?? "unavailable",
      awaitingUserGesture: this.graph?.context.state === "suspended",
      activeContinuousVoices: activeVoices,
      scheduledOneShots: this.scheduledOneShots,
      cooldownCount: this.cooldowns.size,
      musicState: this.musicState,
      settings: this.settings,
      lastError: this.lastError
    };
  }

  public dispose(): void {
    this.stopAll();
    if (this.graph) {
      this.graph.masterGain.disconnect();
      this.graph.effectsMasterGain.disconnect();
      this.graph.musicMasterGain.disconnect();
      this.graph.uiBus.disconnect();
      this.graph.vehicleBus.disconnect();
      this.graph.impactBus.disconnect();
      this.graph.matchBus.disconnect();
      void this.graph.context.close().catch(() => undefined);
    }
    this.graph = null;
    this.synth = null;
  }
}
