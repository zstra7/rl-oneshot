/**
 * G7.a (plan/GAME_ENHANCEMENTS_PLAN.md): what makes Rocket League's dodge
 * feel clean (per the RLBot community's reverse-engineering of RL's flip,
 * consistent with physics spec section 25) is that the flip rate is
 * FRONT-LOADED — angular velocity jumps to its peak immediately and
 * carries, then eases down through the back half of the flip instead of
 * holding one constant rate for the whole duration and snapping to zero at
 * the end. Our previous implementation used a metronome-constant rate for
 * the entire `activeDuration`, then hard-snapped angular velocity to just
 * its yaw component at the exact cutoff — the "missing smoothness" as felt
 * by a player.
 *
 * `flipRate` is a pure function of elapsed time: full rate for the first
 * `FRONT_LOAD_FRACTION` of the duration, then a linear ramp down to
 * `TAIL_END_RATE_FRACTION` of the peak by the end. The peak rate is solved
 * so the time-integral over `[0, activeDuration]` is exactly `2*PI` — a
 * full flip lands wheels-down by construction, for any `activeDuration`.
 */

const FRONT_LOAD_FRACTION = 0.55;
const TAIL_END_RATE_FRACTION = 0.25;

/**
 * Closed-form integral of the piecewise rate profile (front-load segment at
 * the peak rate, tail segment ramping linearly to `TAIL_END_RATE_FRACTION`
 * of the peak), expressed as a fraction of `peakRate * activeDuration`:
 *   front segment:  FRONT_LOAD_FRACTION * peakRate * T
 *   tail segment:   ((1 + TAIL_END_RATE_FRACTION) / 2) * peakRate * (1 - FRONT_LOAD_FRACTION) * T
 * Solving `integral == 2*PI` for `peakRate` gives
 * `peakRate = 2*PI / (INTEGRAL_COEFFICIENT * activeDuration)`.
 */
const INTEGRAL_COEFFICIENT =
  FRONT_LOAD_FRACTION + ((1 + TAIL_END_RATE_FRACTION) / 2) * (1 - FRONT_LOAD_FRACTION);

/** The constant peak rate (rad/s) that makes a full `activeDuration`-second flip integrate to exactly 2*PI. */
export function peakFlipRate(activeDuration: number): number {
  return (2 * Math.PI) / (INTEGRAL_COEFFICIENT * activeDuration);
}

/**
 * The flip's angular rate (rad/s) at `elapsed` seconds into a dodge of
 * `activeDuration` seconds: constant at the peak for the first
 * `FRONT_LOAD_FRACTION` of the duration, then linearly ramping down to
 * `TAIL_END_RATE_FRACTION` of the peak by the end. Monotonic
 * non-increasing; front-loaded so the car "carries" through the flip
 * instead of snapping at the finish.
 */
export function flipRate(elapsed: number, activeDuration: number): number {
  const peak = peakFlipRate(activeDuration);
  const t = activeDuration > 0 ? elapsed / activeDuration : 1;

  if (t <= FRONT_LOAD_FRACTION) {
    return peak;
  }
  if (t >= 1) {
    return peak * TAIL_END_RATE_FRACTION;
  }

  const tailProgress = (t - FRONT_LOAD_FRACTION) / (1 - FRONT_LOAD_FRACTION);
  return peak * (1 - tailProgress * (1 - TAIL_END_RATE_FRACTION));
}
