/** game-flow spec section 21: base gameplay chase-camera rig values. */
export const CHASE_CAMERA_CONSTANTS = {
  distance: 7.5,
  height: 3.2,
  lookAhead: 4.5,
  fov: 72,

  /**
   * Provisional framing/smoothing tuning, not given explicit numbers by
   * the spec ("Smoothed position", "Smoothed target", "ball-aware
   * framing" are described qualitatively only) — revisit during a
   * dedicated camera calibration pass if playtesting shows the feel is
   * off. See docs/build-decisions.md Phase 8 section.
   */
  positionSmoothingRate: 7,
  targetSmoothingRate: 11,

  maxFramingDistanceBoost: 6,
  maxFramingHeightBoost: 2,
  framingReferenceSeparation: 30,

  ballWeightNearField: 0.35,
  ballWeightBallCamera: 0.85,
  ballWeightReferenceDistance: 25,

  collisionMargin: 0.4,

  menuOrbitRadius: 20,
  menuOrbitHeight: 9,
  menuOrbitAngularSpeed: 0.05
} as const;
