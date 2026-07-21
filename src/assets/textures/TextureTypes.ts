/** Asset pipeline spec section 22. */
export type TextureAssetId = string;

export type TextureSemantic =
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

export type TextureFiltering = "pixel" | "pixel-mipmapped" | "surface" | "data";
export type TextureWrap = "clamp" | "repeat" | "mirror";

export interface TextureAssetDescriptor {
  readonly id: TextureAssetId;
  readonly url: string;

  readonly semantic: TextureSemantic;
  readonly required: boolean;

  readonly filtering: TextureFiltering;

  readonly wrapS: TextureWrap;
  readonly wrapT: TextureWrap;

  readonly repeat: { readonly x: number; readonly y: number };

  readonly flipY: boolean;

  readonly expectedAspectRatio?: number;
  readonly maximumDimension?: number;

  readonly attributionId?: string;
}

/** Asset pipeline spec section 23: which semantics get sRGB vs linear/data colour space. */
const SRGB_SEMANTICS: ReadonlySet<TextureSemantic> = new Set(["color", "emissive", "ui-color"]);

export function isColorSpaceSemantic(semantic: TextureSemantic): boolean {
  return SRGB_SEMANTICS.has(semantic);
}
