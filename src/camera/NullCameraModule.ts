import type { GameModule } from "@/core/GameModule";

/**
 * Deliberately stays a no-op `GameModule` even after Phase 8: the real
 * chase camera (`src/camera/ChaseCameraController.ts`) needs the
 * `THREE.PerspectiveCamera` created by `PlaceholderSceneRenderer` and the
 * ready `MatchFlowController`, neither of which exist yet when
 * `ModuleContainer`'s generic slots are eagerly constructed. It is wired
 * up as a `GameRuntime`-owned integration binding instead (the same
 * pattern already used for `PhysicsRenderBinding`/`BoostPadRenderBinding`),
 * not by replacing this slot's type the way `gameFlow`/`input` were —
 * see docs/build-decisions.md Phase 8 section.
 */
export class NullCameraModule implements GameModule {
  public initialise(): void {
    // No-op.
  }

  public dispose(): void {
    // No-op.
  }
}
