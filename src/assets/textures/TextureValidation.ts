import * as THREE from "three";

import { isColorSpaceSemantic, type TextureAssetDescriptor } from "@/assets/textures/TextureTypes";

export interface TextureValidationResult {
  readonly errors: string[];
  readonly warnings: string[];
}

const DEFAULT_HARD_DIMENSION_LIMIT = 2048;
const NON_POWER_OF_TWO_SEMANTICS_NEEDING_MIPMAPS = new Set(["color", "emissive"]);

function isPowerOfTwo(value: number): boolean {
  return value > 0 && (value & (value - 1)) === 0;
}

/** Asset pipeline spec section 25: "Fail if... Manifest ID duplicated." Static, needs no loaded texture. */
export function validateTextureManifestIds(descriptors: readonly TextureAssetDescriptor[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const descriptor of descriptors) {
    if (seen.has(descriptor.id)) {
      errors.push(`Duplicate texture manifest id "${descriptor.id}".`);
    }
    seen.add(descriptor.id);
  }
  return errors;
}

/**
 * Asset pipeline spec section 25 per-file checks/warnings, run once a
 * texture has actually been loaded (or has failed to — `image` is
 * `undefined` in that case, which itself is the "decode fails" required
 * check).
 */
export function validateLoadedTexture(
  descriptor: TextureAssetDescriptor,
  texture: THREE.Texture
): TextureValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const image = texture.image as { width?: number; height?: number } | undefined;
  const width = image?.width ?? 0;
  const height = image?.height ?? 0;

  if (!image || width === 0 || height === 0) {
    errors.push(`Texture "${descriptor.id}": zero dimensions or failed to decode.`);
    return { errors, warnings };
  }

  const hardLimit = descriptor.maximumDimension ?? DEFAULT_HARD_DIMENSION_LIMIT;
  if (width > hardLimit || height > hardLimit) {
    errors.push(`Texture "${descriptor.id}": ${width}x${height} exceeds the ${hardLimit}px hard limit.`);
  }

  if (
    descriptor.filtering === "pixel-mipmapped" &&
    NON_POWER_OF_TWO_SEMANTICS_NEEDING_MIPMAPS.has(descriptor.semantic) &&
    (!isPowerOfTwo(width) || !isPowerOfTwo(height))
  ) {
    warnings.push(`Texture "${descriptor.id}": non-power-of-two (${width}x${height}) but mipmaps are expected.`);
  }

  const shouldBeSrgb = isColorSpaceSemantic(descriptor.semantic);
  const isSrgb = texture.colorSpace === THREE.SRGBColorSpace;
  if (shouldBeSrgb && !isSrgb) {
    warnings.push(`Texture "${descriptor.id}": colour texture lacks sRGB colour space configuration.`);
  }
  if (!shouldBeSrgb && isSrgb) {
    warnings.push(`Texture "${descriptor.id}": data texture is incorrectly marked sRGB.`);
  }

  if (descriptor.expectedAspectRatio !== undefined) {
    const actual = width / height;
    const deviation = Math.abs(actual - descriptor.expectedAspectRatio) / descriptor.expectedAspectRatio;
    if (deviation > 0.1) {
      warnings.push(
        `Texture "${descriptor.id}": aspect ratio ${actual.toFixed(2)} deviates from expected ${descriptor.expectedAspectRatio.toFixed(2)}.`
      );
    }
  }

  return { errors, warnings };
}
