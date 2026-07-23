import * as THREE from "three";

import type { AssetLoadError, AssetLoadProgress, AssetPipelineState } from "@/assets/AssetTypes";

/**
 * One project-owned THREE.LoadingManager (asset pipeline spec section 9).
 * Phase 2 has no required authored assets to load (procedural fallback
 * covers cars; no textures are required yet), so this reports an
 * immediately-complete progress state, but the same instance is reused by
 * GLTFLoader/TextureLoader once Phase 11/12 add real authored assets.
 */
export class AssetLoadingManager {
  public readonly manager = new THREE.LoadingManager();

  private currentUrl: string | null = null;
  private loaded = 0;
  private total = 0;
  private phase: AssetPipelineState = "IDLE";
  private readonly errors: AssetLoadError[] = [];

  public constructor() {
    this.manager.onStart = (url) => {
      this.currentUrl = url;
    };

    this.manager.onProgress = (url, loaded, total) => {
      this.currentUrl = url;
      this.loaded = loaded;
      this.total = total;
    };

    this.manager.onLoad = () => {
      this.currentUrl = null;
    };

    this.manager.onError = (url) => {
      this.errors.push({ url, message: `Failed to load "${url}".` });
    };
  }

  public setPhase(phase: AssetPipelineState): void {
    this.phase = phase;
  }

  public getProgress(): AssetLoadProgress {
    return {
      loaded: this.loaded,
      total: this.total,
      ratio: this.total > 0 ? this.loaded / this.total : 1,
      currentUrl: this.currentUrl,
      phase: this.phase
    };
  }

  public getErrors(): readonly AssetLoadError[] {
    return [...this.errors];
  }
}
