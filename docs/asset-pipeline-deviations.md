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
