# Integration Deviations

Record any point where the implementation had to deviate from a module
specification's exact contract in order to keep modules integrated.

## Phase 0

- `three@0.160.0` ships no bundled TypeScript declarations, contrary to the
  core architecture spec's assumption ("Do not install `@types/three`;
  Three.js includes its own types" — section 3.3). Installed the
  exact-matching `@types/three@0.160.0` devDependency so
  `vue-tsc --noEmit` can type-check `three` imports. No runtime behaviour
  change; see `docs/build-decisions.md` for full detail.
