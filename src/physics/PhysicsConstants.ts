/**
 * Measured/reverse-engineered constants (physics spec section 7.1). Do not
 * mix these with tunable calibration values — those live in
 * PhysicsParameters.ts.
 */
export const RL_CONSTANTS = {
  physicsHz: 120,
  physicsDt: 1 / 120,

  gravity: 6.5,

  carMass: 180,
  ballMass: 30,

  carMaxSpeed: 23.0,
  noBoostDriveSpeed: 14.1,
  supersonicThreshold: 22.0,
  carMaxAngularSpeed: 5.5,

  ballRadius: 0.9125,
  ballMaxSpeed: 60.0,
  ballMaxAngularSpeed: 6.0,

  boostConsumptionPerSecond: 33.3,
  boostAccelerationGround: 9.91666,
  boostAccelerationAir: 10.58333,

  kickoffBoostAmount: 33,
  maximumBoostAmount: 100,

  smallBoostPadAmount: 12,
  smallBoostPadRespawnSeconds: 4,
  fullBoostPadRespawnSeconds: 10,

  brakeDeceleration: 35.0,
  coastDeceleration: 5.25,

  airThrottleForwardAcceleration: 0.66667,
  airThrottleReverseAcceleration: 0.33334,

  jumpDeltaVelocity: 2.92,
  jumpHoldAcceleration: 14.6,
  jumpHoldMaximumTime: 0.2,
  jumpHoldMinimumTicks: 3,

  stickyAcceleration: 3.25,
  stickyTicks: 3,

  maxYawAngularAcceleration: 9.11,
  maxPitchAngularAcceleration: 12.46,
  maxRollAngularAcceleration: 38.34,

  ballWorldRestitution: 0.6
} as const;

/** Octane-style car half-extents in metres (physics spec section 11.1). */
export const CAR_HALF_EXTENTS = {
  x: 0.421,
  y: 0.1808,
  z: 0.59005
} as const;

export const CAR_HITBOX_OFFSET = {
  x: 0,
  y: 0.2075,
  z: -0.1388
} as const;

/** Suspension probe anchors, local car space (physics spec section 16.1). */
const FRONT_AXLE_Z = -0.38;
const REAR_AXLE_Z = 0.33;
const HALF_TRACK_X = 0.29;
const WHEEL_ANCHOR_Y = -0.1;

export const WHEEL_ANCHORS_LOCAL = [
  { x: -HALF_TRACK_X, y: WHEEL_ANCHOR_Y, z: FRONT_AXLE_Z },
  { x: HALF_TRACK_X, y: WHEEL_ANCHOR_Y, z: FRONT_AXLE_Z },
  { x: -HALF_TRACK_X, y: WHEEL_ANCHOR_Y, z: REAR_AXLE_Z },
  { x: HALF_TRACK_X, y: WHEEL_ANCHOR_Y, z: REAR_AXLE_Z }
] as const;

export const SUSPENSION_PROBE_RADIUS = 0.03;

export const BRAKE_SWITCH_SPEED = 0.25;

/** physics spec section 17.3 throttle acceleration curve, in m/s². */
export function throttleAcceleration(speedAbs: number): number {
  const v = Math.max(0, speedAbs);

  if (v < 14.0) {
    return 16.0 - (16.0 / 14.0) * v;
  }
  if (v < 14.1) {
    return 1.6 - 16.0 * (v - 14.0);
  }
  return 0;
}

/** physics spec section 18.1 curvature function, converted to metres. */
export function maxCurvature(speed: number): number {
  const vUu = Math.max(0, Math.min(speed * 100, 2500));

  let curvaturePerUu: number;

  if (vUu < 500) {
    curvaturePerUu = 0.0069 - 5.84e-6 * vUu;
  } else if (vUu < 1000) {
    curvaturePerUu = 0.00561 - 3.26e-6 * vUu;
  } else if (vUu < 1500) {
    curvaturePerUu = 0.0043 - 1.95e-6 * vUu;
  } else if (vUu < 1750) {
    curvaturePerUu = 0.003025 - 1.1e-6 * vUu;
  } else {
    curvaturePerUu = 0.0018 - 4.0e-7 * vUu;
  }

  return Math.max(0, curvaturePerUu * 100);
}
