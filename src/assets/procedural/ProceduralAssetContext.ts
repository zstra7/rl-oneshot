import type * as THREE from "three";

import type { ProceduralPhysicsMetadata, StadiumGenerationDimensions } from "@/assets/AssetTypes";
import { GeometryRegistry } from "@/assets/procedural/GeometryRegistry";
import { MaterialRegistry } from "@/assets/procedural/MaterialRegistry";
import type { ProceduralRandom } from "@/assets/procedural/SeededRandom";

export type VisualPreset = "authentic" | "balanced" | "clean";

export interface ProceduralAssetContext {
  readonly three: typeof THREE;

  readonly geometryRegistry: GeometryRegistry;
  readonly materialRegistry: MaterialRegistry;

  readonly random: ProceduralRandom;

  readonly visualPreset: VisualPreset;
  readonly stadiumDimensions: StadiumGenerationDimensions;

  readonly physicsMetadata: ProceduralPhysicsMetadata;
}
