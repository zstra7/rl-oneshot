import type { CarAssetDescriptor, CarTeamId, TeamVisualProfile } from "@/assets/cars/CarModelTypes";
import { VISUAL_PALETTE } from "@/visual-language/PsxVisualPalette";

/**
 * The single supplied `car.glb` (Sketchfab "PSX style Pontiac Ventura
 * 1977's" by spatka, CC-BY-4.0 — see docs/car-intake-report.md) is shared
 * by both team slots, per asset pipeline spec section 85's "one shared
 * `car.glb` with both manifest entries referencing it" option.
 */
const SHARED_CAR_URL = "/assets/cars/car.glb";

/**
 * Loaded (via `THREE.GLTFLoader` + `Box3.setFromObject`, the authoritative
 * source — an earlier manual binary-GLB parse mislabelled the axes and was
 * discarded) raw bounds: X (width) spans ~3.83, Y (up) spans ~2.43 from
 * ~0 (wheel/ground contact) to ~2.4 (roof), Z (length) spans ~9.08,
 * roughly centred on 0. The source file already complies with glTF's
 * nominal Y-up convention (up = +Y); only the forward sign needed
 * confirming, done visually via a Playwright screenshot (car nose vs tail)
 * — see docs/car-intake-report.md. `car.glb` has no separate wheel nodes
 * or boost-socket nodes (both meshes are static), so `wheelNodes`/
 * `boostSockets` are left undefined — per spec section 18 "a car without
 * animated wheels remains valid".
 */
const EXPECTED_FORWARD_AXIS = "+Z" as const;
const EXPECTED_UP_AXIS = "+Y" as const;

/**
 * The source model's up (+Y) already matches world-up, so no rotation is
 * needed on that axis. Its nose (hood/grille/bumper, confirmed visually
 * via a Playwright screenshot looking down -Z at the model) faces +Z,
 * opposite this project's physics-car local frame
 * (`Vec3Math.LOCAL_FORWARD` = -Z) — a 180 degree rotation about Y corrects
 * it.
 */
const CAR_VISUAL_ROTATION_EULER = { x: 0, y: Math.PI, z: 0 };

/**
 * Uniform compromise scale: the source model has realistic-sedan
 * proportions (length/width ratio ~2.4) while the physics hitbox has
 * stubby Rocket-League proportions (~1.4), so no single uniform scale
 * exactly fills the OBB on every axis — spec section 16 explicitly permits
 * this ("does not need to exactly fill the OBB, but should closely
 * correspond"). This value was chosen to keep the car's on-field footprint
 * (width/height, most visually load-bearing from the chase camera) close
 * to the physics hitbox, accepting a visually longer body.
 */
const CAR_VISUAL_SCALE = 0.2;

/**
 * X/Z centre the raw mesh's bounding-box centroid on the physics hitbox
 * centre; Y instead aligns the raw mesh's ground-contact point (its
 * bounding-box minimum, ~0, since the source was authored with its origin
 * near the wheel base) to sit `CAR_HALF_EXTENTS.y` below the hitbox centre
 * — see docs/car-intake-report.md for the derivation.
 */
const CAR_VISUAL_OFFSET = { x: -0.0074, y: -0.1744, z: -0.0268 };

const CAR_TEAM_TINT_TARGETS: CarAssetDescriptor["teamTintTargets"] = [
  { matchBy: { materialName: "M_car" }, role: "team-primary", required: true },
  { matchBy: { materialName: "M_Wheels" }, role: "wheel", required: false }
];

function buildCarDescriptor(id: "player-car" | "opponent-car"): CarAssetDescriptor {
  return {
    id,
    url: SHARED_CAR_URL,
    expectedForwardAxis: EXPECTED_FORWARD_AXIS,
    expectedUpAxis: EXPECTED_UP_AXIS,
    visualScale: CAR_VISUAL_SCALE,
    visualOffset: CAR_VISUAL_OFFSET,
    visualRotationEuler: CAR_VISUAL_ROTATION_EULER,
    teamTintTargets: CAR_TEAM_TINT_TARGETS,
    shadowMode: "cast-receive",
    required: true
  };
}

