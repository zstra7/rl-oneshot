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
        runtime.stepFixedTicksForTesting(count)
    }
  };

  window.__GAME_TEST__ = api;
}
