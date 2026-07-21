import type { AssetResourceCounts } from "@/assets/AssetPipeline";
import type { AssetPipeline } from "@/assets/AssetPipeline";
import type { AssetLoadError, AssetLoadProgress, AssetPipelineState } from "@/assets/AssetTypes";
import type { CarAssetInspectionReport, CarTeamId } from "@/assets/cars/CarModelTypes";

/**
 * Trimmed to what Phase 2/11 actually implement. `createCarPreview` /
 * texture-specific methods from the asset pipeline spec section 59 are
 * still deferred until Phase 12 adds real texture intake — see
 * docs/asset-pipeline-deviations.md. `listCarReports` (spec section 59) is
 * implemented as `getCarIntakeReports`.
 */
export interface BrowserAssetTestApi {
  ready(): boolean;
  getPipelineState(): AssetPipelineState;
  getLoadingProgress(): AssetLoadProgress;
  getErrors(): readonly AssetLoadError[];
  getSceneResourceCounts(): AssetResourceCounts;
  getCarIntakeReports(): Record<CarTeamId, CarAssetInspectionReport | undefined>;
  isCarUsingFallback(team: CarTeamId): boolean;
  /** WS5.A: transparent glass shell mesh count + whether the floor stayed opaque. */
  getStadiumShellInfo(): { transparentMeshCount: number; floorMaterialOpaque: boolean };

  rebuildProceduralPreview(seed: number): AssetResourceCounts;
  disposePreview(): void;
}

declare global {
  interface Window {
    __ASSET_TEST__?: BrowserAssetTestApi;
  }
}

export function installAssetTestApi(pipeline: AssetPipeline): void {
  if (!(__DEV__ || __TEST_BUILD__)) {
    return;
  }

  const api: BrowserAssetTestApi = {
    ready: () => pipeline.getState() === "READY",
    getPipelineState: () => pipeline.getState(),
    getLoadingProgress: () => pipeline.getLoadingProgress(),
    getErrors: () => pipeline.getErrors(),
    getSceneResourceCounts: () => pipeline.getSceneResourceCounts(),
    getCarIntakeReports: () => {
      const reports = pipeline.getCarIntakeReports();
      return { player: reports.get("player"), opponent: reports.get("opponent") };
    },
    isCarUsingFallback: (team) => pipeline.isCarUsingFallback(team),
    getStadiumShellInfo: () => pipeline.getStadiumShellInfo(),
    rebuildProceduralPreview: (seed: number) => {
      const preview = pipeline.setProceduralPreviewSeed(seed);
      let geometries = 0;
      let materials = 0;
      preview.group.traverse((object) => {
        const mesh = object as { geometry?: unknown; material?: unknown };
        if (mesh.geometry) geometries += 1;
        if (mesh.material) materials += 1;
      });
      return { geometries, materials };
    },
    disposePreview: () => pipeline.disposePreview()
  };

  window.__ASSET_TEST__ = api;
}
