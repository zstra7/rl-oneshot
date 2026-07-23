/**
 * WS4 (plan/POLISH_OVERHAUL_PLAN.md): Rocket-League-accurate chase-camera
 * rig, replacing the original placeholder framing values. Converted at
 * 100uu = 1m from RL's own defaults/pro-standard settings (distance
 * 270uu, height 110uu, FOV 110 horizontal ≈ 77 vertical at 16:9,
 * stiffness ~0.45) — see the plan doc for sources.
 */
export const CHASE_CAMERA_CONSTANTS = {
  distance: 2.75,
  height: 1.1,
  fov: 77,
  /** Downward pitch bias applied to the aim point in normal cam, degrees. */
  angleDegrees: -4,

  // Stiffness model: position (and chase direction) lags smoothly behind
  // the car; the aim target stays crisp so the view doesn't feel laggy.
  positionSmoothingRate: 11,
  yawSmoothingRate: 8,
  targetSmoothingRate: 30,

  /** How far ahead of the camera direction the normal-cam aim point sits, metres. */
  aimAheadDistance: 4,
  aimHeightOffset: 0.4,

  /** Ball-cam aim point: lerp(ballPos, carPos, this) — pulls the aim
   * slightly toward the car so it doesn't sit dead-centre on the ball. */
  ballCamCarBias: 0.15,

  minHeightAboveFloor: 0.35,

  /** WS4.C: FOV widens slightly at supersonic speed for a subtle speed kick. */
  supersonicFovKick: 4,
  supersonicFovSmoothingRate: 6,

  /** WS4.D: impact camera shake. */
  shakeVelocityDeltaThreshold: 8,
  shakeMaxDeltaForFullEnergy: 30,
  shakeRadius: 20,
  shakeMaxOffset: 0.12,
  shakeDecayRate: 8,

  menuOrbitRadius: 20,
  menuOrbitHeight: 9,
  menuOrbitAngularSpeed: 0.05
} as const;
