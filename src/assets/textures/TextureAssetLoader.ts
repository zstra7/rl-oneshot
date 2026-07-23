import * as THREE from "three";

import { isColorSpaceSemantic, type TextureAssetDescriptor, type TextureFiltering } from "@/assets/textures/TextureTypes";

/**
 * Asset pipeline spec section 26: shared fallback resources — one
 * instance each, reused by every consumer that asks for a missing
 * optional texture, never generated per-caller. A `DataTexture` (not
 * `CanvasTexture`/`document.createElement`) so this works identically in
 * a real browser and in Vitest's DOM-less Node test environment.
 */
function createCheckerTexture(): THREE.Texture {
  const size = 8;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      const magenta = (x + y) % 2 === 0;
      data[i] = magenta ? 255 : 0;
      data[i + 1] = 0;
      data[i + 2] = magenta ? 255 : 0;
      data[i + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  texture.name = "MissingRequiredTextureChecker";
  return texture;
}

function createWhiteTexture(): THREE.Texture {
  const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  texture.name = "FallbackWhite";
  return texture;
}

function createFlatNormalTexture(): THREE.Texture {
  const texture = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1);
  texture.needsUpdate = true;
  texture.name = "FallbackFlatNormal";
  return texture;
}

function createBlackTexture(): THREE.Texture {
  const texture = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  texture.needsUpdate = true;
  texture.name = "FallbackBlack";
  return texture;
}

function createNoiseTexture(): THREE.Texture {
  const size = 16;
  const data = new Uint8Array(size * size * 4);
  // Deterministic (not Math.random() — AI/asset spec-wide "no unseeded
  // randomness" convention) so the fallback is stable across runs.
  let state = 0x9e3779b9;
  for (let i = 0; i < size * size; i += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    const value = (state >>> 0) % 256;
    data[i * 4] = value;
    data[i * 4 + 1] = value;
    data[i * 4 + 2] = value;
    data[i * 4 + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.needsUpdate = true;
  texture.name = "FallbackNoise";
  return texture;
}

/** Applies asset pipeline spec section 24's filtering profiles. */
export function applyFilteringProfile(texture: THREE.Texture, filtering: TextureFiltering): void {
  switch (filtering) {
    case "pixel":
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
      texture.generateMipmaps = false;
      break;
    case "pixel-mipmapped":
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestMipmapNearestFilter;
      texture.generateMipmaps = true;
      break;
    case "surface":
      texture.magFilter = THREE.LinearFilter;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.generateMipmaps = true;
      break;
    case "data":
      texture.magFilter = THREE.LinearFilter;
      texture.minFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;
      break;
  }
  // Asset pipeline spec section 24: "Keep anisotropy low in authentic
  // mode... high anisotropy may undermine the intended retro texture
  // character." Left at the THREE default (1, i.e. off) for every profile.
}

const WRAP_MODE: Record<TextureAssetDescriptor["wrapS"], THREE.Wrapping> = {
  clamp: THREE.ClampToEdgeWrapping,
  repeat: THREE.RepeatWrapping,
  mirror: THREE.MirroredRepeatWrapping
};

/**
 * Asset pipeline spec section 26 fallback semantics — resolves an
 * appropriate shared fallback for an *optional* texture that is missing
 * or failed to load. Required-and-missing is handled separately by the
 * caller (spec: dev shows the checker, production fails the pipeline).
 */
function resolveOptionalFallback(descriptor: TextureAssetDescriptor, shared: SharedFallbacks): THREE.Texture {
  switch (descriptor.semantic) {
    case "normal":
      return shared.flatNormal;
    case "noise":
      return shared.noise;
    case "mask":
    case "alpha":
      return shared.white;
    case "roughness":
    case "metalness":
    case "ao":
    case "height":
      return shared.white;
    case "color":
    case "emissive":
    case "ui-color":
    default:
      return shared.white;
  }
}

interface SharedFallbacks {
  readonly checker: THREE.Texture;
  readonly white: THREE.Texture;
  readonly black: THREE.Texture;
  readonly flatNormal: THREE.Texture;
  readonly noise: THREE.Texture;
}

/**
 * Asset pipeline spec sections 12/22-26: a cached `THREE.TextureLoader`
 * (cache-by-descriptor-id) that configures colour space (23), filtering
 * profile + wrap/repeat/flipY (24), and falls back per section 26 when a
 * texture is missing/fails to decode — the dev/test checker for a
 * required-and-missing texture, a shared semantic fallback for an
 * optional-and-missing one. Fallback textures are created once and
 * shared, never one-per-caller.
 */
export class TextureAssetLoader {
  private readonly loader = new THREE.TextureLoader();
  private readonly cache = new Map<string, Promise<THREE.Texture>>();
  private readonly shared: SharedFallbacks = {
    checker: createCheckerTexture(),
    white: createWhiteTexture(),
    black: createBlackTexture(),
    flatNormal: createFlatNormalTexture(),
    noise: createNoiseTexture()
  };

  public async load(descriptor: TextureAssetDescriptor): Promise<THREE.Texture> {
    let pending = this.cache.get(descriptor.id);
    if (!pending) {
      pending = this.loadAndConfigure(descriptor);
      this.cache.set(descriptor.id, pending);
    }
    return pending;
  }

  private async loadAndConfigure(descriptor: TextureAssetDescriptor): Promise<THREE.Texture> {
    let texture: THREE.Texture;
    try {
      texture = await this.loader.loadAsync(descriptor.url);
    } catch (error) {
      if (descriptor.required) {
        if (import.meta.env.PROD) {
          throw new Error(
            `Required texture "${descriptor.id}" failed to load at "${descriptor.url}": ${String(error)}`
          );
        }
        return this.shared.checker;
      }
      return resolveOptionalFallback(descriptor, this.shared);
    }

    texture.name = descriptor.id;
    texture.colorSpace = isColorSpaceSemantic(descriptor.semantic) ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    applyFilteringProfile(texture, descriptor.filtering);
    texture.wrapS = WRAP_MODE[descriptor.wrapS];
    texture.wrapT = WRAP_MODE[descriptor.wrapT];
    texture.repeat.set(descriptor.repeat.x, descriptor.repeat.y);
    texture.flipY = descriptor.flipY;
    texture.needsUpdate = true;
    return texture;
  }

  public dispose(): void {
    this.cache.clear();
  }
}
