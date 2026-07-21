---
name: threejs-fundamentals
description: Three.js 0.160.0 scene graph, coordinate system, renderer setup, and resource-disposal fundamentals for Space Carball.
---

# Three.js Fundamentals (r160)

Audited against `three@0.160.0`. Import addons from `three/addons/...`, not `three/examples/jsm/...` (both resolve, but `three/addons` is the maintained alias).

## Scene graph

- One `THREE.Scene` owned by the renderer module (`src/camera`, `src/stadium`, `src/vfx` never create their own `Scene`).
- Use named root `Object3D` groups so subsystems attach/detach without searching:
  `SharedEnvironmentRoot`, `StadiumRoot`, `DynamicGameplayRoot`, `VfxRoot`, `MenuPresentationRoot`, `DebugRoot`.
- Coordinate convention for this project: **Y up**, **Z forward** for the pitch long axis, matching the Rapier world. Never introduce a second convention (e.g. Z-up) anywhere in visual code — physics dimensions are authoritative and the renderer must not rotate/rescale on ingestion.

## Renderer setup

```ts
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false, // PSX pipeline supplies its own low-res upscale
  powerPreference: "high-performance"
});
renderer.setPixelRatio(1); // pixel ratio is controlled by the PSX low-res render target, not the browser DPR
renderer.outputColorSpace = THREE.SRGBColorSpace;
```

Do not call `renderer.setSize` on every frame — only on `ResizeObserver` callbacks (see core architecture spec section 82).

## Object lifecycle

- Every `BufferGeometry`, `Material`, and `Texture` created outside a pooled factory must have a clear owner responsible for calling `.dispose()`.
- `Object3D.clear()` removes children without disposing GPU resources — always dispose geometries/materials/textures explicitly during teardown.
- Never allocate `new THREE.Vector3()` / `new THREE.Quaternion()` / `new THREE.Matrix4()` inside a per-frame `update()`/`tick()` function. Pre-allocate scratch instances at module or class scope and mutate them (`.set()`, `.copy()`, `.multiplyMatrices()`, etc.).

## Frame ownership

There is exactly one `requestAnimationFrame` loop, owned by `GameRuntime`. Camera, VFX, and stadium modules expose `updateRenderFrame(context)` and are called from that single loop — none of them may start their own RAF.
