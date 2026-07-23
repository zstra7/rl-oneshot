# Procedural Asset Calibration Log

## 2026-07-21 — Phase 2 initial pass

- Camera: the interim `PlaceholderSceneRenderer` camera was moved from
  outside the stadium blockout (`(0, 30, 75)` looking at origin, which
  only showed the exterior of an opaque wall) to inside the arena
  (`(16, 10, 24)` looking at `(0, 2, 0)`), so the ball/car/goal cutout are
  actually visible for the "development menu can show placeholder world"
  exit criterion. Verified via a manual Playwright screenshot.
- Lighting: one `HemisphereLight(0x445577, 0x0a0510, 0.8)` +
  one `DirectionalLight(0xffffff, 1.1)` was enough for
  `MeshStandardMaterial` surfaces to read clearly without washing out the
  dark-space art direction. No further tuning done — full lighting budget
  work is Phase 8/14.
- Ball seams: chose the "duplicate slightly enlarged edge layer" method
  (wireframe icosahedron at `radius * 1.015`) over vertex-color/shader
  approaches for Phase 2 since it needed no custom shader and reads
  clearly at a glance; revisit if the PSX pass (Phase 13) wants a
  different seam treatment.
- Starfield: 3 layers (400/600/800 points, radii 80-340) gave a readable
  parallax-ready background without overwhelming draw calls (3 total,
  one `THREE.Points` per layer).
