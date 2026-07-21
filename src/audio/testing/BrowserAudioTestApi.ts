import type { AudioDiagnostics, AudioGameEvent, AudioModule, AudioSettings } from "@/audio/AudioTypes";

/**
 * Trimmed from the retro audio module spec section 21 full
 * `BrowserAudioTestApi`: `getScheduleLog`/`clearScheduleLog`/
 * `advanceVirtualTime` (a full virtual-time scheduler abstraction) are
 * not implemented — `getDiagnostics().scheduledOneShots` is used as the
 * practical substitute for "inspect what was scheduled" in this
 * project's tests. See docs/audio-deviations.md.
 */
export interface BrowserAudioTestApi {
  ready(): boolean;
  resume(): Promise<void>;
  suspend(): Promise<void>;
  emit(event: AudioGameEvent): void;
  setSettings(settings: Partial<AudioSettings>): void;
  getDiagnostics(): AudioDiagnostics;
  stopAll(): void;
}

declare global {
  interface Window {
    __AUDIO_TEST__?: BrowserAudioTestApi;
  }
}

export function installAudioTestApi(audio: AudioModule): void {
  if (!(__DEV__ || __TEST_BUILD__)) {
    return;
  }

  const api: BrowserAudioTestApi = {
    ready: () => true,
    resume: () => audio.resumeFromUserGesture(),
    suspend: () => audio.suspend(),
    emit: (event) => audio.consumeEvent(event),
    setSettings: (settings) => audio.setSettings({ ...audio.getSettings(), ...settings }),
    getDiagnostics: () => audio.getDiagnostics(),
    stopAll: () => audio.stopAll()
  };

  window.__AUDIO_TEST__ = api;
}
