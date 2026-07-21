import type { AssetResourceCounts } from "@/assets/AssetPipeline";
import type { AssetPipeline } from "@/assets/AssetPipeline";
import type { AssetLoadError, AssetLoadProgress, AssetPipelineState } from "@/assets/AssetTypes";

/**
 * Trimmed to what Phase 2 actually implements. `listCarReports` /
 * `createCarPreview` / texture-specific methods from the asset pipeline
 * spec section 59 are deferred until Phase 11/12 add real car/texture
 * intake — see docs/asset-pipeline-deviations.md.
 */
export interface BrowserAssetTestApi {
  ready(): boolean;
  getPipelineState(): AssetPipelineState;
  getLoadingProgress(): AssetLoadProgress;
  getErrors(): readonly AssetLoadError[];
  getSceneResourceCounts(): AssetResourceCounts;

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
