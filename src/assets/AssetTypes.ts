export type AssetPipelineState =
  | "IDLE"
  | "VALIDATING_SKILLS"
  | "VALIDATING_MANIFEST"
  | "LOADING_AUTHORED_ASSETS"
  | "VALIDATING_AUTHORED_ASSETS"
  | "BUILDING_PROCEDURAL_RESOURCES"
  | "WARMING_SHADERS"
  | "READY"
  | "FAILED";

export interface ProceduralSeeds {
  readonly stadium: number;
  readonly starfield: number;
  readonly menuScene: number;
  readonly ambientParticles: number;
  readonly goalCelebration: number;
  readonly testPresentation: number;
}

/** Fixed standard seeds so screenshots/tests are repeatable across runs. */
export const DEFAULT_PROCEDURAL_SEEDS: ProceduralSeeds = {
  stadium: 1000,
  starfield: 2000,
  menuScene: 3000,
  ambientParticles: 4000,
  goalCelebration: 5000,
  testPresentation: 9000
};

export interface AssetLoadProgress {
  readonly loaded: number;
  readonly total: number;
  readonly ratio: number;
  readonly currentUrl: string | null;
  readonly phase: AssetPipelineState;
}

export interface AssetLoadError {
  readonly url: string;
  readonly message: string;
}

export interface Vec3Data {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Placeholder physics metadata until Phase 3 (physics foundation) defines
 * the authoritative ball radius / car hitbox / boost pad layout. These
 * values intentionally match what the physics module spec is expected to
 * use, but Phase 3 is the source of truth once it lands — see
 * docs/asset-pipeline-deviations.md.
 */
export interface ProceduralPhysicsMetadata {
  readonly ballRadius: number;
  readonly carHitboxSize: Vec3Data;
}

export const PLACEHOLDER_PHYSICS_METADATA: ProceduralPhysicsMetadata = {
  ballRadius: 0.9,
  carHitboxSize: { x: 1.2, y: 0.8, z: 1.9 }
};

export interface StadiumGenerationDimensions {
  readonly fieldLength: number;
  readonly fieldWidth: number;
  readonly interiorHeight: number;

  readonly goalWidth: number;
  readonly goalHeight: number;
  readonly goalDepth: number;

  readonly cornerRadius: number;
}

export const DEFAULT_STADIUM_DIMENSIONS: StadiumGenerationDimensions = {
  fieldLength: 60,
  fieldWidth: 40,
  interiorHeight: 20,
  goalWidth: 10,
  goalHeight: 6,
  goalDepth: 4,
  cornerRadius: 4
};
