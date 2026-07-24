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
  /** WS8.B: the two plain-concrete floor-panel variants, tiled across the paneled floor. */
  readonly floorPanelSet?: readonly THREE.Texture[];
  /** WS8.B: painted accent panels used within 10m of each goal (player-side, opponent-side). */
  readonly floorAccentPlayer?: THREE.Texture;
  readonly floorAccentOpponent?: THREE.Texture;
}

/** G1: the space backdrop's own textures, separate from the stadium's — currently just the moon. */
export interface SpaceBackdropTextures {
  readonly moon?: THREE.Texture;
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
  readonly spaceTextures?: SpaceBackdropTextures;
}
