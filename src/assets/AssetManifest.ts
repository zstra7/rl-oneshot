import { PLAYER_CAR_DESCRIPTOR, OPPONENT_CAR_DESCRIPTOR } from "@/assets/cars/CarDescriptors";
import type { CarAssetDescriptor } from "@/assets/cars/CarModelTypes";
import { TEXTURE_MANIFEST_ENTRIES } from "@/assets/textures/TextureManifestData";
import type { TextureAssetDescriptor, TextureAssetId } from "@/assets/textures/TextureTypes";
import { validateTextureManifestIds } from "@/assets/textures/TextureValidation";

export type { TextureAssetDescriptor, TextureAssetId };

export interface ProceduralAssetManifest {
  readonly ball: true;
  readonly stadiumBlockout: true;
  readonly starfield: true;
}

export interface GameAssetManifest {
  readonly schemaVersion: 1;

  readonly cars: {
    readonly player: CarAssetDescriptor;
    readonly opponent: CarAssetDescriptor;
  };

  readonly textures: Record<TextureAssetId, TextureAssetDescriptor>;

  readonly procedural: ProceduralAssetManifest;
}

/**
 * Phase 11 wires the real supplied `car.glb` in for both car slots (asset
 * pipeline spec section 85's "one shared car.glb" option — see
 * `src/assets/cars/CarDescriptors.ts`). `AssetPipeline` still falls back
 * to `ProceduralCarFallback` per car if loading/validating either
 * descriptor fails outside production (spec section 20). Phase 12
 * populates `textures`.
 */
export const GAME_ASSET_MANIFEST: GameAssetManifest = {
  schemaVersion: 1,
  cars: {
    player: PLAYER_CAR_DESCRIPTOR,
    opponent: OPPONENT_CAR_DESCRIPTOR
  },
  textures: Object.fromEntries(TEXTURE_MANIFEST_ENTRIES.map((entry) => [entry.id, entry])),
  procedural: {
    ball: true,
    stadiumBlockout: true,
    starfield: true
  }
};

export function validateAssetManifest(manifest: GameAssetManifest): string[] {
  const errors: string[] = [];

  if (manifest.schemaVersion !== 1) {
    errors.push(`Unsupported asset manifest schemaVersion: ${manifest.schemaVersion}`);
  }

  const carDescriptors = [manifest.cars.player, manifest.cars.opponent];
  const seenIds = new Set<string>();
  for (const descriptor of carDescriptors) {
    if (seenIds.has(descriptor.id)) {
      errors.push(`Duplicate car descriptor id "${descriptor.id}".`);
    }
    seenIds.add(descriptor.id);

    if (descriptor.required && !descriptor.url) {
      errors.push(`Required car "${descriptor.id}" is missing a url.`);
    }
    if (descriptor.teamTintTargets.some((target) => target.required) === false) {
      errors.push(`Car "${descriptor.id}" declares no required team-tint target.`);
    }
  }

  for (const [id, descriptor] of Object.entries(manifest.textures)) {
    if (descriptor.required && !descriptor.url) {
      errors.push(`Required texture "${id}" is missing a url.`);
    }
  }
  errors.push(...validateTextureManifestIds(Object.values(manifest.textures)));

  return errors;
}
