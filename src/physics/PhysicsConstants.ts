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
