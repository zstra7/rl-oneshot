import type { GameModule } from "@/core/GameModule";

/** Placeholder until Phase 2 implements the real asset pipeline. */
export class NullAssetPipeline implements GameModule {
  public initialise(): void {
    // No-op.
  }

  public dispose(): void {
    // No-op.
  }
}
