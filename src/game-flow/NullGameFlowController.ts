import type { GameModule } from "@/core/GameModule";

/** Placeholder until Phase 7 implements the real match-flow controller. */
export class NullGameFlowController implements GameModule {
  public initialise(): void {
    // No-op.
  }

  public dispose(): void {
    // No-op.
  }
}
