/**
 * Tunable calibration values (physics spec section 7.2). Kept as one typed
 * registry so future phases calibrate without rewriting the architecture.
 * Fields beyond `carWorld`/`ballWorld` are unused until Phase 5 (car
 * mechanics) implements the controllers that read them.
 */
export interface PhysicsParameters {
  suspension: {
    restLength: number;
    maximumLength: number;
    probeRadius: number;
    springStrength: number;
    dampingStrength: number;
    maximumAcceleration: number;
    requiredGroundContacts: number;
  };

  grip: {
    normalRate: number;
    normalMaxAcceleration: number;
    powerslideRate: number;
    powerslideMaxAcceleration: number;
    blendTime: number;
  };

  steering: {
    response: number;
    maximumYawAcceleration: number;
    powerslideYawMultiplier: number;
    uprightStrength: number;
    uprightDamping: number;
  };

  carWorld: {
    friction: number;
    restitution: number;
  };

  ballWorld: {
    friction: number;
    restNormalSpeed: number;
    rollingDrag: number;
  };

  jump: {
    secondJumpWindow: number;
    resetNormalThreshold: number;
  };

  dodge: {
    inputDeadzone: number;
    linearImpulse: number;
    activeDuration: number;
    recoveryDuration: number;
    angularAcceleration: number;
    flipCancelPitchDeceleration: number;
    explicitBallHitBonus: number;
  };

  aerial: {
    rollDamping: number;
    pitchDamping: number;
    yawDamping: number;
    dampingInputReduction: number;
  };

  carBall: {
    baseFriction: number;
    extraHitBaseScale: number;
    extraHitForwardScale: number;
    extraHitMinimumPunch: number;
    extraHitMaximumDeltaSpeed: number;
    recontactSeparation: number;
  };
}

export const DEFAULT_PHYSICS_PARAMETERS: PhysicsParameters = {
  suspension: {
    restLength: 0.17,
    maximumLength: 0.22,
    probeRadius: 0.03,
    springStrength: 70,
    dampingStrength: 10,
    maximumAcceleration: 25,
    requiredGroundContacts: 3
  },

  grip: {
    normalRate: 12,
    normalMaxAcceleration: 60,
    powerslideRate: 2,
    powerslideMaxAcceleration: 18,
    blendTime: 0.075
  },

  steering: {
    response: 12,
    maximumYawAcceleration: 25,
    powerslideYawMultiplier: 1.35,
    uprightStrength: 35,
    uprightDamping: 8
  },

  carWorld: {
    friction: 0.1,
    restitution: 0.05
  },

  ballWorld: {
    friction: 0.285,
    restNormalSpeed: 0.2,
    rollingDrag: 0
  },

  jump: {
    secondJumpWindow: 1.25,
    resetNormalThreshold: 0.65
  },

  dodge: {
    inputDeadzone: 0.5,
    linearImpulse: 5.0,
    activeDuration: 0.65,
    recoveryDuration: 0.15,
    angularAcceleration: 35,
    flipCancelPitchDeceleration: 45,
    explicitBallHitBonus: 1.8
  },

  aerial: {
    rollDamping: 3,
    pitchDamping: 2,
    yawDamping: 2,
    dampingInputReduction: 0.65
  },

  carBall: {
    baseFriction: 0.3,
    extraHitBaseScale: 0.55,
    extraHitForwardScale: 0.35,
    extraHitMinimumPunch: 1.2,
    extraHitMaximumDeltaSpeed: 25,
    recontactSeparation: 0.02
  }
};

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};
