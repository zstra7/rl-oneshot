import { FIXED_DT_SECONDS } from "@/core/FixedStepCoordinator";

/**
 * P1.3 (plan/ONLINE_POLISH_PLAN.md): pure policy for the online guest's
 * tick-rate alignment. Host and guest run independent rAF clocks that
 * naturally drift apart over a long match; left alone, the replay window in
 * `GameRuntime.applyHostSnapshot` (the gap between the last host snapshot's
 * tick and the guest's own simulated frontier — the guest's "lead") can grow
 * unbounded. This nudges the guest's frame clock by at most ±3% so its lead
 * gently converges to a target derived from the measured RTT, instead of
 * warping the timeline outright.
 */
const TICK_MS = FIXED_DT_SECONDS * 1000;

const MIN_TARGET_LEAD_TICKS = 2;
const MAX_TARGET_LEAD_TICKS = 12;
/** Fallback target lead (ticks) before any RTT has been measured. */
const DEFAULT_TARGET_LEAD_TICKS = 4;

const RATE_GAIN = 0.004;
const MAX_RATE_ADJUST = 0.03;

/** EMA smoothing factor applied to the raw per-snapshot lead sample. */
export const LEAD_EMA_ALPHA = 0.1;

/** The lead (in ticks) the guest should aim to keep ahead of the host's snapshot tick, from measured RTT. */
export function computeTargetLeadTicks(rttMs: number | null): number {
  if (rttMs === null) {
    return DEFAULT_TARGET_LEAD_TICKS;
  }
  const rttTicks = rttMs / TICK_MS;
  const target = rttTicks / 2 + 2;
  return Math.min(MAX_TARGET_LEAD_TICKS, Math.max(MIN_TARGET_LEAD_TICKS, target));
}

/**
 * The frame-clock rate scale to apply this frame: 1.0 exactly at the target
 * lead, >1 (run faster) when behind, <1 (run slower) when ahead, clamped to
 * [0.97, 1.03] so the adjustment is always imperceptible.
 */
export function computeRateScale(leadEma: number, targetLead: number): number {
  const raw = (targetLead - leadEma) * RATE_GAIN;
  const clamped = Math.min(MAX_RATE_ADJUST, Math.max(-MAX_RATE_ADJUST, raw));
  return 1 + clamped;
}
