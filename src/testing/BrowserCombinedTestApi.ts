import type { AiDebugState } from "@/ai/AiTypes";
import type { AiDifficulty } from "@/ai/AiDifficulty";
import type { VisualPreset } from "@/assets/procedural/ProceduralAssetContext";
import type { CameraDiagnostics } from "@/camera/ChaseCameraController";
import type { CameraSettings } from "@/camera/CameraSettings";
import type { AppState } from "@/core/ApplicationState";
import type { RuntimeDiagnostics } from "@/core/RuntimeDiagnostics";
import type { BrowserGameFlowTestApi } from "@/game-flow/testing/BrowserGameFlowTestApi";
import type { ControlBindings } from "@/input/bindings/BindingsConfig";
import type { CapturedBinding } from "@/input/InputControlsModule";
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
  /** WS4.B: live camera rig tuning, independent of the settings-panel UI
   * (settings can only be opened from menu states, not mid-match). */
  setCameraSettings(settings: CameraSettings): void;
  getCameraSettings(): CameraSettings;
  /** WS7.C: whether the menu-presentation ghost ball/cars are currently shown. */
  isMenuPresentationVisible(): boolean;
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
  /** R10.2/R10.3: rebindable controls + air-roll sensitivity, for Playwright. */
  setControlBindings(bindings: ControlBindings): void;
  getControlBindings(): ControlBindings;
  startBindingCapture(device: "keyboardMouse" | "gamepad"): void;
  takeCapturedBinding(): CapturedBinding | null;
  setAirRollSensitivity(value: number): void;
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
