import type { AppState } from "@/core/ApplicationState";
import type { RuntimeDiagnostics } from "@/core/RuntimeDiagnostics";
import type { BrowserGameFlowTestApi } from "@/game-flow/testing/BrowserGameFlowTestApi";

export interface BrowserRuntimeTestApi {
  getAppState(): AppState;
  getDiagnostics(): RuntimeDiagnostics;
  isRunning(): boolean;
  start(): void;
  stop(): void;
  /** Bypasses requestAnimationFrame; deterministic fixed-tick stepping. */
  stepFixedTicks(count: number): void;
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
