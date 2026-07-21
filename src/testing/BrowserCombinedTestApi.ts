import type { AiDebugState } from "@/ai/AiTypes";
import type { AiDifficulty } from "@/ai/AiDifficulty";
import type { VisualPreset } from "@/assets/procedural/ProceduralAssetContext";
import type { CameraDiagnostics } from "@/camera/ChaseCameraController";
import type { AppState } from "@/core/ApplicationState";
import type { RuntimeDiagnostics } from "@/core/RuntimeDiagnostics";
import type { BrowserGameFlowTestApi } from "@/game-flow/testing/BrowserGameFlowTestApi";
import type { VisualDiagnostics } from "@/visual-language/PsxRenderSettings";

export interface BrowserRuntimeTestApi {
  getAppState(): AppState;
  getDiagnostics(): RuntimeDiagnostics;
  isRunning(): boolean;
  start(): void;
  stop(): void;
  /** Bypasses requestAnimationFrame; deterministic fixed-tick stepping. */
  stepFixedTicks(count: number): void;
  /** Phase 8: chase camera position/target/mode, or null before it exists. */
  getCameraDiagnostics(): CameraDiagnostics | null;
  /** Phase 10: opponent AI difficulty/seed/tactical-mode inspection. */
  selectAiDifficulty(difficulty: AiDifficulty): void;
  getAiDifficulty(): AiDifficulty;
  setAiSeed(seed: number): void;
  getAiDebugState(): AiDebugState;
  /** PSX visual spec section 39: `setVisualPreset`/`getVisualPreset`/`getVisualDiagnostics`. */
  setVisualPreset(preset: VisualPreset): void;
  getVisualPreset(): VisualPreset;
  getVisualDiagnostics(): VisualDiagnostics;
  getVfxActiveParticleCount(): number;
  setAccessibilityOverrides(options: { reducedJitter: boolean; disableDithering: boolean }): void;
}

/**
 * Populated incrementally: `physics`/`input`/`ai`/`assets`/`gameFlow` are
 * added as their respective phases implement a real module (core
 * architecture spec section 46). They are optional until then rather than
 * stubbed with fake behaviour.
 */
export interface BrowserCombinedTestApi {
  ready(): boolean;
  runtime: BrowserRuntimeTestApi;
  physics?: unknown;
  input?: unknown;
  ai?: unknown;
  assets?: unknown;
  gameFlow?: BrowserGameFlowTestApi;
}

declare global {
  interface Window {
    __GAME_TEST__?: BrowserCombinedTestApi;
  }
}

export {};
