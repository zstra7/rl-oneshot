import { getGameRuntime } from "@/core/GameRuntimeFactory";
import type { GameRuntimeFacade } from "@/core/GameRuntime";

export function useGameRuntime(): GameRuntimeFacade {
  return getGameRuntime();
}
