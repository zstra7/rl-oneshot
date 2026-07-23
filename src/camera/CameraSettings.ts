/** WS4.B (plan/POLISH_OVERHAUL_PLAN.md): live-tunable chase-camera settings. */
export interface CameraSettings {
  /** Absolute vertical FOV, degrees. */
  readonly fov: number;
  /** Multiplier on CHASE_CAMERA_CONSTANTS.distance. */
  readonly distance: number;
  /** Multiplier on CHASE_CAMERA_CONSTANTS.height. */
  readonly height: number;
  /** Multiplier on positionSmoothingRate/yawSmoothingRate — higher = stiffer. */
  readonly stiffness: number;
  /** How strongly ball-cam pulls the aim toward the ball (1) vs. the car (0). */
  readonly ballLookStrength: number;
  readonly shakeIntensity: number;
  /** Mirrors settings.gameplay.cameraShakeEnabled — a separate settings
   * category, but the camera controller only needs one flat settings
   * shape of its own. */
  readonly shakeEnabled: boolean;
}

export const DEFAULT_CAMERA_SETTINGS: CameraSettings = {
  fov: 77,
  distance: 1,
  height: 1,
  stiffness: 1,
  ballLookStrength: 0.5,
  shakeIntensity: 1,
  shakeEnabled: true
};

function clampRange(value: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

export function clampCameraSettings(
  settings: Partial<CameraSettings>,
  base: CameraSettings = DEFAULT_CAMERA_SETTINGS
): CameraSettings {
  return {
    fov: clampRange(settings.fov ?? base.fov, 65, 90, base.fov),
    distance: clampRange(settings.distance ?? base.distance, 0.7, 1.6, base.distance),
    height: clampRange(settings.height ?? base.height, 0.6, 1.8, base.height),
    stiffness: clampRange(settings.stiffness ?? base.stiffness, 0.4, 2.0, base.stiffness),
    ballLookStrength: clampRange(settings.ballLookStrength ?? base.ballLookStrength, 0, 1, base.ballLookStrength),
    shakeIntensity: clampRange(settings.shakeIntensity ?? base.shakeIntensity, 0, 2, base.shakeIntensity),
    shakeEnabled: settings.shakeEnabled ?? base.shakeEnabled
  };
}
