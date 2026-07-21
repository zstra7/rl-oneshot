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
    /** Seconds over which a flip-cancel blends the flip rate to zero (WS3). */
    flipCancelBlendSeconds: number;
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
    // Bumped from 12/60 (WS2, plan/POLISH_OVERHAUL_PLAN.md): the original
    // values let lateral velocity persist for ~0.5s+ after a turn, reading
    // as a long, loose drift rather than RL's near-instant rail grip.
    // Final values chosen empirically (ad hoc Vitest debugging, see
    // docs/physics-deviations.md) — the yaw/grip "acceleration" params are
    // applied as torque/linear impulses, not literal accelerations, so
    // their effective strength is scaled down by the car's actual
    // Rapier-computed moment of inertia/mass; the round numbers below are
    // what was needed to reach a genuinely snappy, non-oscillating feel,
    // not a value derived analytically from the constants' names.
    normalRate: 90,
    normalMaxAcceleration: 200,
    powerslideRate: 2,
    powerslideMaxAcceleration: 18,
    blendTime: 0.075
  },

  steering: {
    // Bumped from 12/25 (WS2), empirically tuned alongside grip above:
    // the yaw-rate servo's correction toward desiredYawRate=0 on steer
    // release was too slow, leaving residual yaw spinning for hundreds of
    // ms. At these values steady-state full-lock yaw rate converges to
    // within ~1% of the intended curvature-derived target
    // (maxCurvature(speed) * speed) and decays smoothly (no overshoot)
    // to near-zero within ~0.5s of releasing steer.
    response: 200,
    maximumYawAcceleration: 450,
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
    flipCancelBlendSeconds: 0.1,
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
