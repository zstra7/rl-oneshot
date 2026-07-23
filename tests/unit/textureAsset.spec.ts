import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { GAME_ASSET_MANIFEST, validateAssetManifest } from "@/assets/AssetManifest";
import { applyFilteringProfile, TextureAssetLoader } from "@/assets/textures/TextureAssetLoader";
import { TEXTURE_MANIFEST_ENTRIES } from "@/assets/textures/TextureManifestData";
import type { TextureAssetDescriptor } from "@/assets/textures/TextureTypes";
import { isColorSpaceSemantic } from "@/assets/textures/TextureTypes";
import { validateLoadedTexture, validateTextureManifestIds } from "@/assets/textures/TextureValidation";

function buildDescriptor(overrides: Partial<TextureAssetDescriptor> = {}): TextureAssetDescriptor {
  return {
    id: "test-texture",
    url: "/assets/textures/test.png",
    semantic: "color",
    required: false,
    filtering: "pixel-mipmapped",
    wrapS: "repeat",
    wrapT: "repeat",
    repeat: { x: 1, y: 1 },
    flipY: true,
    ...overrides
  };
}

describe("TEXTURE_MANIFEST_ENTRIES (generated)", () => {
  it("has 298 entries, all classified color, all with unique ids", () => {
    expect(TEXTURE_MANIFEST_ENTRIES.length).toBe(298);
    expect(TEXTURE_MANIFEST_ENTRIES.every((e) => e.semantic === "color")).toBe(true);
    expect(validateTextureManifestIds(TEXTURE_MANIFEST_ENTRIES)).toEqual([]);
  });

  it("excludes the vendor preview/catalog images (Listing_image, Render, Thumbnail)", () => {
    const ids = TEXTURE_MANIFEST_ENTRIES.map((e) => e.id);
    expect(ids).not.toContain("Listing_image");
    expect(ids).not.toContain("Render");
    expect(ids).not.toContain("Thumbnail");
  });

  it("is wired into GAME_ASSET_MANIFEST.textures and passes validateAssetManifest", () => {
    expect(Object.keys(GAME_ASSET_MANIFEST.textures).length).toBe(298);
    expect(validateAssetManifest(GAME_ASSET_MANIFEST)).toEqual([]);
  });
});

describe("isColorSpaceSemantic (asset pipeline spec section 23)", () => {
  it("marks color/emissive/ui-color as sRGB", () => {
    expect(isColorSpaceSemantic("color")).toBe(true);
    expect(isColorSpaceSemantic("emissive")).toBe(true);
    expect(isColorSpaceSemantic("ui-color")).toBe(true);
  });

  it("marks data semantics as non-sRGB", () => {
    expect(isColorSpaceSemantic("normal")).toBe(false);
    expect(isColorSpaceSemantic("roughness")).toBe(false);
    expect(isColorSpaceSemantic("metalness")).toBe(false);
    expect(isColorSpaceSemantic("ao")).toBe(false);
    expect(isColorSpaceSemantic("mask")).toBe(false);
    expect(isColorSpaceSemantic("noise")).toBe(false);
    expect(isColorSpaceSemantic("height")).toBe(false);
    expect(isColorSpaceSemantic("alpha")).toBe(false);
  });
});

describe("applyFilteringProfile (asset pipeline spec section 24)", () => {
  it("pixel: nearest, no mipmaps", () => {
    const texture = new THREE.Texture();
    applyFilteringProfile(texture, "pixel");
    expect(texture.magFilter).toBe(THREE.NearestFilter);
    expect(texture.minFilter).toBe(THREE.NearestFilter);
    expect(texture.generateMipmaps).toBe(false);
  });

  it("pixel-mipmapped: nearest mag, nearest-mipmap-nearest min, mipmaps on", () => {
    const texture = new THREE.Texture();
    applyFilteringProfile(texture, "pixel-mipmapped");
    expect(texture.magFilter).toBe(THREE.NearestFilter);
    expect(texture.minFilter).toBe(THREE.NearestMipmapNearestFilter);
    expect(texture.generateMipmaps).toBe(true);
  });

  it("surface: linear filtering, mipmaps on", () => {
    const texture = new THREE.Texture();
    applyFilteringProfile(texture, "surface");
    expect(texture.magFilter).toBe(THREE.LinearFilter);
    expect(texture.minFilter).toBe(THREE.LinearMipmapLinearFilter);
    expect(texture.generateMipmaps).toBe(true);
  });

  it("data: linear, no mipmaps", () => {
    const texture = new THREE.Texture();
    applyFilteringProfile(texture, "data");
    expect(texture.magFilter).toBe(THREE.LinearFilter);
    expect(texture.minFilter).toBe(THREE.LinearFilter);
    expect(texture.generateMipmaps).toBe(false);
  });
});

