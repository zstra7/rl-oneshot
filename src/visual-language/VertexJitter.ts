import * as THREE from "three";

import type { JitterCategory } from "@/visual-language/PsxRenderSettings";
import { JITTER_STRENGTH_BY_CATEGORY } from "@/visual-language/PsxRenderSettings";

/**
 * PSX visual stadium spec section 8: snaps clip-space vertex position to a
 * coarse grid, in screen space *after* the MVP matrix (injected right
 * after three's own `<project_vertex>` chunk, which is where
 * `gl_Position` is first assigned) so the snapping grid stays stable
 * relative to the camera regardless of per-object transforms — exactly
 * the ordering the spec requires ("must operate in screen space after
 * the MVP matrix has consumed the interpolated transforms").
 *
 * "Strength" (spec's per-category table, e.g. cars 0.65, ball 0.25) is
 * not a blend factor in the conceptual shader — there is only a hard
 * snap-to-grid. It is interpreted here as inversely scaling the
 * effective grid resolution (`baseGrid / strength`): a higher strength
 * snaps to a coarser (smaller-resolution) grid, producing more visible
 * jitter; a lower strength snaps to a much finer grid, producing barely-
 * perceptible jitter. Strength 0 disables jitter for that material
 * entirely (stars/UI/debug geometry).
 */
const JITTER_VERTEX_UNIFORMS = `
uniform vec2 uJitterResolution;
uniform float uJitterEnabled;
`;

const JITTER_VERTEX_SNAP = `
#include <project_vertex>
if (uJitterEnabled > 0.5) {
  vec2 ndc = gl_Position.xy / gl_Position.w;
  ndc = floor(ndc * uJitterResolution + 0.5) / uJitterResolution;
  gl_Position.xy = ndc * gl_Position.w;
}
`;

export interface JitteredMaterialHandle {
  readonly material: THREE.Material;
  readonly category: JitterCategory;
  setBaseGridResolution(width: number, height: number): void;
  setEnabled(enabled: boolean): void;
}

const registeredHandles: JitteredMaterialHandle[] = [];

/**
 * Keyed by material identity, not `material.userData` — `THREE.Material
 * .copy()`/`.clone()` deep-JSON-clones `userData`
 * (`JSON.parse(JSON.stringify(source.userData))`), which would both drop
 * the handle's function properties and throw on the handle's own
 * `material` back-reference (a circular structure). A `WeakMap` also
 * means a cloned material (e.g. `CarAssetLoader`'s per-team clone) is
 * correctly treated as needing its own fresh jitter hook — `clone()`
 * does not carry over a source material's `onBeforeCompile` override
 * either (also not part of `Material.prototype.copy()`).
 */
const materialHandles = new WeakMap<THREE.Material, JitteredMaterialHandle>();

/**
 * Wires PSX vertex jitter into `material` via `onBeforeCompile` — three.js
 * recompiles the program and this runs again whenever `material.needsUpdate`
 * is set, so any previously-attached hook is preserved and chained rather
 * than overwritten.
 */
export function applyVertexJitter(material: THREE.Material, category: JitterCategory): JitteredMaterialHandle {
  const existing = materialHandles.get(material);
  if (existing) {
    return existing;
  }

  const strength = JITTER_STRENGTH_BY_CATEGORY[category];

  const uniforms = {
    uJitterResolution: { value: new THREE.Vector2(240, 135) },
    uJitterEnabled: { value: strength > 0 ? 1 : 0 }
  };
  let baseGrid = { width: 240, height: 135 };

  function recomputeResolution(): void {
    if (strength <= 0) {
      uniforms.uJitterResolution.value.set(baseGrid.width, baseGrid.height);
      return;
    }
    uniforms.uJitterResolution.value.set(baseGrid.width / strength, baseGrid.height / strength);
  }
  recomputeResolution();

  const previousOnBeforeCompile = material.onBeforeCompile.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    previousOnBeforeCompile(shader, renderer);
    shader.uniforms["uJitterResolution"] = uniforms.uJitterResolution;
    shader.uniforms["uJitterEnabled"] = uniforms.uJitterEnabled;
    shader.vertexShader = `${JITTER_VERTEX_UNIFORMS}\n${shader.vertexShader}`.replace(
      "#include <project_vertex>",
      JITTER_VERTEX_SNAP
    );
  };
  material.needsUpdate = true;

  const handle: JitteredMaterialHandle = {
    material,
    category,
    setBaseGridResolution(width, height) {
      baseGrid = { width, height };
      recomputeResolution();
    },
    setEnabled(enabled) {
      uniforms.uJitterEnabled.value = enabled && strength > 0 ? 1 : 0;
    }
  };
  materialHandles.set(material, handle);
  registeredHandles.push(handle);
  return handle;
}

/** Broadcasts a new base jitter grid / global enabled flag to every material registered so far (preset switch). */
export function updateAllJitterHandles(baseGrid: { width: number; height: number }, enabled: boolean): void {
  for (const handle of registeredHandles) {
    handle.setBaseGridResolution(baseGrid.width, baseGrid.height);
    handle.setEnabled(enabled);
  }
}

/** Test/dispose hook — clears the module-level registry (e.g. between Vitest cases or on full pipeline teardown). */
export function clearJitterRegistry(): void {
  registeredHandles.length = 0;
}
