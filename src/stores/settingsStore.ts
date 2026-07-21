import { defineStore } from "pinia";

import type { VisualPreset } from "@/assets/procedural/ProceduralAssetContext";
import type { MatchDurationMinutes } from "@/game-flow/MatchFlowTypes";

const STORAGE_KEY = "space-carball-settings-v1";
const SCHEMA_VERSION = 1;

export type DensityLevel = "low" | "normal" | "high";
export type CelebrationIntensity = "low" | "normal" | "high";

export interface AppSettings {
  readonly schemaVersion: 1;
  readonly gameplay: {
    readonly defaultDurationMinutes: MatchDurationMinutes;
    readonly cameraShakeEnabled: boolean;
    readonly goalCelebrationIntensity: CelebrationIntensity;
  };
  readonly camera: {
    readonly fov: number;
    readonly distance: number;
    readonly height: number;
    readonly stiffness: number;
    readonly ballLookStrength: number;
    readonly shakeIntensity: number;
  };
  readonly graphics: {
    readonly preset: VisualPreset;
    readonly particleDensity: DensityLevel;
    readonly starDensity: DensityLevel;
    readonly glowEnabled: boolean;
    readonly fullscreen: boolean;
  };
  readonly audio: {
    readonly enabled: boolean;
    readonly master: number;
    readonly music: number;
    readonly musicEnabled: boolean;
    readonly effects: number;
    readonly ui: number;
  };
  readonly accessibility: {
    readonly reducedShake: boolean;
    readonly reducedFlashes: boolean;
    readonly reducedJitter: boolean;
    readonly highContrastBall: boolean;
    readonly teamPatternMode: boolean;
    readonly largerHud: boolean;
    readonly disableDithering: boolean;
  };
}

export const DEFAULT_SETTINGS: AppSettings = {
  schemaVersion: SCHEMA_VERSION,
  gameplay: {
    defaultDurationMinutes: 3,
    cameraShakeEnabled: true,
    goalCelebrationIntensity: "normal"
  },
  camera: {
    // WS4.B (plan/POLISH_OVERHAUL_PLAN.md): fov is an absolute vertical
    // FOV matching CHASE_CAMERA_CONSTANTS.fov; distance/height/stiffness
    // are multipliers on the base rig (1.0 = unmodified).
    fov: 77,
    distance: 1,
    height: 1,
    stiffness: 1,
    ballLookStrength: 0.5,
    shakeIntensity: 1
  },
  graphics: {
    preset: "balanced",
    particleDensity: "normal",
    starDensity: "normal",
    glowEnabled: true,
    fullscreen: false
  },
  audio: {
    enabled: true,
    master: 0.8,
    music: 0.35,
    musicEnabled: true,
    effects: 0.85,
    ui: 0.8
  },
  accessibility: {
    reducedShake: false,
    reducedFlashes: false,
    reducedJitter: false,
    highContrastBall: false,
    teamPatternMode: false,
    largerHud: false,
    disableDithering: false
  }
};

const DURATIONS: readonly MatchDurationMinutes[] = [1, 3, 10];
const VISUAL_PRESETS: readonly VisualPreset[] = ["authentic", "balanced", "clean"];
const DENSITY_LEVELS: readonly DensityLevel[] = ["low", "normal", "high"];
const CELEBRATION_INTENSITIES: readonly CelebrationIntensity[] = ["low", "normal", "high"];

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function pickEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function pickNumericEnum<T extends number>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "number" && (allowed as readonly number[]).includes(value) ? (value as T) : fallback;
}

/**
 * Settings spec section 25: "Validate loaded settings and fall back
 * safely." Every field is individually sanitised against
 * `DEFAULT_SETTINGS` rather than trusting the parsed JSON shape wholesale
 * — a corrupted/edited/older-schema `localStorage` value degrades field
 * by field instead of discarding the whole settings object.
 */
