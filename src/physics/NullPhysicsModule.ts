import type { GameModule } from "@/core/GameModule";

/** Placeholder until Phase 3 implements the real Rapier physics facade. */
export class NullPhysicsModule implements GameModule {
  public initialise(): void {
    // No-op.
  }

  public dispose(): void {
    // No-op.
  }
}