export const PLAYER_CAR_DESCRIPTOR: CarAssetDescriptor = buildCarDescriptor("player-car");
export const OPPONENT_CAR_DESCRIPTOR: CarAssetDescriptor = buildCarDescriptor("opponent-car");

/** PSX visual spec section 6: "Cyan body strips"/"Magenta body strips" team identity. */
const TEAM_VISUAL_PROFILES: Record<CarTeamId, TeamVisualProfile> = {
  player: {
    teamId: "player",
    primary: VISUAL_PALETTE.playerCyan,
    secondary: VISUAL_PALETTE.playerCyanDark,
    emissive: VISUAL_PALETTE.playerCyan,
    patternId: "chevron-a"
  },
  opponent: {
    teamId: "opponent",
    primary: VISUAL_PALETTE.opponentMagenta,
    secondary: VISUAL_PALETTE.opponentMagentaDark,
    emissive: VISUAL_PALETTE.opponentMagenta,
    patternId: "chevron-b"
  }
};

export function getTeamVisualProfile(team: CarTeamId): TeamVisualProfile {
  return TEAM_VISUAL_PROFILES[team];
}

/**
 * R12.2: multiplies each RGB channel of a `#rrggbb` hex string by `factor`
 * (0-1, darkens as it drops below 1) and re-encodes it, clamped/rounded per
 * channel. Pure and side-effect-free so it is unit-testable without a
 * THREE.Color/canvas context. Accepts only well-formed 6-digit hex (the
 * settings-store validation layer is the enforcement point for anything
 * user-supplied; this helper assumes it's already been validated).
 */
export function darkenHex(hex: string, factor: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) {
    throw new Error(`darkenHex: expected a #rrggbb hex string, got "${hex}"`);
  }
  const raw = match[1]!;
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);

  const scale = (channel: number): string => {
    const scaled = Math.round(Math.min(255, Math.max(0, channel * factor)));
    return scaled.toString(16).padStart(2, "0");
  };

  return `#${scale(r)}${scale(g)}${scale(b)}`;
}

/**
 * R12.2: the "player" team-visual profile derived from a user-chosen body
 * colour (Customise Car menu) instead of the fixed cyan default —
 * `AssetPipeline.createCarVisual("player")` uses this in place of
 * `getTeamVisualProfile("player")` whenever an override is set. The
 * secondary/trim colour is the primary darkened 45% (factor 0.55, i.e.
 * `darkenHex(hex, 0.55)`) so body and trim stay visually related the same
 * way the built-in cyan/cyan-dark and magenta/magenta-dark pairs do;
 * emissive matches the primary so the neon strip glows the chosen colour.
 * Exported standalone (rather than only reachable through the full GLB-
 * loading `AssetPipeline`) so unit tests can assert the colour derivation
 * without constructing a pipeline/WebGL context.
 */
export function derivePlayerProfile(hex: string): TeamVisualProfile {
  return deriveTeamProfile("player", hex);
}

/**
 * P2.3 (plan/ONLINE_POLISH_PLAN.md): generalises `derivePlayerProfile` to
 * either team, so an online opponent's chosen body colour can be applied to
 * `car-opponent` the same way a local player's Customise Car choice is
 * applied to `car-player`. Keeps that team's own pattern (chevron-a for
 * player, chevron-b for opponent) so silhouettes stay distinguishable.
 */
export function deriveTeamProfile(team: CarTeamId, hex: string): TeamVisualProfile {
  return {
    teamId: team,
    primary: hex,
    secondary: darkenHex(hex, 0.55),
    emissive: hex,
    patternId: TEAM_VISUAL_PROFILES[team].patternId
  };
}

export function getCarDescriptor(team: CarTeamId): CarAssetDescriptor {
  return team === "player" ? PLAYER_CAR_DESCRIPTOR : OPPONENT_CAR_DESCRIPTOR;
}
