---
name: threejs-shaders
description: ShaderMaterial/RawShaderMaterial patterns for vertex jitter, color quantization, and Bayer dithering in the PSX render pipeline.
---

# Three.js Shaders (r160)

## Material choice

- `ShaderMaterial` for effects that still participate in Three's built-in lighting uniforms and camera/projection wiring (vertex jitter overlay on a lit surface).
- `RawShaderMaterial` for full-screen post-processing passes (color quantization, dither) where you supply 100% of the GLSL, including `precision`/`#version` — do not duplicate a `precision` qualifier that `ShaderMaterial` already injects, a common r160 build failure.
- Three r160 uses WebGL2 by default (`THREE.WebGLRenderer` picks the WebGL2 context); GLSL3 (`glslVersion: THREE.GLSL3`) is available on `ShaderMaterial`/`RawShaderMaterial` if you need `in`/`out` syntax, otherwise GLSL1-style `varying`/`gl_FragColor` still works.

## Vertex jitter (PSX wobble)

Snap clip-space position to a coarse grid in the vertex shader after the standard MVP transform:

```glsl
vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
vec2 snapped = floor(clip.xy / clip.w * uJitterResolution) / uJitterResolution * clip.w;
clip.xy = snapped;
gl_Position = clip;
```

Drive `uJitterResolution` from the low-res render target size, not a fixed constant, so it always matches the current PSX resolution preset.

## Color quantization + Bayer dither

Implemented as a full-screen post pass (see `threejs-postprocessing`): sample the scene render target, quantize each channel to N levels, and add a per-pixel Bayer threshold (4x4 or 8x8 matrix, encoded as a small `DataTexture` or inline `const` array) before quantizing to avoid visible banding.

## Uniform hygiene

- Pre-allocate uniform value objects once (`{ value: new THREE.Vector2() }`) and mutate `.value` in the render-frame update — never replace the uniforms object per frame.
- Always call `material.dispose()` for custom shader materials on teardown; they do not auto-release compiled GL programs otherwise.

## Debugging

Read compile errors from the browser console (r160 surfaces full GLSL source + line numbers). Isolate a failing shader in a minimal Playwright/Vitest fixture before touching the full PSX composite chain.
