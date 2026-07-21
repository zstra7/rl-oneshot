# Current Phase

Phase: 12 — User Texture Integration
Status: Complete — exit criteria verified
Last verified commit: (this commit)

## Working
- `src/assets/textures/TextureTypes.ts`: the asset pipeline spec section
  22 `TextureAssetDescriptor` type plus `isColorSpaceSemantic` (section
  23's colour-vs-data semantic split).
- `scripts/generate-texture-manifest.mjs` + `src/assets/textures/
  TextureManifestData.ts`: scans `public/assets/textures/`, reads each
  PNG's real header (dimensions, alpha presence) without a decode
  dependency, and generates the 298-entry manifest plus
  `docs/texture-intake-report.md` (spec section 25). Deliberately
  excludes the 3 vendor catalog/preview images that shipped alongside the
  real textures (not in-game assets — see `docs/asset-attribution.md`).
- `src/assets/textures/TextureAssetLoader.ts`: a cached
  `THREE.TextureLoader` (cache-by-id) that configures colour space
  (section 23), the 4 filtering profiles (section 24: pixel / pixel-
  mipmapped / surface / data), wrap/repeat/flipY per descriptor, and
  falls back per section 26 (dev/test checker for a missing required
  texture, a shared semantic fallback — white/flat-normal/noise/etc — for
  a missing optional one; fallbacks are DOM-independent `DataTexture`s,
  shared single instances, never generated per caller).
- `src/assets/textures/TextureValidation.ts`: spec section 25's
  duplicate-manifest-id check (static) and per-loaded-texture checks
  (zero/failed-decode dimensions, hard dimension limit, non-POT-with-
  mipmaps warning, colour-space-vs-semantic mismatch warnings, aspect
  ratio deviation).
- `AssetManifest.ts`: `textures` is now populated from the generated
  manifest (298 entries); `validateAssetManifest` gained the duplicate-id
  check.
- `AssetPipeline.ts`: `loadAndValidateStadiumTextures()` (called from
  `initialise()`) loads and validates two curated textures
  (`ConcreteFloor-01_64`, `ConcretePanel-01_64`) and stores them on the
  new `ProceduralAssetContext.stadiumTextures`; the new public
  `loadTexture(descriptor)` loads+validates any other manifest entry on
  demand.
- `StadiumGeometryFactory.ts`: the floor/wall/ceiling materials now use
  the real supplied textures as their `map` (falling back to the prior
  flat colour when no texture is present, e.g. in a scratch preview
  context), with `repeat` scaled to the stadium's actual dimensions.
- `docs/texture-intake-report.md` (generated, all 298 files) and
  `docs/asset-attribution.md` (spec section 27, both the car and the
  texture library, including an honest "licence unknown" flag for the
  latter — no licence metadata shipped with the supplied files).

## Failing
- None. All Phase 12 exit criteria verified locally in this session.

## Deferred
- **Full stadium re-texturing** (using more than 2 of the 298 supplied
  textures — hazard stripes, painted variants, vents, pipes-and-cables,
  metal grates/mesh, the tiling grid set, curved-transition/glass-panel
  surfaces, etc.) is explicitly Phase 14 ("Stadium art and VFX") per the
  Master Brief, not this phase's scope — see
  `docs/asset-pipeline-deviations.md`.
- KTX2/compressed-texture support (spec section 21) — the supplied
  library is plain PNG, so no transcoder is configured.
- Per-material `repeat`/`expectedAspectRatio`/`maximumDimension` tuning
  beyond the two currently-applied textures — the other 296 manifest
  entries use the generator's uniform defaults (`repeat: {1,1}`, no
  aspect/dimension overrides) since nothing consumes them yet.
- A dedicated `?assetLab=1` texture browser UI (spec section 58) — still
  out of scope per the Phase 2 precedent; the generated intake report and
  `window.__ASSET_TEST__` cover the "developer needs visibility" need.

## Tests passing
- `npm run validate` — all four validators pass (`validate-assets.mjs`
  now also checks `public/assets/textures/`).
- `npm run type-check` (`vue-tsc --noEmit`) — zero errors.
- `npm run test:unit` (Vitest) — 17 files, 147 tests, all passing,
  including a new `textureAsset.spec.ts` (18 tests): the generated
  manifest's shape/count/exclusions, `GAME_ASSET_MANIFEST` validation,
  `isColorSpaceSemantic`'s full semantic split, all 4 filtering profiles,
  every `validateLoadedTexture` branch, and `TextureAssetLoader`'s
  fallback/caching/sharing behaviour. All 129 prior tests (Phases 1-11)
  still pass unchanged.
- `npm run build` (validate -> type-check -> unit -> `vite build`) —
  passes on a plain production build.
- Playwright: all 47 prior tests still pass, plus a new
  `tests/assets/texture-visual.spec.ts` (3 tests): the pipeline loads the
  supplied stadium textures with zero errors, no third-party/external
  texture requests are made (only same-origin supplied files), and the
  stadium renders successfully with the pipeline reaching `READY` — 50/50
  total on `chromium-dev` and `chromium-preview`. Verified visually via a
  Playwright screenshot showing the real concrete panel/floor textures
  tiled across the stadium walls and floor, replacing the prior flat grey
  placeholder colour.

## Next exact task
- Begin Phase 13 (PSX visual language) per `plan/MASTER_BUILD_BRIEF.md` —
  low-resolution render target, dithering, vertex jitter, and a limited
  colour palette. Required reading before starting: the relevant PSX
  rendering sections of the visual-language/rendering spec (not yet
  identified/read in this session — check `plan/` for the right spec
  file). Do not touch stadium art/VFX (Phase 14) yet.

## Known deviations
- 298 supplied textures were all classified `semantic: "color"` — no
  separate normal/roughness/metalness/AO maps were supplied (checked
  against the full filename list before writing the manifest generator).
- No manifest texture is marked `required: true` yet (see
  `docs/asset-pipeline-deviations.md` Phase 12 for why).
- Only 2 of 298 supplied textures are currently wired into a material
  (stadium floor + walls/ceiling) — full stadium re-texturing is Phase 14.
- Texture library licence is unspecified/unknown — flagged in
  `docs/asset-attribution.md` for the project owner to confirm.
- Carried over from Phase 1-11: `window.__GAME_TEST__`/`__ASSET_TEST__`/
  `__PHYSICS_TEST__`/`__INPUT_TEST__` only install when `__TEST_BUILD__`
  is true, which the literal `test:release` script (plain `npm run
  build`) does not set — see `docs/build-decisions.md`. A benign
  `@dimforge/rapier3d-compat`-internal console warning is still observed
  at boot.
