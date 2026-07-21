import type { GameModule } from "@/core/GameModule";

/** Placeholder until Phase 6/14 implement the real VFX module. */
export class NullVfxModule implements GameModule {
  public initialise(): void {
    // No-op.
  }

  public dispose(): void {
    // No-op.
  }
}
