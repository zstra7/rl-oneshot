# Three.js Skill Usage Log

Record which `.claude/skills/threejs-*` skill was consulted for each
significant Three.js subsystem, per the core architecture spec's requirement
to not rely on memory when a matching skill exists.

| Date | Subsystem | Skill(s) consulted |
|---|---|---|
| 2026-07-21 | Phase 0 placeholder canvas / renderer setup | threejs-fundamentals |
| 2026-07-21 | Phase 1 `PlaceholderSceneRenderer` (renderer/scene/camera lifecycle, dispose) | threejs-fundamentals |
| 2026-07-21 | Real `.claude/skills/threejs-*` content installed (see implementation-progress.md) | all ten |
| 2026-07-21 | Phase 2 procedural geometry (`GeometryRegistry`, `BoxGeometry`/`IcosahedronGeometry`/`CylinderGeometry`/`ConeGeometry`/`CircleGeometry` blockout/ball/car fallback) | threejs-geometry |
| 2026-07-21 | Phase 2 shared material registry, `MeshStandardMaterial`/`MeshBasicMaterial` role reuse, instance-clone tinting | threejs-materials |
| 2026-07-21 | Phase 2 `HemisphereLight`+`DirectionalLight` minimal rig for `PlaceholderSceneRenderer` | threejs-lighting |
| 2026-07-21 | Phase 2 starfield (`THREE.Points`, `BufferGeometry` custom position/size attributes, one draw call per layer) | threejs-geometry |
| 2026-07-21 | Phase 3 `PhysicsRenderBinding` debug meshes (wireframe box/sphere, per-frame `.position.set()`/`.quaternion.set()` mutation instead of allocating new Vector3/Quaternion per frame) | threejs-fundamentals |

