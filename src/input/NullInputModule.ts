import type { GameModule } from "@/core/GameModule";

/** Placeholder until Phase 4 implements the real input-controls module. */
export class NullInputModule implements GameModule {
  public initialise(): void {
    // No-op.
  }

  public dispose(): void {
    // No-op.
  }
}
