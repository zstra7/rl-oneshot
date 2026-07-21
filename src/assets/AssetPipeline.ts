import * as THREE from "three";

import {
  GAME_ASSET_MANIFEST,
  validateAssetManifest
} from "@/assets/AssetManifest";
import { AssetLoadingManager } from "@/assets/AssetLoadingManager";
import {
  DEFAULT_PROCEDURAL_SEEDS,
  DEFAULT_STADIUM_DIMENSIONS,
  PLACEHOLDER_PHYSICS_METADATA,
  type AssetLoadError,
  type AssetLoadProgress,
  type AssetPipelineState
} from "@/assets/AssetTypes";
import { createProceduralCarFallback } from "@/assets/cars/ProceduralCarFallback";
import { createBallVisual } from "@/assets/procedural/BallVisualFactory";
import { GeometryRegistry } from "@/assets/procedural/GeometryRegistry";
import { MaterialRegistry } from "@/assets/procedural/MaterialRegistry";
import type { ProceduralAssetContext } from "@/assets/procedural/ProceduralAssetContext";
import { SeededRandom } from "@/assets/procedural/SeededRandom";
import { createDefaultStarfield } from "@/assets/procedural/StarfieldFactory";
import { createStadiumBlockout } from "@/assets/procedural/StadiumGeometryFactory";
import type { GameModule } from "@/core/GameModule";

export interface AssetResourceCounts {
  readonly geometries: number;
  readonly materials: number;
}

export interface ProceduralPreviewHandle {
  readonly group: THREE.Group;
  dispose(): void;
}

/**
 * Real asset pipeline (Master Brief Phase 2). Only the procedural
 * foundation is implemented here: no authored car GLB / texture intake
 * yet (that is Phase 11/12 — see docs/asset-pipeline-deviations.md).
 */
export class AssetPipeline implements GameModule {
  private state: AssetPipelineState = "IDLE";
  private readonly loadingManager = new AssetLoadingManager();
  private readonly geometryRegistry = new GeometryRegistry();
  private readonly materialRegistry = new MaterialRegistry();
  private readonly errors: string[] = [];
  private context: ProceduralAssetContext | null = null;
  private activePreview: ProceduralPreviewHandle | null = null;

  public initialise(): void {
    this.setState("VALIDATING_SKILLS");
    // Skill file presence is enforced at build time by
    // `npm run validate:threejs-skills`; nothing further to check here.

    this.setState("VALIDATING_MANIFEST");
    const manifestErrors = validateAssetManifest(GAME_ASSET_MANIFEST);
    if (manifestErrors.length > 0) {
      this.errors.push(...manifestErrors);
      this.setState("FAILED");
      throw new Error(`Asset manifest invalid: ${manifestErrors.join("; ")}`);
    }

    // Phase 2 requires no authored assets: the procedural fallback covers
    // both car slots and no textures are marked required yet.
    this.setState("LOADING_AUTHORED_ASSETS");
    this.setState("VALIDATING_AUTHORED_ASSETS");

    this.setState("BUILDING_PROCEDURAL_RESOURCES");
    this.context = {
      three: THREE,
      geometryRegistry: this.geometryRegistry,
      materialRegistry: this.materialRegistry,
      random: new SeededRandom(DEFAULT_PROCEDURAL_SEEDS.menuScene),
      visualPreset: "balanced",
      stadiumDimensions: DEFAULT_STADIUM_DIMENSIONS,
      physicsMetadata: PLACEHOLDER_PHYSICS_METADATA
    };

    this.setState("WARMING_SHADERS");
    // No custom ShaderMaterial exists yet in Phase 2 to warm.

    this.setState("READY");
  }

  private setState(state: AssetPipelineState): void {
    this.state = state;
    this.loadingManager.setPhase(state);
  }

  private requireContext(): ProceduralAssetContext {
    if (!this.context) {
      throw new Error("AssetPipeline.initialise() must complete before use.");
    }
    return this.context;
  }

  public buildPlaceholderWorld(): THREE.Group {
    const context = this.requireContext();

    const root = new THREE.Group();
    root.name = "PlaceholderWorld";

    root.add(createStadiumBlockout(context));
    root.add(createDefaultStarfield(context));

    const ball = createBallVisual(context);
    ball.position.set(0, context.physicsMetadata.ballRadius + 2, 0);
    root.add(ball);

    const playerCar = createProceduralCarFallback(context, "player");
    playerCar.position.set(-6, context.physicsMetadata.carHitboxSize.y / 2, -10);
    root.add(playerCar);

    const opponentCar = createProceduralCarFallback(context, "opponent");
    opponentCar.rotation.y = Math.PI;
    opponentCar.position.set(6, context.physicsMetadata.carHitboxSize.y / 2, 10);
    root.add(opponentCar);

    return root;
  }

  /**
   * Builds a fully independent preview world from scratch registries keyed
   * only to this call, so re-seeding never collides with the persistent
   * placeholder world's cached geometry/material keys. Used by the
   * development asset lab and by BrowserAssetTestApi.rebuildProceduralPreview.
   */
  public createProceduralPreview(seed: number): ProceduralPreviewHandle {
    const previewGeometryRegistry = new GeometryRegistry();
    const previewMaterialRegistry = new MaterialRegistry();

    const previewContext: ProceduralAssetContext = {
      three: THREE,
      geometryRegistry: previewGeometryRegistry,
      materialRegistry: previewMaterialRegistry,
      random: new SeededRandom(seed),
      visualPreset: "balanced",
      stadiumDimensions: DEFAULT_STADIUM_DIMENSIONS,
      physicsMetadata: PLACEHOLDER_PHYSICS_METADATA
    };

    const group = new THREE.Group();
    group.name = "ProceduralPreview";
    group.add(createStadiumBlockout(previewContext));
    group.add(createDefaultStarfield(previewContext));
    group.add(createBallVisual(previewContext));

    return {
      group,
      dispose: () => {
        previewGeometryRegistry.disposeAll();
        previewMaterialRegistry.disposeAll();
      }
    };
  }

  public setProceduralPreviewSeed(seed: number): ProceduralPreviewHandle {
    this.activePreview?.dispose();
    this.activePreview = this.createProceduralPreview(seed);
    return this.activePreview;
  }

  public disposePreview(): void {
    this.activePreview?.dispose();
    this.activePreview = null;
  }

  public getState(): AssetPipelineState {
    return this.state;
  }

  public getLoadingProgress(): AssetLoadProgress {
    return this.loadingManager.getProgress();
  }

  public getErrors(): readonly AssetLoadError[] {
    return [
      ...this.errors.map((message) => ({ url: "", message })),
      ...this.loadingManager.getErrors()
    ];
  }

  public getSceneResourceCounts(): AssetResourceCounts {
    return {
      geometries: this.geometryRegistry.size,
      materials: this.materialRegistry.size
    };
  }

  public dispose(): void {
    this.disposePreview();
    this.geometryRegistry.disposeAll();
    this.materialRegistry.disposeAll();
    this.context = null;
    this.state = "IDLE";
  }
}