describe("validateLoadedTexture (asset pipeline spec section 25)", () => {
  function fakeTexture(width: number, height: number, colorSpace: THREE.ColorSpace = THREE.SRGBColorSpace): THREE.Texture {
    const texture = new THREE.Texture();
    (texture as unknown as { image: { width: number; height: number } }).image = { width, height };
    texture.colorSpace = colorSpace;
    return texture;
  }

  it("errors on zero/missing dimensions (decode failure)", () => {
    const texture = new THREE.Texture(); // no .image set -> width/height undefined
    const result = validateLoadedTexture(buildDescriptor(), texture);
    expect(result.errors.some((e) => e.includes("zero dimensions"))).toBe(true);
  });

  it("errors when dimensions exceed the hard limit", () => {
    const texture = fakeTexture(4096, 4096);
    const result = validateLoadedTexture(buildDescriptor({ maximumDimension: 2048 }), texture);
    expect(result.errors.some((e) => e.includes("hard limit"))).toBe(true);
  });

  it("warns when a colour texture lacks sRGB colour space", () => {
    const texture = fakeTexture(64, 64, THREE.NoColorSpace);
    const result = validateLoadedTexture(buildDescriptor({ semantic: "color" }), texture);
    expect(result.warnings.some((w) => w.includes("lacks sRGB"))).toBe(true);
  });

  it("warns when a data texture is incorrectly marked sRGB", () => {
    const texture = fakeTexture(64, 64, THREE.SRGBColorSpace);
    const result = validateLoadedTexture(buildDescriptor({ semantic: "normal" }), texture);
    expect(result.warnings.some((w) => w.includes("incorrectly marked sRGB"))).toBe(true);
  });

  it("passes cleanly for a well-formed colour texture", () => {
    const texture = fakeTexture(64, 64, THREE.SRGBColorSpace);
    const result = validateLoadedTexture(buildDescriptor(), texture);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });
});

describe("TextureAssetLoader fallbacks (asset pipeline spec section 26)", () => {
  it("falls back to a shared white texture for a missing optional colour texture", async () => {
    const loader = new TextureAssetLoader();
    const descriptor = buildDescriptor({ id: "missing-optional", url: "/assets/textures/does-not-exist.png" });
    const texture = await loader.load(descriptor);
    expect(texture.name).toBe("FallbackWhite");
  });

  it("falls back to a shared flat normal texture for a missing optional normal map", async () => {
    const loader = new TextureAssetLoader();
    const descriptor = buildDescriptor({
      id: "missing-normal",
      url: "/assets/textures/does-not-exist-normal.png",
      semantic: "normal"
    });
    const texture = await loader.load(descriptor);
    expect(texture.name).toBe("FallbackFlatNormal");
  });

  it("caches by descriptor id — repeated load() calls for the same id resolve to the same texture instance", async () => {
    const loader = new TextureAssetLoader();
    const descriptor = buildDescriptor({ id: "cached-missing", url: "/assets/textures/does-not-exist-2.png" });
    const first = await loader.load(descriptor);
    const second = await loader.load(descriptor);
    expect(first).toBe(second);
  });

  it("never generates a new checker/fallback instance per call — fallbacks are shared across different missing descriptors of the same semantic", async () => {
    const loader = new TextureAssetLoader();
    const a = await loader.load(buildDescriptor({ id: "missing-a", url: "/assets/textures/missing-a.png" }));
    const b = await loader.load(buildDescriptor({ id: "missing-b", url: "/assets/textures/missing-b.png" }));
    expect(a).toBe(b);
  });
});
