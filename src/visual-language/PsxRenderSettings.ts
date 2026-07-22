import type { VisualPreset } from "@/assets/procedural/ProceduralAssetContext";

/**
 * The game-flow spec section 39 `BrowserGameTestApi.setVisualPreset`
 * takes a richer settings object also named `VisualPreset` there — kept
 * as a distinct type name here (`PsxRenderSettings`) to avoid colliding
 * with this project's pre-existing `VisualPreset` string union (asset
 * pipeline spec's `"authentic"|"balanced"|"clean"` procedural style
 * knob, unrelated). `presetId` links the two: selecting a
 * `VisualPreset` id also selects the matching `PsxRenderSettings`.
 */
export interface PsxRenderSettings {
  readonly presetId: VisualPreset;
  readonly internalResolution: { readonly width: number; readonly height: number };
  readonly jitterGrid: { readonly width: number; readonly height: number };
  readonly ditherStrength: number;
  readonly colourLevels: number;
  readonly contrastBoost: number;
  readonly jitterEnabled: boolean;
  readonly ditherEnabled: boolean;
}

/** PSX visual stadium spec sections 7 and 9. */
export const PSX_RENDER_PRESETS: Record<VisualPreset, PsxRenderSettings> = {
  authentic: {
    presetId: "authentic",
    internalResolution: { width: 480, height: 270 },
    jitterGrid: { width: 240, height: 135 },
    ditherStrength: 0.045,
    colourLevels: 20,
    contrastBoost: 1.08,
    // WS8.A (plan/POLISH_OVERHAUL_PLAN.md): jitter disabled product-wide
    // due to z-fighting; shader infrastructure and the accessibility
    // "reduced jitter" toggle are retained. See docs/visual-language-deviations.md.
    jitterEnabled: false,
    ditherEnabled: true
  },
  balanced: {
    presetId: "balanced",
    internalResolution: { width: 640, height: 360 },
    jitterGrid: { width: 240, height: 135 },
    ditherStrength: 0.03,
    colourLevels: 32,
    contrastBoost: 1.05,
    jitterEnabled: false,
    ditherEnabled: true
  },
  clean: {
    presetId: "clean",
    internalResolution: { width: 960, height: 540 },
    jitterGrid: { width: 240, height: 135 },
    ditherStrength: 0.015,
    colourLevels: 56,
    contrastBoost: 1.0,
    jitterEnabled: false,
    ditherEnabled: true
  }
};

/** PSX visual stadium spec section 8: per-category vertex jitter strength (0 = no jitter). */
export type JitterCategory =
  | "arenaMetal"
  | "cars"
  | "ball"
  | "goalOutlines"
  | "glass"
  | "stars"
  | "ui"
  | "debugGeometry";

/** PSX visual stadium spec section 39: `BrowserGameTestApi.getVisualDiagnostics`. */
export interface VisualDiagnostics {
  readonly preset: VisualPreset;
  readonly internalResolution: { readonly width: number; readonly height: number };
  readonly settings: PsxRenderSettings;
}

export const JITTER_STRENGTH_BY_CATEGORY: Record<JitterCategory, number> = {
  arenaMetal: 1.0,
  cars: 0.65,
  ball: 0.25,
  goalOutlines: 0.25,
  glass: 0.4,
  stars: 0,
  ui: 0,
  debugGeometry: 0
};
