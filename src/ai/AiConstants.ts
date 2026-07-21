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

  /** Shot aiming: how far behind the ball (away from the target goal) to aim. */
  approachOffset: 1.3,
  /** Only worth requesting boost once further than this from the target. */
  possessionRadius: 3.0,

  /**
   * WS6 (plan/POLISH_OVERHAUL_PLAN.md) chase-and-shoot planner: below
   * this dot product between the shot direction and car-to-ball
   * direction, the car is roughly between the ball and the goal it's
   * attacking and needs to loop around rather than push the ball the
   * wrong way.
   */
  wrongSideDotThreshold: -0.15,
  /** Loop-around target: how far behind the ball, and how far to the side. */
  loopBehindDistance: 6,
  loopSideDistance: 5,

  /** Keep planned targets this far inside the arena walls. */
  arenaMargin: 1.5,

  /** Stuck detection: pushing forward without gaining speed. */
  stuckSpeedThreshold: 1.0,
  stuckTicksThreshold: 90,
  unstuckDurationTicks: 84,

  /** Recovery (airborne self-righting via pitch/roll, AI spec section 26.1). */
  recoveryGain: 3.0,
  recoveryDamping: 0.35
} as const;
