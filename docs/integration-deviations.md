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

## Phase 17

Master Brief Phase 17 ("Integration hardening") has no dedicated module
specification of its own — it's a cross-cutting audit against the Master
Brief's own "Required Architecture" and "Never Do These" invariants, plus
the per-module `npm run test:<module>` focused-testing convention.

- **Found and fixed a real violation**: `VfxModule.ts` used `Math.random()`
  directly for particle spawn cosmetics (position jitter, velocity spread,
  size, lifetime) — a direct violation of "Never use Math.random() for
  gameplay," and inconsistent with every other randomness site in the
  codebase (AI, procedural assets, audio noise buffer), all of which use
  the deterministic mulberry32 `SeededRandom`. Replaced with a dedicated
  seeded `SeededRandom` instance private to `VfxModule` (not shared with
  the procedural-asset RNG, since particle cosmetics have no relationship
  to asset generation). Purely cosmetic (doesn't feed back into physics/
  AI/determinism), but fixing it removes the inconsistency and keeps a
  future determinism audit from flagging it.
- **Found and fixed real `package.json` script bugs**: `test:visual`
  pointed at a nonexistent `tests/visual` directory (the real directory is
  `tests/visual-language`) — the script would have silently matched zero
  tests. Fixed to `tests/visual-language tests/camera` (camera has its own
  Playwright suite but no dedicated `npm run test:<module>` entry, despite
  the Master Brief's own "Focused Playwright: `npm run test:<module>`"
  convention). Added `test:audio` and `test:ui` for the same reason — the
  Phase 16 and Phase 15 Playwright suites (`tests/ui/audio.spec.ts`,
  `tests/ui/settings.spec.ts`) had no per-module script entry point either.
- **Audited and confirmed clean**: no `reactive()`/`ref()` wrapping of
  `THREE.*` objects; no `THREE`/Rapier references inside any Pinia store;
  no remote (non-localhost) URL fetches anywhere in `src`; exactly one
  `AudioContext` construction site, one `requestAnimationFrame` loop, and
  Rapier world construction confined to `src/physics`.
- **Added `tests/integration/hardening.spec.ts`**: a cross-module smoke
  test running physics + AI + camera + VFX + audio simultaneously through
  a full match for an extended stretch (deterministic manual
  `stepFixedTicks`, not wall-clock waiting, once past the tick-driven
  countdown), asserting zero console errors/page errors, finite camera/
  VFX/audio diagnostics, and a clean `dispose()` mid-match — the class of
  bug that only surfaces when every system is live together, which no
  single-module Playwright suite exercises.
- **`tests/release` (referenced by the `test:release` script) still does
  not exist.** Playwright silently matches zero tests for a nonexistent
  directory rather than erroring, so `npm run test:release` currently runs
  only `tests/smoke` + `tests/integration` (now including the new
  hardening suite) — it does not fail, but has no release-specific tests
  yet. Deferred to Phase 18 ("Final build gate"), where a release-gate
  test suite is the natural deliverable.
