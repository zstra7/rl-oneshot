import type { CarAssetDescriptor, CarTeamId, TeamVisualProfile } from "@/assets/cars/CarModelTypes";

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

const TEAM_VISUAL_PROFILES: Record<CarTeamId, TeamVisualProfile> = {
  player: {
    teamId: "player",
    primary: 0x3fa9ff,
    secondary: 0x0c2a3d,
    emissive: 0x1e5fff,
    patternId: "default"
  },
  opponent: {
    teamId: "opponent",
    primary: 0xff5a3f,
    secondary: 0x3d150c,
    emissive: 0xff3d1e,
    patternId: "default"
  }
};

export function getTeamVisualProfile(team: CarTeamId): TeamVisualProfile {
  return TEAM_VISUAL_PROFILES[team];
}

export function getCarDescriptor(team: CarTeamId): CarAssetDescriptor {
  return team === "player" ? PLAYER_CAR_DESCRIPTOR : OPPONENT_CAR_DESCRIPTOR;
}
