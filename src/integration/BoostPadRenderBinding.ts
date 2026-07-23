import * as THREE from "three";

import type { AssetPipeline } from "@/assets/AssetPipeline";
import type { RenderFrameContext, RenderFrameModule } from "@/core/GameModule";
import type { PhysicsFacade } from "@/physics/PhysicsFacade";
import type { BoostPadId } from "@/physics/boost/BoostPadTypes";

/**
 * Binds boost pad physics state to procedural pad visuals every render
 * frame (Master Brief Phase 6: "Visual state matches physics"). Active/
 * inactive+respawning is reflected via the pad's own per-instance ring
 * material; a dedicated "collected pulse" flash is deferred to Phase 14
 * (stadium art/VFX) — see docs/asset-pipeline-deviations.md.
 */
export class BoostPadRenderBinding implements RenderFrameModule {
  private readonly root = new THREE.Group();
  private readonly padVisuals = new Map<BoostPadId, THREE.Group>();
  private built = false;

  public constructor(
    private readonly physics: PhysicsFacade,
    private readonly assets: AssetPipeline
  ) {
    this.root.name = "BoostPadRoot";
  }

  public getRoot(): THREE.Object3D {
    return this.root;
  }

  public updateRenderFrame(_context: RenderFrameContext): void {
    const pads = this.physics.getBoostPadStates();

    if (!this.built) {
      for (const pad of pads) {
        const visual = this.assets.createBoostPadVisual(pad.id, pad.type);
        // WS5.D (plan/POLISH_OVERHAUL_PLAN.md): `pad.position` is the
        // *sensor* centre, which sits `pickupHalfHeight` above the floor
        // (BoostPadLayout.ts) — the visual is authored floor-relative
        // (plate at y=0.03 etc.), so it must be seated at y=0, not at the
        // sensor's y. If pads are ever placed off-floor in future, seat
        // at `pad.position.y - pickupHalfHeight` instead of a flat 0.
        visual.position.set(pad.position.x, 0, pad.position.z);
        this.root.add(visual);
        this.padVisuals.set(pad.id, visual);
      }
      this.built = true;
    }

    for (const pad of pads) {
      const visual = this.padVisuals.get(pad.id);
      if (!visual) {
        continue;
      }
      this.assets.applyBoostPadVisualState(visual, pad.active ? "active" : "respawning");
    }
  }

  public dispose(): void {
    this.root.clear();
    this.padVisuals.clear();
    this.built = false;
  }
}
