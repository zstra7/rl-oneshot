import type { GameModule } from "@/core/GameModule";

/**
 * Deliberately stays a no-op `GameModule` even after Phase 14: the real
 * `VfxModule` (`src/vfx/VfxModule.ts`) needs the ready `PhysicsFacade` and
 * `MatchFlowController`, neither of which exist yet when
 * `ModuleContainer`'s generic slots are eagerly constructed — it is wired
 * up as a `GameRuntime`-owned integration binding instead, the same
 * pattern already used for `NullCameraModule`/`ChaseCameraController`.
 * See docs/visual-language-deviations.md Phase 14 section.
 */
export class NullVfxModule implements GameModule {
  public initialise(): void {
    // No-op.
  }

  public dispose(): void {
    // No-op.
  }
}
