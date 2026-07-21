# Asset Pipeline Deviations

Record deviations from `plan/asset_production_pipeline_module_spec.md`.

## Phase 0

- `.claude/skills/threejs-*` files were initially authored locally instead
  of vendored from `CloudAI-X/threejs-skills` (not accessible from this
  session).

## Phase 1

- Resolved: the user supplied the real skill content directly
  (`ACTUAL SKILLS TO USE/`, merged into `.claude/skills/threejs-*` and the
  staging folder removed). The Phase 0 placeholder content no longer
  applies. See `docs/implementation-progress.md` "Skill update".

## Phase 2

- `ballRadius`/`carHitboxSize` used by every procedural factory
  (`PLACEHOLDER_PHYSICS_METADATA` in `src/assets/AssetTypes.ts`) are
  asset-pipeline-authored placeholders, not values sourced from the
  physics module, because Phase 3 (physics) has not been implemented yet.
  The asset pipeline spec is explicit that physics dimensions are always
  authoritative (never the reverse) — Phase 3 must supply the real values
  and this placeholder must be removed/replaced at that point, not kept
  alongside a second authoritative source.
- `BrowserAssetTestApi` implements only `ready`, `getPipelineState`,
  `getLoadingProgress`, `getErrors`, `getSceneResourceCounts`,
  `rebuildProceduralPreview`, `disposePreview` — the full section 59
  interface also specifies car/texture-report and preview-camera methods
  that require car/texture intake (Phase 11/12), which do not exist yet.
- The development asset lab (`?assetLab=1`, section 58) was not built.
  It is optional developer tooling, not part of the Phase 2 exit criteria
  in `MASTER_BUILD_BRIEF.md`, and was skipped to stay within phase scope.
- Stadium blockout (`StadiumGeometryFactory.ts`) implements only floor,
  side walls, ceiling, and end walls with a rectangular goal cutout — no
  curved corner transitions, structural ribs, or glass layers (sections
  36-38). Those are explicitly Phase 14 ("Stadium art and VFX") per the
  Master Brief, not Phase 2's "basic stadium blockout".

## Phase 6

- `BoostPadVisualFactory.ts` implements only the states the physics
  module actually produces (`"active"`/`"respawning"`, driven by
  `BoostPadRenderBinding` from `pad.active`) plus an `"inactive"` state
  used only by the factory's own default/error handling. `"collected-
  pulse"` exists in the `BoostPadVisualState` union and is handled by
  `applyBoostPadVisualState()`, but nothing currently transitions a pad
  into it — a real flash-on-pickup VFX (distinct from just going straight
  to the dimmed "respawning" look) is deferred to Phase 14 (stadium art
  and VFX), consistent with all other VFX polish being out of scope until
  then.
- Per-pad ring materials are cloned via
  `MaterialRegistry.createInstanceMaterial`, one clone per `BoostPadId` —
  this is a deliberate, spec-consistent use of the registry's instance-
  material affordance (shared-by-default, explicit opt-out per instance
  when state must vary independently), not a new pattern invented outside
  the pipeline design.
