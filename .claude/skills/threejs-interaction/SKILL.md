---
name: threejs-interaction
description: Raycasting, pointer/resize interaction, and camera-collision queries against stadium geometry without touching gameplay physics.
---

# Three.js Interaction (r160)

## Scope boundary

Visual-layer interaction (menu car showcase clicks, debug-overlay picking, camera-collision raycasts against stadium geometry) uses Three.js's own `Raycaster` against the render scene graph. It never substitutes for or duplicates Rapier collision — gameplay hit-testing stays exclusively in the physics module.

## Raycaster reuse

```ts
const raycaster = new THREE.Raycaster(); // one instance, module-scoped
const origin = new THREE.Vector3();       // pre-allocated scratch
const direction = new THREE.Vector3();
```

Set `.set(origin, direction)` per query rather than constructing a new `Raycaster`/`Vector3` each call. This applies directly to the "no `new` in per-frame code" rule from the core architecture spec.

## Camera collision

Chase-camera collision avoidance (keeping the camera from clipping through stadium glass/geometry) raycasts from the desired look-at point back toward the ideal camera position against a dedicated `StadiumRoot` collision layer (use `raycaster.layers` or an explicit mesh allowlist array, not the full scene graph, to keep the query cheap).

## Resize interaction

`GameCanvas.vue` owns a `ResizeObserver` on the canvas element and forwards size changes into the renderer/camera through an explicit method call (`renderer.handleResize(width, height)`), not by having camera/render code poll `canvas.clientWidth` every frame.

## Pointer events

Menu-only pointer interaction (hover/click on a showcased car, debug gizmos) is normal DOM pointer events on the canvas, converted to NDC coordinates for raycasting. Gameplay input never goes through this path — see the input-controls module for gameplay pointer/gamepad handling.
