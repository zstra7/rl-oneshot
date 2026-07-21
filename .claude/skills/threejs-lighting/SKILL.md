---
name: threejs-lighting
description: Light rig composition and shadow budgets for a PS1-era stadium scene rendered at low internal resolution.
---

# Three.js Lighting (r160)

## Rig

A stable low-cost rig for the stadium:

- One `THREE.DirectionalLight` as the key light (arena "floodlight"), with shadows enabled.
- One `THREE.HemisphereLight` (sky/ground color) for cheap ambient fill — avoids flat unlit PSX shadows reading as pure black.
- Optional small `THREE.PointLight`s for boost-pad glow and goal-grid accents, but cap the concurrent count (budget: ≤6 active point lights) and prefer emissive materials + VFX sprites over more real lights for stars/trails.

## Shadows

- Only the key `DirectionalLight` casts shadows. Configure a tight `shadow.camera` frustum sized to the playable arena bounds (not the whole skybox) to keep shadow-map resolution useful at low texel density — this suits the blocky PSX look.
- `renderer.shadowMap.type = THREE.PCFShadowMap` (not `PCFSoftShadowMap`) — soft shadows read as anachronistically smooth for the target aesthetic and cost more.
- Cars and ball are the only dynamic shadow casters; static stadium geometry can bake into a single shadow pass without per-frame updates (`light.shadow.autoUpdate = false` once the stadium is stable, manually calling `shadow.needsUpdate = true` if the stadium regenerates).

## Budget

Track light count and shadow-casting count in `RuntimeDiagnostics.renderer`. Do not add lights ad hoc when a VFX designer wants "more glow" — prefer emissive material tuning or bloom-adjacent PSX glow (see `threejs-postprocessing`) first.
