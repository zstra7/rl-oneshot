import type { GameRuntimeFacade } from "@/core/GameRuntime";
import type { BrowserCombinedTestApi } from "@/testing/BrowserCombinedTestApi";

/** Installs window.__GAME_TEST__ only in dev/test builds (never production). */
export function installTestApis(runtime: GameRuntimeFacade): void {
  if (!(__DEV__ || __TEST_BUILD__)) {
    return;
  }

  const api: BrowserCombinedTestApi = {
    ready: () => runtime.isInitialised(),
    runtime: {
      getAppState: () => runtime.getReadOnlyState().appState,
      getDiagnostics: () => runtime.getDiagnostics(),
      isRunning: () => runtime.isRunning(),
      start: () => runtime.start(),
      stop: () => runtime.stop(),
      stepFixedTicks: (count: number) =>
        runtime.stepFixedTicksForTesting(count),
      getCameraDiagnostics: () => runtime.getCameraDiagnostics(),
      selectAiDifficulty: (difficulty) => runtime.selectAiDifficulty(difficulty),
      getAiDifficulty: () => runtime.getAiDifficulty(),
      setAiSeed: (seed) => runtime.setAiSeed(seed),
      getAiDebugState: () => runtime.getAiDebugState(),
      setVisualPreset: (preset) => runtime.setVisualPreset(preset),
      getVisualPreset: () => runtime.getVisualPreset(),
      getVisualDiagnostics: () => runtime.getVisualDiagnostics(),
      getVfxActiveParticleCount: () => runtime.getVfxActiveParticleCount()
    },
    gameFlow: runtime.getGameFlowTestApi()
  };

  window.__GAME_TEST__ = api;
}
