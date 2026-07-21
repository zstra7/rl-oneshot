---
name: threejs-postprocessing
description: Low-resolution render target, EffectComposer pass ordering, and nearest-neighbor upscale for the PSX visual pipeline.
---

# Three.js Postprocessing (r160)

## Pipeline shape

```text
Render scene -> low-res WebGLRenderTarget
  -> quantize/dither pass (custom ShaderPass)
  -> restrained glow pass (optional, event-driven only)
  -> nearest-neighbor upscale to native canvas size
```

Use `EffectComposer` + `RenderPass` + custom `ShaderPass` from `three/addons/postprocessing/...`. Do not hand-roll composer plumbing from scratch when the addon covers it.

## Low-resolution target

```ts
const target = new THREE.WebGLRenderTarget(internalWidth, internalHeight, {
  minFilter: THREE.NearestFilter,
  magFilter: THREE.NearestFilter,
  generateMipmaps: false
});
```

`internalWidth/internalHeight` come from the active PSX visual preset (authentic/balanced/clean), not the canvas's native size. Recompute only on preset change or resize — never per frame.

## Final upscale

The final blit to the canvas-sized backbuffer must use `NearestFilter` sampling (no linear blur) to preserve the blocky look for "authentic"; "clean" preset may switch to `LinearFilter` for the final upscale only, still keeping internal quantization/dither.

## UI isolation

The PSX composite chain renders only `SharedEnvironmentRoot`/`StadiumRoot`/`DynamicGameplayRoot`/`VfxRoot`/`MenuPresentationRoot`. Vue-rendered UI is native-resolution DOM/CSS composited on top of the canvas by the browser — it must never pass through the low-res render target or quantization pass.

## Performance

Reuse `EffectComposer`/`ShaderPass`/render-target instances across frames and matches; only rebuild them when the resolution preset or canvas size actually changes. Track composer pass time in `RuntimeDiagnostics` per the core spec's performance coordination section.
