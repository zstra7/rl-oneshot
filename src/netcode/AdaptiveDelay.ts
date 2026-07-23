import { FIXED_DT_SECONDS } from "@/core/FixedStepCoordinator";

/**
 * N7 (plan/ONLINE_MULTIPLAYER_PLAN.md, §4.1): the pure policy that maps a
 * measured connection quality to an input-delay in ticks. A larger delay
 * hides more latency (fewer stalls) at the cost of more input lag, so the
 * policy picks the smallest delay that comfortably covers the one-way
 * travel time plus the jitter spread, clamped to a sane range. It is
 * applied only at safe boundaries (kickoffs) so the shared timeline never
 * warps mid-play.
 */
export const MIN_INPUT_DELAY_TICKS = 2;
export const MAX_INPUT_DELAY_TICKS = 10;

const TICK_MS = FIXED_DT_SECONDS * 1000; // ~8.33ms at 120Hz

/**
 * Recommend an input-delay (ticks) for a link with the given round-trip
 * time and jitter. One-way latency is ~RTT/2; the full jitter spread is
 * added so a late packet still lands within the delay window. Clamped to
 * [MIN, MAX].
 */
export function recommendDelayTicks(rttMs: number, jitterMs = 0): number {
  const safeRtt = Number.isFinite(rttMs) && rttMs > 0 ? rttMs : 0;
  const safeJitter = Number.isFinite(jitterMs) && jitterMs > 0 ? jitterMs : 0;
  const oneWayCoverMs = safeRtt / 2 + safeJitter;
  const ticks = Math.ceil(oneWayCoverMs / TICK_MS);
  return Math.min(MAX_INPUT_DELAY_TICKS, Math.max(MIN_INPUT_DELAY_TICKS, ticks));
}

export type ConnectionQuality = "good" | "ok" | "poor";

/** Classify a link for the connection HUD (dots / colour). */
export function classifyConnection(rttMs: number): ConnectionQuality {
  if (!Number.isFinite(rttMs) || rttMs < 80) {
    return "good";
  }
  if (rttMs < 160) {
    return "ok";
  }
  return "poor";
}

/**
 * Only adopt a new delay if it differs meaningfully from the current one —
 * avoids thrashing the delay by ±1 tick on small RTT noise. Returns the
 * delay to use (either the current one or the recommendation).
 */
export function stabilizeDelay(currentTicks: number, recommendedTicks: number): number {
  return Math.abs(recommendedTicks - currentTicks) >= 2 ? recommendedTicks : currentTicks;
}
