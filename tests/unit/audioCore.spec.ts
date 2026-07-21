import { describe, expect, it } from "vitest";

import { AudioCooldownRegistry } from "@/audio/AudioCooldownRegistry";
import { clampAudioSettings, DEFAULT_AUDIO_SETTINGS } from "@/audio/AudioTypes";

describe("AudioCooldownRegistry", () => {
  it("allows the first play for a fresh key", () => {
    const registry = new AudioCooldownRegistry();
    expect(registry.canPlay("ui-navigate", 0, 0.035)).toBe(true);
  });

  it("suppresses a repeat within the cooldown window", () => {
    const registry = new AudioCooldownRegistry();
    expect(registry.canPlay("ball-hit", 0, 0.03)).toBe(true);
    expect(registry.canPlay("ball-hit", 0.01, 0.03)).toBe(false);
  });

  it("allows a repeat once the cooldown window has elapsed", () => {
    const registry = new AudioCooldownRegistry();
    expect(registry.canPlay("ball-hit", 0, 0.03)).toBe(true);
    expect(registry.canPlay("ball-hit", 0.05, 0.03)).toBe(true);
  });

  it("merges a stronger event within the window, letting it play", () => {
    const registry = new AudioCooldownRegistry();
    expect(registry.canPlay("car-impact:a|b", 0, 0.08, 0.2)).toBe(true);
    expect(registry.canPlay("car-impact:a|b", 0.02, 0.08, 0.9)).toBe(true);
  });

  it("suppresses a weaker follow-up event within the window", () => {
    const registry = new AudioCooldownRegistry();
    expect(registry.canPlay("car-impact:a|b", 0, 0.08, 0.9)).toBe(true);
    expect(registry.canPlay("car-impact:a|b", 0.02, 0.08, 0.2)).toBe(false);
  });

  it("does not restart the cooldown timer when a stronger event merges in", () => {
    const registry = new AudioCooldownRegistry();
    expect(registry.canPlay("car-impact:a|b", 0, 0.08, 0.2)).toBe(true);
    expect(registry.canPlay("car-impact:a|b", 0.02, 0.08, 0.9)).toBe(true);
    // Still within 0.08s of the original t=0 play, and the previous merge
    // did not reset lastPlayedAt, so this should still be suppressed.
    expect(registry.canPlay("car-impact:a|b", 0.07, 0.08, 0.5)).toBe(false);
  });

  it("tracks distinct keys independently", () => {
    const registry = new AudioCooldownRegistry();
    expect(registry.canPlay("jump:car-a", 0, 0.05)).toBe(true);
    expect(registry.canPlay("jump:car-b", 0, 0.05)).toBe(true);
    expect(registry.size).toBe(2);
  });

  it("clears all tracked keys", () => {
    const registry = new AudioCooldownRegistry();
    registry.canPlay("jump:car-a", 0, 0.05);
    registry.clear();
    expect(registry.size).toBe(0);
  });
});

describe("clampAudioSettings", () => {
  it("falls back to defaults for missing fields", () => {
    expect(clampAudioSettings({})).toEqual(DEFAULT_AUDIO_SETTINGS);
  });

  it("clamps volumes above 1 down to 1", () => {
    const settings = clampAudioSettings({ masterVolume: 5, effectsVolume: 1.4, musicVolume: 2 });
    expect(settings.masterVolume).toBe(1);
    expect(settings.effectsVolume).toBe(1);
    expect(settings.musicVolume).toBe(1);
  });

  it("clamps volumes below 0 up to 0", () => {
    const settings = clampAudioSettings({ masterVolume: -1, effectsVolume: -0.5, musicVolume: -10 });
    expect(settings.masterVolume).toBe(0);
    expect(settings.effectsVolume).toBe(0);
    expect(settings.musicVolume).toBe(0);
  });

  it("treats non-finite volumes as 0", () => {
    const settings = clampAudioSettings({ masterVolume: Number.NaN });
    expect(settings.masterVolume).toBe(0);
  });

  it("preserves valid in-range values", () => {
    const settings = clampAudioSettings({ masterVolume: 0.42 });
    expect(settings.masterVolume).toBe(0.42);
  });

  it("passes through boolean flags", () => {
    const settings = clampAudioSettings({ enabled: false, musicEnabled: false });
    expect(settings.enabled).toBe(false);
    expect(settings.musicEnabled).toBe(false);
  });

  it("uses a custom base for fallback values", () => {
    const base = { ...DEFAULT_AUDIO_SETTINGS, masterVolume: 0.1 };
    const settings = clampAudioSettings({}, base);
    expect(settings.masterVolume).toBe(0.1);
  });
});
