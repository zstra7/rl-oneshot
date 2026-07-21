import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS, validateSettings } from "@/stores/settingsStore";

describe("validateSettings (settings spec section 25: \"validate loaded settings and fall back safely\")", () => {
  it("returns the defaults for undefined/null/non-object input", () => {
    expect(validateSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(validateSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(validateSettings("garbage")).toEqual(DEFAULT_SETTINGS);
    expect(validateSettings(42)).toEqual(DEFAULT_SETTINGS);
  });

  it("returns the defaults for an empty object", () => {
    expect(validateSettings({})).toEqual(DEFAULT_SETTINGS);
  });

  it("preserves valid fields and falls back individually for invalid ones (partial corruption)", () => {
    const result = validateSettings({
      gameplay: { defaultDurationMinutes: 10, cameraShakeEnabled: "not-a-boolean" },
      graphics: { preset: "authentic" },
      accessibility: { reducedJitter: true, disableDithering: "nonsense" }
    });

    expect(result.gameplay.defaultDurationMinutes).toBe(10);
    expect(result.gameplay.cameraShakeEnabled).toBe(DEFAULT_SETTINGS.gameplay.cameraShakeEnabled);
    expect(result.graphics.preset).toBe("authentic");
    expect(result.accessibility.reducedJitter).toBe(true);
    expect(result.accessibility.disableDithering).toBe(DEFAULT_SETTINGS.accessibility.disableDithering);
  });

  it("rejects an out-of-range enum value and falls back to the default", () => {
    const result = validateSettings({
      gameplay: { defaultDurationMinutes: 7 }, // not 1 | 3 | 10
      graphics: { preset: "ultra-realistic" } // not a real VisualPreset
    });
    expect(result.gameplay.defaultDurationMinutes).toBe(DEFAULT_SETTINGS.gameplay.defaultDurationMinutes);
    expect(result.graphics.preset).toBe(DEFAULT_SETTINGS.graphics.preset);
  });

  it("clamps out-of-range numeric fields instead of rejecting them outright", () => {
    const result = validateSettings({
      camera: { fov: 999, distance: -50 },
      audio: { master: 5, music: -1 }
    });
    expect(result.camera.fov).toBe(110);
    expect(result.camera.distance).toBe(0.7);
    expect(result.audio.master).toBe(1);
    expect(result.audio.music).toBe(0);
  });

  it("always stamps the current schema version regardless of input", () => {
    expect(validateSettings({ schemaVersion: 99 }).schemaVersion).toBe(1);
    expect(validateSettings({}).schemaVersion).toBe(1);
  });

  it("is idempotent — validating already-valid settings returns an equivalent object", () => {
    const once = validateSettings({ graphics: { preset: "clean" } });
    const twice = validateSettings(once);
    expect(twice).toEqual(once);
  });
});
