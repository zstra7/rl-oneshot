import type { Vec3Like } from "@/physics/PhysicsTypes";
import * as V from "@/physics/Vec3Math";

/**
 * P1.2 (plan/ONLINE_POLISH_PLAN.md): pure policy for render-side correction
 * smoothing. When the online guest reconciles onto a host snapshot, a
 * mispredicted remote input can leave a tiny instantaneous position jump —
 * this never touches simulation state (the sim is always exactly correct
 * after reconciliation), it only smooths what gets DRAWN, by carrying a
 * decaying visual offset that starts at "where the object used to appear"
 * and exponentially relaxes to "where it now actually is".
 */

/** Metres beyond which a correction is treated as a real teleport (kickoff reset) and must snap, not glide. */
export const CORRECTION_MAX_ACCEPTED_DISTANCE = 1.5;

/** Half-life, in seconds, of the exponential decay applied to a correction offset each frame. */
export const CORRECTION_HALF_LIFE_SECONDS = 0.05;

/** Whether a position delta (old minus new) is small enough to smooth rather than snap. */
export function shouldSmoothCorrection(delta: Vec3Like): boolean {
  return V.length(delta) <= CORRECTION_MAX_ACCEPTED_DISTANCE;
}

/** Exponentially decay an offset toward zero over `dtSeconds`, given a fixed half-life. */
export function decayOffset(
  offset: Vec3Like,
  dtSeconds: number,
  halfLifeSeconds: number = CORRECTION_HALF_LIFE_SECONDS
): Vec3Like {
  if (dtSeconds <= 0) {
    return offset;
  }
  const factor = Math.pow(0.5, dtSeconds / halfLifeSeconds);
  return V.scale(offset, factor);
}
