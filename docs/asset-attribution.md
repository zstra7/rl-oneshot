# Asset Attribution

Maintained per asset production pipeline spec section 27. The pipeline
cannot infer legal rights — attribution/licence information below is what
could be recovered from the supplied files themselves (embedded glTF
`asset.extras` metadata for the car; nothing equivalent was bundled with
the texture pack). Confirm/complete licence status with the project owner
before any public distribution of this repository or a build of it.

## car-glb

Type: 3D model (GLB 2.0)
Source file: `public/assets/cars/car.glb` (shared by both `player-car` and
`opponent-car` descriptors — see `src/assets/cars/CarDescriptors.ts`)
Provided by: "PSX style Pontiac Ventura 1977's" by spatka (Sleepless) —
https://sketchfab.com/3d-models/psx-style-pontiac-ventura-1977s-8a63069b223e4ab88bac635d886559c7
Author profile: https://sketchfab.com/spatka
This matches the file's own embedded `asset.extras` metadata (author
"spatka", title "PSX style Pontiac Ventura 1977's", sourced from Sketchfab).
Licence/status: CC-BY-4.0 (Creative Commons Attribution 4.0 International) —
https://creativecommons.org/licenses/by/4.0/ — as declared both on the
Sketchfab model page and in the file's own `asset.extras.license` field.
Attribution to spatka (Sleepless), with a link to the original model and to
the licence, is required under that licence's terms if this project is
distributed. No changes to the model are indicated here, though the licence
also permits distribution of modified versions provided they are marked as
changed.
Modification policy: loaded read-only through `CarAssetLoader` (asset
pipeline spec section 11.4 "never overwrite supplied GLB, never bake
runtime team colours into the source file") — the shipped `.glb` on disk
is byte-identical to what was supplied; all team-tint/scale/orientation
adjustment happens on cloned runtime copies only (see
`docs/car-intake-report.md`).
Used by: both cars in every live match and the main-menu presentation
(`src/integration/PhysicsRenderBinding.ts`, `AssetPipeline.buildPlaceholderWorld`).
Notes: see `docs/car-intake-report.md` for the full technical intake
report (mesh/material/triangle counts, bounds, axis findings).

## stadium-texture-library

Type: texture library (298 PNG files, 32x64/64x64 tiling PSX-style
surface textures — concrete floors/walls/panels, metal panels/grates/
mesh, corrugated metal, vents, pipes-and-cables, hazard-stripe and
colour-coded painted variants, a tiling grid set)
Source files: `public/assets/textures/*.png` — full per-file catalogue in
`docs/texture-intake-report.md`
Provided by: unspecified — no author/licence metadata was bundled with
the supplied files. Three files that accompanied the pack
(`Listing_image.png`, `Render.png`, `Thumbnail.png` — a marketplace-style
catalog/preview image, hero render, and thumbnail respectively) suggest
this is a commercially- or freely-distributed third-party texture pack,
but the pack's own name/vendor/licence terms were not included in what
was supplied to this repository. These three files were intentionally
**not** moved into `public/` or added to the manifest (they are not
in-game textures) — left in place at `assets/textures/` as the only
remaining trace of the original pack's identity.
Licence/status: **unknown/unspecified — confirm with the project owner
before public distribution.**
Modification policy: loaded read-only through `TextureAssetLoader`; no
supplied texture file is ever overwritten or re-exported.
Used by: currently `ConcreteFloor-01_64.png` (stadium floor) and
`ConcretePanel-01_64.png` (stadium walls/ceiling) via
`StadiumGeometryFactory.ts` — see `docs/asset-pipeline-deviations.md`
Phase 12 for why only these two of the 298 supplied files are wired into
a material so far (full stadium art direction is Phase 14). Every other
entry is catalogued in the manifest and loadable on demand via
`AssetPipeline.loadTexture()`.
Notes: see `docs/texture-intake-report.md` for the full per-file catalogue
(dimensions, semantic classification, alpha presence, warnings).

No other 3D models or images are used; everything else is generated in
code (see `plan/asset_production_pipeline_module_spec.md` sections 28+).

## Fonts (WS9.A, plan/POLISH_OVERHAUL_PLAN.md)

Two Google Fonts families, both SIL Open Font License 1.1, downloaded
during implementation and self-hosted at `public/fonts/` (never linked
at runtime — `tests/release/release-gate.spec.ts` requires zero
non-localhost requests from a live match).

- **Russo One** (weight 400) — `public/fonts/russo-one-400.woff2`.
  Display face: title lockup, countdown, GOAL/OVERTIME banners, results
  screen. Source: https://github.com/google/fonts/tree/main/ofl/russoone
  Licence: `public/fonts/OFL-RussoOne.txt`.
- **Chakra Petch** (weights 400, 600, 700, 700-italic) —
  `public/fonts/chakra-petch-{400,600,700,700i}.woff2`. UI face: menu
  items, labels, HUD numerals, settings. Source:
  https://github.com/google/fonts/tree/main/ofl/chakrapetch
  Licence: `public/fonts/OFL-ChakraPetch.txt`.

`@font-face` rules live in `src/styles/retro-ui.css`, imported once from
`src/main.ts`.
