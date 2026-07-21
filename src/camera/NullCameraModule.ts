import type { GameModule } from "@/core/GameModule";

/** Placeholder until Phase 8 implements the real chase camera module. */
export class NullCameraModule implements GameModule {
  public initialise(): void {
    // No-op.
  }

  public dispose(): void {
    // No-op.
  }
}
