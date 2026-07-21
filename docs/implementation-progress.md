# Current Phase

Phase: 0 — Repository Foundation
Status: Complete — exit criteria verified
Last verified commit: (this commit)

## Working
- Vite + Vue 3 + TypeScript scaffold with pinned exact dependency versions
  (see `docs/build-decisions.md` for two version pins that had to deviate
  from the spec's literal numbers to actually work together).
- `App.vue` / `GameCanvas.vue` placeholder canvas that constructs a
  `THREE.WebGLRenderer` and reports `THREE.REVISION` for the boot smoke
  test.
- Pinia `applicationStore` with `AppState` (`BOOT` -> `MENU` on mount).
- `src/core/ContractRegistry.ts` with `CORE_APPLICATION_CONTRACT_VERSION`
  and `REQUIRED_MODULE_CONTRACTS`, covered by a Vitest unit test.
- `NullAudioModule` placeholder implementing the real `AudioModule`
  interface.
- Validation scripts: `validate-contracts`, `validate-threejs-skills`,
  `validate-assets`, `validate-architecture` — all pass.
- Ten `.claude/skills/threejs-*/SKILL.md` files (project-authored, since the
  external `CloudAI-X/threejs-skills` collection is not fetchable from this
  environment — see Known deviations).
- Playwright smoke test (`tests/smoke/boot.spec.ts`) verifying the canvas
  mounts, `THREE.REVISION === "160"`, and the app reaches `MENU` state —
  passing against both the dev server and the production preview server.
- Vitest unit tests for the contract registry and the skill-validation
  helper (including a "fails correctly when a skill is missing" case,
  manually re-verified by temporarily removing a skill file and confirming
  `validate:threejs-skills` exits non-zero).

## Failing
- None. All Phase 0 exit criteria verified locally in this session.

## Deferred
- Everything from Phase 1 onward (runtime loop, physics, input, AI,
  visuals, audio). No gameplay code exists yet, per Phase 0 exit criteria
  ("no game logic yet").

## Tests passing
- `npm run validate` — contracts, threejs-skills, assets, architecture: all
  pass.
- `npm run type-check` (`vue-tsc --noEmit`) — passes with zero errors.
- `npm run test:unit` (Vitest) — 2 files, 6 tests, all passing.
- `npm run build` (validate -> type-check -> unit -> `vite build`) —
  passes; `dist/` produced with expected `vue`/`three` manual chunks.
- `npx playwright test --project=chromium-dev tests/smoke` — 2/2 passing.
- `npx playwright test --project=chromium-preview tests/smoke` — 2/2
  passing (against `vite preview`).

## Next exact task
- Begin Phase 1 (core runtime and fixed-step loop) per
  `plan/MASTER_BUILD_BRIEF.md` and
  `plan/core_application_architecture_build_integration_spec.md` sections
  9, 14, 23-26, 46-53, 57. Required reading before starting: Core
  Architecture spec + this progress file only (per the brief's context
  limitation rule) — do not read the other five module specs yet.
  Implement `GameRuntime`, `GameRuntimeFactory`, `RuntimeClock`,
  `FixedStepCoordinator`, `FrameCoordinator`, `EventDispatcher`/
  `EventTypes`, `ErrorReporter`, `RuntimeDiagnostics`, the `ModuleContainer`
  wired to null/placeholder modules, HMR-safe disposal, and a manual
  fixed-tick Playwright test API (`window.__GAME_TEST__`) that can drive
  10,000 empty ticks deterministically without RAF.

## Known deviations
- The `CloudAI-X/threejs-skills` GitHub repository referenced by the asset
  pipeline specification is not accessible from this session (network/repo
  scope is limited to `zstra7/rl-oneshot`). The ten required
  `.claude/skills/threejs-*/SKILL.md` files were authored directly against
  the pinned `three@0.160.0` API surface instead of vendored from that
  collection. They cover the same ten topics and satisfy
  `validate-threejs-skills.mjs`. If the real collection becomes available
  later, replace these files and re-run visual regression per the spec's
  Three.js upgrade procedure.
- See `docs/build-decisions.md` and `docs/integration-deviations.md` for
  the `typescript`, `vitest`, and `@types/three`/`@types/node` version
  deviations required to make the pinned toolchain actually compile and
  type-check together.
