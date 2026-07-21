import * as THREE from "three";

import type { AssetPipeline } from "@/assets/AssetPipeline";
import type { CarTeamId } from "@/assets/cars/CarModelTypes";
import type { RenderFrameContext, RenderFrameModule } from "@/core/GameModule";
import { OPPONENT_CAR_ID } from "@/game-flow/MatchFlowConstants";
import type { PhysicsFacade } from "@/physics/PhysicsFacade";
import type { CarId } from "@/physics/PhysicsTypes";

function teamForCarId(carId: CarId): CarTeamId {
  return carId === OPPONENT_CAR_ID ? "opponent" : "player";
}

/**
 * Binds physics render snapshots to real gameplay visuals every frame: one
 * asset-pipeline car visual per spawned car (Phase 11 — real supplied GLB
 * when loaded/validated, otherwise `ProceduralCarFallback`, both produced
 * by `AssetPipeline.createCarVisual`) and the same procedural ball visual
 * used by the menu presentation (`AssetPipeline.createBallVisual`). Prior
 * phases (3-10) rendered plain wireframe debug boxes/sphere here instead —
 * see docs/asset-pipeline-deviations.md Phase 11 for why that was
 * deferred this long.
 */
export class PhysicsRenderBinding implements RenderFrameModule {
  private readonly root = new THREE.Group();
  private readonly ballVisual: THREE.Group;
  private readonly carVisuals = new Map<CarId, THREE.Group>();

  public constructor(
    private readonly physics: PhysicsFacade,
    private readonly assets: AssetPipeline,
    private readonly getAlpha: () => number
  ) {
    this.root.name = "DynamicGameplayRoot";

    this.ballVisual = this.assets.createBallVisual();
    this.ballVisual.name = "GameplayBall";
    this.root.add(this.ballVisual);
  }

  public getRoot(): THREE.Object3D {
    return this.root;
  }

  public updateRenderFrame(_context: RenderFrameContext): void {
    const snapshot = this.physics.getRenderSnapshot(this.getAlpha());

    this.ballVisual.position.set(
      snapshot.ball.position.x,
      snapshot.ball.position.y,
      snapshot.ball.position.z
    );
    this.ballVisual.quaternion.set(
      snapshot.ball.rotation.x,
      snapshot.ball.rotation.y,
      snapshot.ball.rotation.z,
      snapshot.ball.rotation.w
    );

    const seenCarIds = new Set<CarId>();

    for (const [carId, transform] of snapshot.cars) {
      seenCarIds.add(carId);

      let visual = this.carVisuals.get(carId);
      if (!visual) {
        visual = this.assets.createCarVisual(teamForCarId(carId));
        visual.name = `GameplayCar_${carId}`;
        this.root.add(visual);
        this.carVisuals.set(carId, visual);
      }

      visual.position.set(transform.position.x, transform.position.y, transform.position.z);
      visual.quaternion.set(
        transform.rotation.x,
        transform.rotation.y,
        transform.rotation.z,
        transform.rotation.w
      );
    }

    for (const [carId, visual] of this.carVisuals) {
      if (!seenCarIds.has(carId)) {
        this.root.remove(visual);
        this.carVisuals.delete(carId);
      }
    }
  }

  public dispose(): void {
    this.root.clear();
    this.carVisuals.clear();
  }
}
