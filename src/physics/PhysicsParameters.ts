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
    /**
     * G6 (plan/GAME_ENHANCEMENTS_PLAN.md): how much of the CAR's own
     * velocity change from a ball contact this tick actually sticks — 1.0
     * keeps Rapier's raw (fully symmetric) solver result, lower values damp
     * how much the ball shoves the car around on contact without touching
     * the ball's own bounce. Real Rocket League's mass ratio is already
     * matched (180:30, same as ours); this exists because Rapier resolves
     * that ratio's contact more symmetrically than Bullet did, which reads
     * as the ball affecting the car "a little too much" on a hit.
     */
    ballPushbackScale: number;
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

  // F5 (plan/ARENA_FLUSH_AND_REFINEMENTS_PLAN.md): retuned toward RL's
  // published damping values now that aerial rotation is integrated in
  // velocity-space (previously these values were fighting a torque-
  // impulse path that was ~23x too weak to expose how little damping was
  // actually happening).
  aerial: {
    rollDamping: 4.95,
    pitchDamping: 2.8,
    yawDamping: 3.2,
    dampingInputReduction: 0.65
  },

  carBall: {
    baseFriction: 0.3,
    extraHitBaseScale: 0.55,
    extraHitForwardScale: 0.35,
    extraHitMinimumPunch: 1.2,
    extraHitMaximumDeltaSpeed: 25,
    recontactSeparation: 0.02,
    ballPushbackScale: 0.55
  }
};

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};
