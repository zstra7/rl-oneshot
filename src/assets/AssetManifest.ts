export type TextureAssetId = string;

export interface CarAssetDescriptor {
  readonly id: string;
  /** "fallback" until Phase 11 wires a real supplied GLB into the manifest. */
  readonly source: "fallback" | "glb";
  readonly url?: string;
}

export interface TextureAssetDescriptor {
  readonly id: TextureAssetId;
  readonly url: string;
  readonly semantic:
    | "color"
    | "emissive"
    | "normal"
    | "roughness"
    | "metalness"
    | "ao"
    | "alpha"
    | "mask"
    | "height"
    | "noise"
    | "ui-color";
  readonly required: boolean;
}

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
 * Phase 2 manifest: no authored car/texture assets are required yet (the
 * procedural fallback car covers both slots). Phase 11/12 replace the
 * `cars` descriptors with real "glb" entries and populate `textures` once
 * the supplied car GLB / texture library are actually wired in.
 */
export const GAME_ASSET_MANIFEST: GameAssetManifest = {
  schemaVersion: 1,
  cars: {
    player: { id: "player", source: "fallback" },
    opponent: { id: "opponent", source: "fallback" }
  },
  textures: {},
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

  for (const [id, descriptor] of Object.entries(manifest.textures)) {
    if (descriptor.required && !descriptor.url) {
      errors.push(`Required texture "${id}" is missing a url.`);
    }
  }

  return errors;
}
