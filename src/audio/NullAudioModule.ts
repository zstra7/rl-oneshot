import type {
  AudioDiagnostics,
  AudioGameEvent,
  AudioModule,
  AudioSettings,
  AudioUpdateFrame
} from "@/audio/AudioTypes";
import { DEFAULT_AUDIO_SETTINGS } from "@/audio/AudioTypes";

/**
 * Deliberately stays a no-op `AudioModule` even after Phase 16: the real
 * `RetroAudioModule` (`src/audio/RetroAudioModule.ts`) is constructed and
 * initialised directly by `GameRuntime` (same pattern as
 * `NullCameraModule`/`ChaseCameraController` and
 * `NullVfxModule`/`VfxModule`) since it needs an explicit user-gesture
 * resume hook wired to real UI interactions. This slot exists only so
 * `ModuleContainer`'s generic `Object.values(this.modules).dispose()`
 * loop in `GameRuntime` has something safe to call before that real
 * instance exists.
 */
export class NullAudioModule implements AudioModule {
  public async initialise(): Promise<void> {
    // No-op.
  }

  public dispose(): void {
    // No-op.
  }

  public async resumeFromUserGesture(): Promise<void> {
    // No-op.
  }

  public async suspend(): Promise<void> {
    // No-op.
  }

  public setSettings(_settings: AudioSettings): void {
    // No-op.
  }

  public getSettings(): AudioSettings {
    return DEFAULT_AUDIO_SETTINGS;
  }

  public consumeEvent(_event: AudioGameEvent): void {
    // No-op.
  }

  public update(_frame: AudioUpdateFrame): void {
    // No-op.
  }

  public stopAll(): void {
    // No-op.
  }

  public getDiagnostics(): AudioDiagnostics {
    return {
      supported: false,
      contextState: "unavailable",
      awaitingUserGesture: false,
      activeContinuousVoices: [],
      scheduledOneShots: 0,
      cooldownCount: 0,
      musicState: "silent",
      settings: DEFAULT_AUDIO_SETTINGS,
      lastError: null
    };
  }
}
