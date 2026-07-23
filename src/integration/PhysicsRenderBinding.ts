import * as THREE from "three";

import type { AssetPipeline } from "@/assets/AssetPipeline";
import type { CarTeamId } from "@/assets/cars/CarModelTypes";
import type { RenderFrameContext, RenderFrameModule } from "@/core/GameModule";
import { OPPONENT_CAR_ID } from "@/game-flow/MatchFlowConstants";
import { decayOffset, shouldSmoothCorrection } from "@/integration/CorrectionOffset";
import type { PhysicsFacade } from "@/physics/PhysicsFacade";
import type { CarId, Vec3Like } from "@/physics/PhysicsTypes";
import * as V from "@/physics/Vec3Math";

function teamForCarId(carId: CarId): CarTeamId {
  return carId === OPPONENT_CAR_ID ? "opponent" : "player";
}

/** P1.2: identifies which visual a correction offset applies to — a car, or the ball. */
export type CorrectionTargetId = CarId | "ball";

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

  /** P1.2: decaying render-only position offsets from online reconciliation corrections. */
  private readonly correctionOffsets = new Map<CorrectionTargetId, Vec3Like>();
  /** P1.2: while true (countdown/kickoff), offsets are suppressed — a real teleport must snap, not glide. */
  private kickoffPhaseActive = false;

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

  /**
   * P1.2: register a visual correction — `delta` is "where it used to appear
   * minus where it now actually is" (world-space). The renderer will draw the
   * target `delta` away from its true position, decaying that offset toward
   * zero over `CORRECTION_HALF_LIFE_SECONDS`. A delta larger than
   * `CORRECTION_MAX_ACCEPTED_DISTANCE` (a real teleport, e.g. a kickoff
   * reset) is rejected — those must snap instantly, not glide. Simulation
   * state is never touched by this; only what gets drawn.
   */
  public addCorrectionOffset(target: CorrectionTargetId, delta: Vec3Like): void {
    if (this.kickoffPhaseActive || !shouldSmoothCorrection(delta)) {
      return;
    }
    const existing = this.correctionOffsets.get(target) ?? { x: 0, y: 0, z: 0 };
    this.correctionOffsets.set(target, V.add(existing, delta));
  }

  /**
   * P1.2: suppress (and, on the leading edge, clear) correction smoothing
   * during countdown/kickoff states, where a real teleport — the kickoff
   * reset — must never be softened into a glide.
   */
  public setKickoffPhaseActive(active: boolean): void {
    this.kickoffPhaseActive = active;
    if (active) {
      this.correctionOffsets.clear();
    }
  }

  public updateRenderFrame(context: RenderFrameContext): void {
    const snapshot = this.physics.getRenderSnapshot(this.getAlpha());
    this.decayCorrectionOffsets(context.frameDeltaSeconds);

    const ballOffset = this.correctionOffsets.get("ball");
    const ballPosition = ballOffset ? V.add(snapshot.ball.position, ballOffset) : snapshot.ball.position;
    this.ballVisual.position.set(ballPosition.x, ballPosition.y, ballPosition.z);
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

      const carOffset = this.correctionOffsets.get(carId);
      const carPosition = carOffset ? V.add(transform.position, carOffset) : transform.position;
      visual.position.set(carPosition.x, carPosition.y, carPosition.z);
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

  private decayCorrectionOffsets(dtSeconds: number): void {
    for (const [target, offset] of this.correctionOffsets) {
      const decayed = decayOffset(offset, dtSeconds);
      if (V.length(decayed) < 1e-4) {
        this.correctionOffsets.delete(target);
      } else {
        this.correctionOffsets.set(target, decayed);
      }
    }
  }

  /**
   * R12.4 test hook: reads the live team-primary body colour off a car's
   * currently-bound visual (real GLB's "M_car" material, or the procedural
   * fallback's "CarBody" mesh) rather than the pipeline's profile
   * derivation, so a Playwright assertion proves the colour actually made
   * it onto the rendered scene graph, not just into settings state. Null
   * before the car has spawned a visual.
   */
  public getCarPrimaryColorHex(carId: CarId): string | null {
    const visual = this.carVisuals.get(carId);
    if (!visual) {
      return null;
    }

    let hex: string | null = null;
    visual.traverse((object) => {
      if (hex !== null || !(object instanceof THREE.Mesh)) {
        return;
      }
      const material = Array.isArray(object.material) ? object.material[0] : object.material;
      const standardMaterial = material as THREE.MeshStandardMaterial | undefined;
      if (!standardMaterial?.color) {
        return;
      }
      const isTeamPrimaryMesh = material?.name === "M_car" || object.name === "CarBody";
      if (isTeamPrimaryMesh) {
        hex = `#${standardMaterial.color.getHexString()}`;
      }
    });
    return hex;
  }

  /**
   * R12.2: drops the cached visual for `carId` from both the scene root
   * and `carVisuals` — the next `updateRenderFrame` lazily recreates it via
   * `assets.createCarVisual`, which by then reflects any freshly-applied
   * `AssetPipeline.setPlayerCarColorOverride`. Used for instant live
   * preview in the Customise Car menu rather than any full car re-spawn.
   */
  public rebuildCarVisual(carId: CarId): void {
    const visual = this.carVisuals.get(carId);
    if (!visual) {
      return;
    }
    this.root.remove(visual);
    this.carVisuals.delete(carId);
  }

  public dispose(): void {
    this.root.clear();
    this.carVisuals.clear();
  }
}
