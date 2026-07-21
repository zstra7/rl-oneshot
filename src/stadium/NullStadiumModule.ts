import type { GameModule } from "@/core/GameModule";

/** Placeholder until Phase 2/14 build the real stadium module. */
export class NullStadiumModule implements GameModule {
  public initialise(): void {
    // No-op.
  }

  public dispose(): void {
    // No-op.
  }
}
