/**
 * AI spec section 3: the module's difficulty enum. R9 (plan/
 * RAMPS_AND_FEATURES_PLAN.md) adds "legend" as a real 4th tier, exposed
 * in match setup alongside the other three (not tournament-only).
 */
export type AiDifficulty = "easy" | "medium" | "hard" | "legend";

export type AiKickoffProfile = "simple" | "normal" | "fast";

/**
 * AI spec section 7's full typed parameter set. Phase 9's controller only
 * consumed a fixed "one Medium-like parameter set"; Phase 10 wires all
 * three tiers in. Not every field is consumed by this project's
 * deliberately-simplified ground-only planner (no utility-scored
 * candidate search, no full aerial game) — unused fields are kept for
 * spec fidelity/documentation and to make a future richer planner a
 * matter of consuming more of this struct, not inventing new tuning
 * knobs. See docs/build-decisions.md Phase 10 section for exactly which
 * fields are consumed today.
 */
export interface AiDifficultyParameters {
  readonly reactionDelaySeconds: number;
  readonly ownStateDelaySeconds: number;

  readonly perceptionPositionNoise: number;
  readonly perceptionVelocityNoise: number;
  readonly predictionTimeNoise: number;

  readonly tacticalHz: number;
  readonly predictionHz: number;
  readonly controlHz: number;

  readonly planningHorizonSeconds: number;
  readonly candidateCount: number;

  readonly shotAccuracy: number;
  readonly shotPowerPreference: number;
  readonly defensiveUrgency: number;
  readonly challengeAggression: number;

  readonly boostConservation: number;
  readonly maximumBoostBurstSeconds: number;
  readonly boostPadAwarenessRadius: number;
  readonly boostPadDetourToleranceSeconds: number;
  readonly boostPadRespawnPlanningSeconds: number;
  readonly boostDenialAggression: number;
  readonly boostRouteCandidateCount: number;

  readonly powerslideSkill: number;
  readonly dodgeSkill: number;
  readonly aerialSkill: number;
  readonly recoverySkill: number;

  readonly decisionTemperature: number;
  readonly mistakeFrequency: number;
  readonly commitmentSeconds: number;

  readonly maximumAerialHeight: number;
  readonly maximumAerialTime: number;

  readonly kickoffProfile: AiKickoffProfile;
}

/** AI spec section 34.2: cooldown after one injected mistake, by difficulty. */
export const MISTAKE_COOLDOWN_SECONDS: Record<AiDifficulty, number> = {
  easy: 2.0,
  medium: 4.0,
  hard: 7.0,
  legend: 10.0
};

export const EASY_AI: AiDifficultyParameters = {
  reactionDelaySeconds: 0.28,
  ownStateDelaySeconds: 0.08,

  perceptionPositionNoise: 0.65,
  perceptionVelocityNoise: 0.8,
  predictionTimeNoise: 0.18,

  tacticalHz: 4,
  predictionHz: 4,
  controlHz: 30,

  planningHorizonSeconds: 1.8,
  candidateCount: 8,

  shotAccuracy: 0.35,
  shotPowerPreference: 0.45,
  defensiveUrgency: 0.55,
  challengeAggression: 0.38,

  boostConservation: 0.72,
  maximumBoostBurstSeconds: 0.45,
  boostPadAwarenessRadius: 22,
  boostPadDetourToleranceSeconds: 0.45,
  boostPadRespawnPlanningSeconds: 0.25,
  boostDenialAggression: 0.08,
  boostRouteCandidateCount: 4,

  powerslideSkill: 0.35,
  dodgeSkill: 0.2,
  aerialSkill: 0.0,
  recoverySkill: 0.35,

  decisionTemperature: 0.3,
  mistakeFrequency: 0.18,
  commitmentSeconds: 0.55,

  maximumAerialHeight: 0,
  maximumAerialTime: 0,

  kickoffProfile: "simple"
};

