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
import { CarAssetLoader } from "@/assets/cars/CarAssetLoader";
import { deriveTeamProfile, getCarDescriptor, getTeamVisualProfile } from "@/assets/cars/CarDescriptors";
import type { CarAssetInspectionReport, CarTeamId, LoadedCarSource } from "@/assets/cars/CarModelTypes";
import { createProceduralCarFallback } from "@/assets/cars/ProceduralCarFallback";
import { validateCarAsset } from "@/assets/cars/CarValidation";
import { createBallVisual as createProceduralBallVisual } from "@/assets/procedural/BallVisualFactory";
import {
  applyBoostPadVisualState,
  createBoostPadVisual,
  type BoostPadVisualState,
  type BoostPadVisualType
} from "@/assets/procedural/BoostPadVisualFactory";
import { GeometryRegistry } from "@/assets/procedural/GeometryRegistry";
import { MaterialRegistry } from "@/assets/procedural/MaterialRegistry";
import type { ProceduralAssetContext } from "@/assets/procedural/ProceduralAssetContext";
import { SeededRandom } from "@/assets/procedural/SeededRandom";
import { createDefaultStarfield } from "@/assets/procedural/StarfieldFactory";
import { createStadiumBlockout } from "@/assets/procedural/StadiumGeometryFactory";
import { TextureAssetLoader } from "@/assets/textures/TextureAssetLoader";
import type { TextureAssetDescriptor } from "@/assets/textures/TextureTypes";
import { validateLoadedTexture } from "@/assets/textures/TextureValidation";
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
 * Real asset pipeline (Master Brief Phase 2, extended by Phase 11 car GLB
 * and Phase 12 texture intake — see docs/asset-pipeline-deviations.md).
 */
export class AssetPipeline implements GameModule {
  private state: AssetPipelineState = "IDLE";
  private readonly loadingManager = new AssetLoadingManager();
  private readonly geometryRegistry = new GeometryRegistry();
  private readonly materialRegistry = new MaterialRegistry();
  private readonly errors: string[] = [];
  private context: ProceduralAssetContext | null = null;
  private activePreview: ProceduralPreviewHandle | null = null;
  /** R12.2/P2.3: per-team body-colour override — the player's own Customise Car choice, or (online) either peer's. */
  private readonly carColorOverrides = new Map<CarTeamId, string>();

  private readonly carLoader = new CarAssetLoader();
  private readonly loadedCarSources = new Map<CarTeamId, LoadedCarSource>();
  private readonly carUsesFallback = new Map<CarTeamId, boolean>();
  private readonly carIntakeReports = new Map<CarTeamId, CarAssetInspectionReport>();

  private readonly textureLoader = new TextureAssetLoader();
  private stadiumTextures: {
    floor?: THREE.Texture;
    wall?: THREE.Texture;
    floorPanelSet?: THREE.Texture[];
    floorAccentPlayer?: THREE.Texture;
    floorAccentOpponent?: THREE.Texture;
  } = {};

