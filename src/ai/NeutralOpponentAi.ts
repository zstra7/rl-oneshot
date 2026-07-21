import type { GameModule } from "@/core/GameModule";

/**
 * Placeholder named per core architecture spec section 38
 * ("NeutralOpponentAi") until Phase 9 implements real opponent AI.
 */
export class NeutralOpponentAi implements GameModule {
  public initialise(): void {
    // No-op.
  }

  public dispose(): void {
    // No-op.
  }
}
