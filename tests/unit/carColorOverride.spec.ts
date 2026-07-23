import { describe, expect, it } from "vitest";

import { darkenHex, derivePlayerProfile } from "@/assets/cars/CarDescriptors";
import { DEFAULT_SETTINGS, validateSettings } from "@/stores/settingsStore";

describe("darkenHex (R12.2: multiplies each RGB channel by `factor`)", () => {
  it("multiplies each channel and rounds to the nearest integer", () => {
    // 0xff * 0.55 = 140.25 -> 140 = 0x8c; 0x00 stays 0x00.
    expect(darkenHex("#ff0000", 0.55)).toBe("#8c0000");
    expect(darkenHex("#00ff00", 0.55)).toBe("#008c00");
    expect(darkenHex("#0000ff", 0.55)).toBe("#00008c");
  });

  it("a factor of 1 is a no-op", () => {
    expect(darkenHex("#4ff0ff", 1)).toBe("#4ff0ff");
  });

  it("a factor of 0 goes fully black", () => {
    expect(darkenHex("#4ff0ff", 0)).toBe("#000000");
  });

  it("clamps rather than overflowing for a factor above 1", () => {
    expect(darkenHex("#808080", 2)).toBe("#ffffff");
  });

  it("is case-insensitive on input and lowercase on output", () => {
    expect(darkenHex("#4FF0FF", 0.55)).toBe(darkenHex("#4ff0ff", 0.55));
    expect(darkenHex("#4ff0ff", 0.55)).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("throws on a malformed hex string", () => {
    expect(() => darkenHex("not-a-color", 0.55)).toThrow();
    expect(() => darkenHex("#fff", 0.55)).toThrow();
  });
});

describe("derivePlayerProfile (R12.2: player TeamVisualProfile from a Customise Car body colour)", () => {
  it("uses the given hex for primary and emissive, and a darkened hex for secondary", () => {
    const profile = derivePlayerProfile("#ff8800");
    expect(profile.teamId).toBe("player");
    expect(profile.primary).toBe("#ff8800");
    expect(profile.emissive).toBe("#ff8800");
    expect(profile.secondary).toBe(darkenHex("#ff8800", 0.55));
    expect(profile.patternId).toBe("chevron-a");
  });

  it("secondary is strictly darker (lower luminance) than primary for a non-black colour", () => {
    const profile = derivePlayerProfile("#4ff0ff");
    const toLuma = (hex: string): number => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    expect(toLuma(profile.secondary as string)).toBeLessThan(toLuma(profile.primary as string));
  });
});

describe("settingsStore car section (R12.2: hex validation)", () => {
  it("defaults body/boost colour to the built-in player cyan", () => {
    expect(DEFAULT_SETTINGS.car.bodyColor).toBe("#4ff0ff");
    expect(DEFAULT_SETTINGS.car.boostColor).toBe("#4ff0ff");
  });

  it("returns the defaults for an empty/missing car section", () => {
    expect(validateSettings({}).car).toEqual(DEFAULT_SETTINGS.car);
    expect(validateSettings({ car: {} }).car).toEqual(DEFAULT_SETTINGS.car);
  });

  it("preserves a well-formed 6-digit hex value", () => {
    const result = validateSettings({ car: { bodyColor: "#ff8800", boostColor: "#00ff88" } });
    expect(result.car.bodyColor).toBe("#ff8800");
    expect(result.car.boostColor).toBe("#00ff88");
  });

  it("accepts uppercase hex digits (the /i flag)", () => {
    const result = validateSettings({ car: { bodyColor: "#FF8800" } });
    expect(result.car.bodyColor).toBe("#FF8800");
  });

  it("falls back to the default for a malformed value (field-by-field, not whole-section)", () => {
    const result = validateSettings({
      car: { bodyColor: "not-a-color", boostColor: "#fff" }
    });
    expect(result.car.bodyColor).toBe(DEFAULT_SETTINGS.car.bodyColor);
    expect(result.car.boostColor).toBe(DEFAULT_SETTINGS.car.boostColor);
  });

  it("falls back to the default for a non-string value", () => {
    const result = validateSettings({ car: { bodyColor: 12345 } });
    expect(result.car.bodyColor).toBe(DEFAULT_SETTINGS.car.bodyColor);
  });

  it("a valid bodyColor survives alongside an invalid boostColor independently", () => {
    const result = validateSettings({ car: { bodyColor: "#123abc", boostColor: "#zzzzzz" } });
    expect(result.car.bodyColor).toBe("#123abc");
    expect(result.car.boostColor).toBe(DEFAULT_SETTINGS.car.boostColor);
  });
});