  public async initialise(): Promise<void> {
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

    this.setState("LOADING_AUTHORED_ASSETS");
    this.setState("VALIDATING_AUTHORED_ASSETS");
    await this.loadAndValidateCars();
    await this.loadAndValidateStadiumTextures();

    this.setState("BUILDING_PROCEDURAL_RESOURCES");
    this.context = {
      three: THREE,
      geometryRegistry: this.geometryRegistry,
      materialRegistry: this.materialRegistry,
      random: new SeededRandom(DEFAULT_PROCEDURAL_SEEDS.menuScene),
      visualPreset: "clean",
      stadiumDimensions: DEFAULT_STADIUM_DIMENSIONS,
      physicsMetadata: PLACEHOLDER_PHYSICS_METADATA,
      stadiumTextures: this.stadiumTextures
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

  /**
   * Asset pipeline spec sections 12-14/20: load the shared `car.glb` once
   * per descriptor URL, validate it (section 14.1 required checks), and
   * fall back to `ProceduralCarFallback` per car slot in development if
   * loading/validation fails. Production policy (section 20) is "required
   * car missing -> fail asset pipeline" — a failure in a production build
   * (`import.meta.env.PROD`) is fatal instead of silently falling back.
   */
  private async loadAndValidateCars(): Promise<void> {
    const teams: readonly CarTeamId[] = ["player", "opponent"];

    for (const team of teams) {
      const descriptor = getCarDescriptor(team);
      try {
        const source = await this.carLoader.loadSource(descriptor);
        const { errors, warnings } = validateCarAsset(source.report, descriptor);

        this.carIntakeReports.set(team, source.report);
        this.errors.push(...warnings.map((warning) => `[warning] ${warning}`));

        if (errors.length > 0) {
          throw new Error(errors.join("; "));
        }

        this.loadedCarSources.set(team, source);
        this.carUsesFallback.set(team, false);
      } catch (error) {
        const message = `Car "${descriptor.id}" failed to load/validate: ${String(
          error instanceof Error ? error.message : error
        )}`;

        if (import.meta.env.PROD) {
          this.errors.push(message);
          this.setState("FAILED");
          throw new Error(message);
        }

        this.errors.push(`${message} (using procedural fallback in this dev/test build)`);
        this.carUsesFallback.set(team, true);
      }
    }
  }

  /**
   * Asset pipeline spec sections 21-26: loads a small curated subset of
   * the 298-texture supplied library that `StadiumGeometryFactory`
   * actually consumes right now (the floor/wall base surfaces) — not the
   * full library eagerly (see docs/asset-pipeline-deviations.md Phase 12
   * for why). Every other manifest entry is still fully catalogued
   * (`docs/texture-intake-report.md`) and loadable on demand via
   * `loadTexture()`, just not eagerly fetched at boot for surfaces
   * nothing currently renders. None of the manifest textures are marked
   * `required`, so a failure here only ever falls back (spec section 26)
   * — it can never fail the whole pipeline.
   */
  private async loadAndValidateStadiumTextures(): Promise<void> {
    const manifest = GAME_ASSET_MANIFEST.textures;
    const floorDescriptor = manifest["ConcreteFloor-01_64"];
    const wallDescriptor = manifest["ConcretePanel-01_64"];

    if (floorDescriptor) {
      this.stadiumTextures.floor = await this.loadTexture(floorDescriptor);
    }
    if (wallDescriptor) {
      this.stadiumTextures.wall = await this.loadTexture(wallDescriptor);
    }

    // WS8.B (plan/POLISH_OVERHAUL_PLAN.md): paneled floor — two plain
    // concrete variants tiled across the field, plus a painted accent
    // variant near each goal (player-side blue, opponent-side red).
    const floorPanelDescriptors = [manifest["ConcreteFloor-01_64"], manifest["ConcreteFloor-02_64"]];
    this.stadiumTextures.floorPanelSet = [];
    for (const descriptor of floorPanelDescriptors) {
      if (descriptor) {
        this.stadiumTextures.floorPanelSet.push(await this.loadTexture(descriptor));
      }
    }

    const accentPlayerDescriptor = manifest["ConcreteFloorPainted-C16x32B_64"];
    if (accentPlayerDescriptor) {
      this.stadiumTextures.floorAccentPlayer = await this.loadTexture(accentPlayerDescriptor);
    }
    const accentOpponentDescriptor = manifest["ConcreteFloorPainted-C16x32R_64"];
    if (accentOpponentDescriptor) {
      this.stadiumTextures.floorAccentOpponent = await this.loadTexture(accentOpponentDescriptor);
    }
  }

  /** Loads and validates (spec section 25) one manifest texture by descriptor, warnings recorded, never throws. */
  public async loadTexture(descriptor: TextureAssetDescriptor): Promise<THREE.Texture> {
    const texture = await this.textureLoader.load(descriptor);
    const { warnings } = validateLoadedTexture(descriptor, texture);
    this.errors.push(...warnings.map((warning) => `[warning] ${warning}`));
    return texture;
  }

  /**
   * Real supplied GLB when loaded/validated successfully, otherwise the
   * procedural placeholder (spec section 20) — used both by the menu
   * presentation (`buildPlaceholderWorld`) and by live gameplay
   * (`PhysicsRenderBinding`), so both show the same visual per car.
   */
  public createCarVisual(team: CarTeamId): THREE.Group {
    const override = this.carColorOverrides.get(team) ?? null;
    const profile = override ? deriveTeamProfile(team, override) : getTeamVisualProfile(team);

    const source = this.loadedCarSources.get(team);
    if (source && !this.carUsesFallback.get(team)) {
      return this.carLoader.createInstance(source, profile);
    }
    return createProceduralCarFallback(this.requireContext(), team, override);
  }

  /** R12.2: Customise Car live-preview colour override for the player's car — null restores the fixed team-cyan default. */
  public setPlayerCarColorOverride(hex: string | null): void {
    this.setCarColorOverride("player", hex);
  }

  public getPlayerCarColorOverride(): string | null {
    return this.getCarColorOverride("player");
  }

  /**
   * P2.3: body-colour override for EITHER team's car — generalises
   * `setPlayerCarColorOverride` so the online opponent's chosen colour can
   * be applied to `car-opponent` the same way. `hex` must already be a
   * validated `#rrggbb` string (or null to restore the team default).
   */
  public setCarColorOverride(team: CarTeamId, hex: string | null): void {
    if (hex) {
      this.carColorOverrides.set(team, hex);
    } else {
      this.carColorOverrides.delete(team);
    }
  }

  public getCarColorOverride(team: CarTeamId): string | null {
    return this.carColorOverrides.get(team) ?? null;
  }

  public createBallVisual(): THREE.Group {
    return createProceduralBallVisual(this.requireContext());
  }

  public getCarIntakeReports(): ReadonlyMap<CarTeamId, CarAssetInspectionReport> {
    return this.carIntakeReports;
  }

  /** True if `createCarVisual(team)` is currently serving `ProceduralCarFallback` instead of the loaded GLB. */
  public isCarUsingFallback(team: CarTeamId): boolean {
    return this.carUsesFallback.get(team) ?? true;
  }

  public createBoostPadVisual(padId: string, type: BoostPadVisualType): THREE.Group {
    return createBoostPadVisual(this.requireContext(), padId, type);
  }

  public applyBoostPadVisualState(pad: THREE.Group, state: BoostPadVisualState): void {
    applyBoostPadVisualState(pad, state);
  }

  public buildPlaceholderWorld(): THREE.Group {
    const context = this.requireContext();

    const root = new THREE.Group();
    root.name = "PlaceholderWorld";

    root.add(createStadiumBlockout(context));
    root.add(createDefaultStarfield(context));

    // WS7.C (plan/POLISH_OVERHAUL_PLAN.md): named so GameRuntime can
    // toggle these children's visibility once a match goes live, leaving
    // the stadium/starfield (siblings under the same root) always
    // visible. R8 (plan/RAMPS_AND_FEATURES_PLAN.md): the ghost ball
    // itself was removed — it duplicated the live physics-driven ball
    // (which already rests on the floor at the menu, see WS5.B), so the
    // menu showed two balls. The physics ball is now the only menu ball.

    // WS7.A: mirrors PhysicsFacade's default (far-back) kickoff pose —
    // player facing +Z (yaw pi), opponent facing -Z (identity).
    const playerCar = this.createCarVisual("player");
    playerCar.name = "MenuGhostPlayerCar";
    playerCar.rotation.y = Math.PI;
    playerCar.position.set(0, context.physicsMetadata.carHitboxSize.y / 2, -24);
    root.add(playerCar);

    const opponentCar = this.createCarVisual("opponent");
    opponentCar.name = "MenuGhostOpponentCar";
    opponentCar.position.set(0, context.physicsMetadata.carHitboxSize.y / 2, 24);
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
      visualPreset: "clean",
      stadiumDimensions: DEFAULT_STADIUM_DIMENSIONS,
      physicsMetadata: PLACEHOLDER_PHYSICS_METADATA
    };

    const group = new THREE.Group();
    group.name = "ProceduralPreview";
    group.add(createStadiumBlockout(previewContext));
    group.add(createDefaultStarfield(previewContext));
    group.add(createProceduralBallVisual(previewContext));

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

  /**
   * WS5.A (plan/POLISH_OVERHAUL_PLAN.md): test-only introspection of the
   * arena's transparent glass shell vs. the (still opaque) floor. Builds
   * a throwaway stadium group against the live registries (materials are
   * deduplicated by key, so this doesn't create new GPU resources beyond
   * what a real stadium build already needs) purely to traverse it.
   */
  public getStadiumShellInfo(): {
    transparentMeshCount: number;
    floorMaterialOpaque: boolean;
    floorPanelCount: number;
    rampSegmentCount: number;
    cornerPanelCount: number;
    rampMaterialTextured: boolean;
  } {
    const context = this.requireContext();
    const stadium = createStadiumBlockout(context);

    let transparentMeshCount = 0;
    let floorMaterialOpaque = true;
    let floorPanelCount = 0;
    let rampSegmentCount = 0;
    let cornerPanelCount = 0;
    let rampMaterialTextured = false;

    stadium.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!(mesh instanceof THREE.Mesh)) {
        return;
      }
      const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      const standardMaterial = material as THREE.MeshStandardMaterial | undefined;
      const isTransparent = Boolean(standardMaterial?.transparent) && (standardMaterial?.opacity ?? 1) < 0.5;

      if (isTransparent) {
        transparentMeshCount += 1;
      }
      if (mesh.name === "FloorBase" && isTransparent) {
        floorMaterialOpaque = false;
      }
      if (mesh.name === "FloorPanel") {
        floorPanelCount += 1;
      }
      if (mesh.name === "RampSegment") {
        rampSegmentCount += 1;
        if (standardMaterial?.map) {
          rampMaterialTextured = true;
        }
      }
      if (mesh.name === "CornerWallPanel") {
        cornerPanelCount += 1;
      }
    });

    return {
      transparentMeshCount,
      floorMaterialOpaque,
      floorPanelCount,
      rampSegmentCount,
      cornerPanelCount,
      rampMaterialTextured
    };
  }

  public dispose(): void {
    this.disposePreview();
    this.geometryRegistry.disposeAll();
    this.materialRegistry.disposeAll();
    this.carLoader.dispose();
    this.loadedCarSources.clear();
    this.carUsesFallback.clear();
    this.carIntakeReports.clear();
    this.textureLoader.dispose();
    this.stadiumTextures = {};
    this.context = null;
    this.state = "IDLE";
  }
}
