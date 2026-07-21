/**
 * Phase 9 "one Medium-like parameter set" tuning (core architecture spec
 * section 65). Difficulty tiers, humanisation/mistake modelling, and
 * reaction-delay perception (AI spec sections 6-7, 34) are Phase 10
 * scope — these are the bare values a single competent-but-not-perfect
 * opponent needs.
 */
export const AI_CONSTANTS = {
  /** Proportional gain from heading error (radians) to steer [-1,1]. */
  steerGain: 2.2,

  /** Use boost while driving when aligned within this heading error (radians). */
  boostAlignmentThreshold: 0.2,
  /** Only boost below this fraction of the no-boost top speed. */
  boostSpeedFraction: 0.92,

  /** Powerslide when turning sharper than this while moving reasonably fast. */
  powerslideAngleThreshold: 1.1,
  powerslideMinimumSpeed: 8,

  /** Ball prediction (AI spec section 10, analytical fallback). */
  predictionHorizonSeconds: 2.5,
  predictionSampleIntervalSeconds: 0.1,

  /** Reachability heuristic (AI spec section 11: no iterative solvers). */
  reachabilityAverageSpeed: 15,
  reachabilityTurnPenaltySeconds: 0.4,
  reachabilityMargin: 0.25,

  /** Defence. */
  ownGoalDangerDistance: 32,
  defensiveShadowDistance: 5,
  defensiveGoalStandoff: 3,

  /** Shot aiming: how far behind the ball (away from the target goal) to aim. */
  shotApproachOffset: 1.6,
  possessionRadius: 3.0,

  /**
   * Only bother attacking a ball estimated reachable within this many
   * seconds — otherwise a "comparably fast as the human" comparison
   * alone would have the AI chase every distant loose ball instead of
   * ever collecting boost or holding a defensive position.
   */
  attackReachTimeLimit: 3.5,

  /** Boost management. Pad search radius comes from AiDifficultyParameters.boostPadAwarenessRadius. */
  boostReserveThreshold: 40,
  boostCriticalThreshold: 15,

  /** Recovery (airborne self-righting via pitch/roll, AI spec section 26.1). */
  recoveryGain: 3.0,
  recoveryDamping: 0.35
} as const;