export function validateSettings(raw: unknown): AppSettings {
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const gameplay = (input["gameplay"] ?? {}) as Record<string, unknown>;
  const camera = (input["camera"] ?? {}) as Record<string, unknown>;
  const graphics = (input["graphics"] ?? {}) as Record<string, unknown>;
  const audio = (input["audio"] ?? {}) as Record<string, unknown>;
  const accessibility = (input["accessibility"] ?? {}) as Record<string, unknown>;

  return {
    schemaVersion: SCHEMA_VERSION,
    gameplay: {
      defaultDurationMinutes: pickNumericEnum(
        gameplay["defaultDurationMinutes"],
        DURATIONS,
        DEFAULT_SETTINGS.gameplay.defaultDurationMinutes
      ),
      cameraShakeEnabled: isBoolean(gameplay["cameraShakeEnabled"])
        ? gameplay["cameraShakeEnabled"]
        : DEFAULT_SETTINGS.gameplay.cameraShakeEnabled,
      goalCelebrationIntensity: pickEnum(
        gameplay["goalCelebrationIntensity"],
        CELEBRATION_INTENSITIES,
        DEFAULT_SETTINGS.gameplay.goalCelebrationIntensity
      )
    },
    camera: {
      fov: clampNumber(camera["fov"], 65, 90, DEFAULT_SETTINGS.camera.fov),
      distance: clampNumber(camera["distance"], 0.7, 1.6, DEFAULT_SETTINGS.camera.distance),
      height: clampNumber(camera["height"], 0.6, 1.8, DEFAULT_SETTINGS.camera.height),
      stiffness: clampNumber(camera["stiffness"], 0.4, 2.0, DEFAULT_SETTINGS.camera.stiffness),
      ballLookStrength: clampNumber(camera["ballLookStrength"], 0, 1, DEFAULT_SETTINGS.camera.ballLookStrength),
      shakeIntensity: clampNumber(camera["shakeIntensity"], 0, 2, DEFAULT_SETTINGS.camera.shakeIntensity)
    },
    graphics: {
      preset: pickEnum(graphics["preset"], VISUAL_PRESETS, DEFAULT_SETTINGS.graphics.preset),
      particleDensity: pickEnum(
        graphics["particleDensity"],
        DENSITY_LEVELS,
        DEFAULT_SETTINGS.graphics.particleDensity
      ),
      starDensity: pickEnum(graphics["starDensity"], DENSITY_LEVELS, DEFAULT_SETTINGS.graphics.starDensity),
      glowEnabled: isBoolean(graphics["glowEnabled"]) ? graphics["glowEnabled"] : DEFAULT_SETTINGS.graphics.glowEnabled,
      fullscreen: isBoolean(graphics["fullscreen"]) ? graphics["fullscreen"] : DEFAULT_SETTINGS.graphics.fullscreen
    },
    audio: {
      enabled: isBoolean(audio["enabled"]) ? audio["enabled"] : DEFAULT_SETTINGS.audio.enabled,
      master: clampNumber(audio["master"], 0, 1, DEFAULT_SETTINGS.audio.master),
      music: clampNumber(audio["music"], 0, 1, DEFAULT_SETTINGS.audio.music),
      musicEnabled: isBoolean(audio["musicEnabled"]) ? audio["musicEnabled"] : DEFAULT_SETTINGS.audio.musicEnabled,
      effects: clampNumber(audio["effects"], 0, 1, DEFAULT_SETTINGS.audio.effects),
      ui: clampNumber(audio["ui"], 0, 1, DEFAULT_SETTINGS.audio.ui)
    },
    accessibility: {
      reducedShake: isBoolean(accessibility["reducedShake"])
        ? accessibility["reducedShake"]
        : DEFAULT_SETTINGS.accessibility.reducedShake,
      reducedFlashes: isBoolean(accessibility["reducedFlashes"])
        ? accessibility["reducedFlashes"]
        : DEFAULT_SETTINGS.accessibility.reducedFlashes,
      reducedJitter: isBoolean(accessibility["reducedJitter"])
        ? accessibility["reducedJitter"]
        : DEFAULT_SETTINGS.accessibility.reducedJitter,
      highContrastBall: isBoolean(accessibility["highContrastBall"])
        ? accessibility["highContrastBall"]
        : DEFAULT_SETTINGS.accessibility.highContrastBall,
      teamPatternMode: isBoolean(accessibility["teamPatternMode"])
        ? accessibility["teamPatternMode"]
        : DEFAULT_SETTINGS.accessibility.teamPatternMode,
      largerHud: isBoolean(accessibility["largerHud"])
        ? accessibility["largerHud"]
        : DEFAULT_SETTINGS.accessibility.largerHud,
      disableDithering: isBoolean(accessibility["disableDithering"])
        ? accessibility["disableDithering"]
        : DEFAULT_SETTINGS.accessibility.disableDithering
    }
  };
}

function loadFromStorage(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_SETTINGS };
    }
    return validateSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveToStorage(settings: AppSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable/full/blocked (private browsing, quota) — settings
    // still work for the current session, just won't persist. Not fatal.
  }
}

export const useSettingsStore = defineStore("settings", {
  state: (): { settings: AppSettings; loaded: boolean } => ({
    settings: { ...DEFAULT_SETTINGS },
    loaded: false
  }),

  actions: {
    load(): AppSettings {
      this.settings = loadFromStorage();
      this.loaded = true;
      return this.settings;
    },

    update(patch: {
      gameplay?: Partial<AppSettings["gameplay"]>;
      camera?: Partial<AppSettings["camera"]>;
      graphics?: Partial<AppSettings["graphics"]>;
      audio?: Partial<AppSettings["audio"]>;
      accessibility?: Partial<AppSettings["accessibility"]>;
    }): void {
      this.settings = validateSettings({
        ...this.settings,
        gameplay: { ...this.settings.gameplay, ...patch.gameplay },
        camera: { ...this.settings.camera, ...patch.camera },
        graphics: { ...this.settings.graphics, ...patch.graphics },
        audio: { ...this.settings.audio, ...patch.audio },
        accessibility: { ...this.settings.accessibility, ...patch.accessibility }
      });
      saveToStorage(this.settings);
    },

    resetToDefaults(): void {
      this.settings = { ...DEFAULT_SETTINGS };
      saveToStorage(this.settings);
    }
  }
});
