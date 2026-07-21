import type {
  AudioGameEvent,
  AudioModule,
  AudioSettings
} from "@/audio/AudioModule";

/**
 * Unblocks integration before the real audio module (Phase 16) exists.
 * Accepts all calls and does nothing.
 */
export class NullAudioModule implements AudioModule {
  public initialise(): void {
    // No-op.
  }

  public dispose(): void {
    // No-op.
  }

  public setVolumes(_settings: AudioSettings): void {
    // No-op.
  }

  public consumeEvent(_event: AudioGameEvent): void {
    // No-op.
  }

  public async resumeAudioContextFromUserGesture(): Promise<void> {
    // No-op.
  }
}
