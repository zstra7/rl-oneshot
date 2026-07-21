---
name: threejs-animation
description: AnimationMixer usage for supplied car GLB clips (wheel spin, suspension) and procedural transform animation for menu presentation.
---

# Three.js Animation (r160)

## GLB clips

- If a supplied car GLB includes `AnimationClip`s (e.g. wheel spin), drive them with one `THREE.AnimationMixer` per car instance, not per clip. Do not create a mixer per frame.
- Prefer driving wheel rotation procedurally from physics wheel angular velocity (`wheel.rotation.x += ...` using a pre-allocated scratch value) rather than mixer-driven clips when the physics module already exposes per-wheel spin state — this keeps visuals authoritative-state-driven rather than time-driven, matching the render-snapshot interpolation model in the core architecture spec.
- Reserve `AnimationMixer`/clips for content that has no physics-authoritative source (idle canopy glint, menu presentation objects).

## Procedural animation

- Menu presentation (rotating car showcase, drifting starfield) uses render-frame delta time (`context.frameDeltaSeconds` from `RenderFrameContext`), not wall-clock `Date.now()`, so it pauses correctly when the tab is backgrounded and stays consistent with the rest of the render-frame order.
- Never drive gameplay-relevant transforms (car body, ball) from animation timelines — those are always interpolated from physics render snapshots per the fixed-tick/render-frame split.

## Cleanup

Call `mixer.stopAllAction()` and drop the mixer reference on match/menu-instance disposal; `AnimationAction`s hold references to their target `Object3D` and will leak if not released.
