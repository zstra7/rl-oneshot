import { GameRuntime } from "@/core/GameRuntime";

let singleton: GameRuntime | null = null;

/** There must be exactly one GameRuntime per application lifetime (or per HMR cycle). */
export function getGameRuntime(): GameRuntime {
  if (!singleton) {
    singleton = new GameRuntime();
  }

  return singleton;
}

export function disposeGameRuntime(): void {
  singleton?.dispose();
  singleton = null;
}
