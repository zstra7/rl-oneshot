# Architecture Summary

See `plan/core_application_architecture_build_integration_spec.md` for the
full specification. This file is a short developer-facing summary; it does
not replace the spec.

- One `GameRuntime`, one `requestAnimationFrame` loop, one Rapier world, one
  `AudioContext`.
- Vue owns UI only (menus, HUD, settings, overlays, loading, debug panels).
- Three.js owns rendering. Rapier owns gameplay physics.
- Dependency layers (higher may import lower, never the reverse):
  1. Shared types/utilities
  2. Assets, input, physics primitives
  3. Physics systems, procedural stadium definitions
  4. AI, game flow, camera, rendering, VFX
  5. Integration/core runtime
  6. Vue stores and components
- Module contract versions are centralised in `src/core/ContractRegistry.ts`
  and validated at boot and in `npm run validate:contracts`.
