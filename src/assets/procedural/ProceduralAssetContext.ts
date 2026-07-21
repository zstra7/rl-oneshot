import type * as THREE from "three";

import type { ProceduralPhysicsMetadata, StadiumGenerationDimensions } from "@/assets/AssetTypes";
import { GeometryRegistry } from "@/assets/procedural/GeometryRegistry";
import { MaterialRegistry } from "@/assets/procedural/MaterialRegistry";
import type { ProceduralRandom } from "@/assets/procedural/SeededRandom";

export type VisualPreset = "authentic" | "balanced" | "clean";

/**
 * Supplied textures actually wired into a procedural surface so far (Phase
 * 12 proof-of-integration — see docs/asset-pipeline-deviations.md; full
 * stadium re-texturing is Phase 14). `undefined` when the pipeline hasn't
 * loaded them yet (e.g. the scratch registries `createProceduralPreview`
 * builds) — consumers fall back to a flat colour material in that case.
 */
export interface StadiumSurfaceTextures {
  readonly floor?: THREE.Texture;
  readonly wall?: THREE.Texture;
}

export interface ProceduralAssetContext {
  readonly three: typeof THREE;

  readonly geometryRegistry: GeometryRegistry;
  readonly materialRegistry: MaterialRegistry;

  readonly random: ProceduralRandom;

  readonly visualPreset: VisualPreset;
  readonly stadiumDimensions: StadiumGenerationDimensions;

  readonly physicsMetadata: ProceduralPhysicsMetadata;

  readonly stadiumTextures?: StadiumSurfaceTextures;
}