export const MEDIUM_AI: AiDifficultyParameters = {
  reactionDelaySeconds: 0.15,
  ownStateDelaySeconds: 0.035,

  perceptionPositionNoise: 0.3,
  perceptionVelocityNoise: 0.35,
  predictionTimeNoise: 0.09,

  tacticalHz: 8,
  predictionHz: 8,
  controlHz: 60,

  planningHorizonSeconds: 2.6,
  candidateCount: 16,

  shotAccuracy: 0.62,
  shotPowerPreference: 0.62,
  defensiveUrgency: 0.72,
  challengeAggression: 0.58,

  boostConservation: 0.6,
  maximumBoostBurstSeconds: 0.75,
  boostPadAwarenessRadius: 60,
  boostPadDetourToleranceSeconds: 0.8,
  boostPadRespawnPlanningSeconds: 1.25,
  boostDenialAggression: 0.28,
  boostRouteCandidateCount: 8,

  powerslideSkill: 0.65,
  dodgeSkill: 0.52,
  aerialSkill: 0.15,
  recoverySkill: 0.68,

  decisionTemperature: 0.18,
  mistakeFrequency: 0.08,
  commitmentSeconds: 0.42,

  maximumAerialHeight: 3.0,
  maximumAerialTime: 0.65,

  kickoffProfile: "normal"
};

export const HARD_AI: AiDifficultyParameters = {
  reactionDelaySeconds: 0.075,
  ownStateDelaySeconds: 0.01,

  perceptionPositionNoise: 0.12,
  perceptionVelocityNoise: 0.16,
  predictionTimeNoise: 0.035,

  tacticalHz: 12,
  predictionHz: 12,
  controlHz: 120,

  planningHorizonSeconds: 3.5,
  candidateCount: 28,

  shotAccuracy: 0.82,
  shotPowerPreference: 0.75,
  defensiveUrgency: 0.88,
  challengeAggression: 0.72,

  boostConservation: 0.48,
  maximumBoostBurstSeconds: 1.1,
  boostPadAwarenessRadius: 120,
  boostPadDetourToleranceSeconds: 1.15,
  boostPadRespawnPlanningSeconds: 2.5,
  boostDenialAggression: 0.48,
  boostRouteCandidateCount: 16,

  powerslideSkill: 0.88,
  dodgeSkill: 0.78,
  aerialSkill: 0.48,
  recoverySkill: 0.88,

  decisionTemperature: 0.1,
  mistakeFrequency: 0.035,
  commitmentSeconds: 0.32,

  maximumAerialHeight: 6.0,
  maximumAerialTime: 1.15,

  kickoffProfile: "fast"
};

export const LEGEND_AI: AiDifficultyParameters = {
  reactionDelaySeconds: 0.045,
  ownStateDelaySeconds: 0.005,

  perceptionPositionNoise: 0.07,
  perceptionVelocityNoise: 0.1,
  predictionTimeNoise: 0.02,

  tacticalHz: 15,
  predictionHz: 15,
  controlHz: 120,

  planningHorizonSeconds: 4.0,
  candidateCount: 32,

  shotAccuracy: 0.92,
  shotPowerPreference: 0.82,
  defensiveUrgency: 0.95,
  challengeAggression: 0.8,

  boostConservation: 0.4,
  maximumBoostBurstSeconds: 1.4,
  boostPadAwarenessRadius: 140,
  boostPadDetourToleranceSeconds: 1.3,
  boostPadRespawnPlanningSeconds: 3.0,
  boostDenialAggression: 0.6,
  boostRouteCandidateCount: 20,

  powerslideSkill: 0.95,
  dodgeSkill: 0.9,
  aerialSkill: 0.6,
  recoverySkill: 0.95,

  decisionTemperature: 0.06,
  mistakeFrequency: 0.015,
  commitmentSeconds: 0.28,

  maximumAerialHeight: 8.0,
  maximumAerialTime: 1.5,

  kickoffProfile: "fast"
};

export const AI_DIFFICULTY_PRESETS: Record<AiDifficulty, AiDifficultyParameters> = {
  easy: EASY_AI,
  medium: MEDIUM_AI,
  hard: HARD_AI,
  legend: LEGEND_AI
};
