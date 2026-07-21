import { AI_CONSTANTS } from "@/ai/AiConstants";
import { predictBallTrajectory } from "@/ai/BallPredictor";
import { computeRecoveryInput, driveTowardPoint } from "@/ai/GroundManeuverController";
import { estimateReachSeconds } from "@/ai/Reachability";
import type { AiDebugState, AiTacticalMode, AiUpdateContext } from "@/ai/AiTypes";
import type { MatchState } from "@/game-flow/MatchFlowTypes";
import type { BoostPadObservation } from "@/physics/boost/BoostPadTypes";
import { NEUTRAL_CAR_INPUT, type CarInput } from "@/physics/PhysicsTypes";
import * as V from "@/physics/Vec3Math";

const KICKOFF_TIMEOUT_TICKS = 360;
const KICKOFF_EXIT_RADIUS = 3;
const LIVE_PLAY_STATES: readonly MatchState[] = ["PLAYING", "OVERTIME_PLAYING"];

/**
 * Basic opponent AI (Master Brief Phase 9 / core architecture spec
 * section 65's ordered list: ground target driving, recovery, ball
 * prediction, reachability, basic intercept, shoot open goal, retreat,
 * basic defence, kickoff, boost-pad collection). One fixed "Medium-like"
 * parameter set — difficulty tiers and the full humanisation/utility-
 * scoring machinery from the AI spec's later sections are Phase 10.
 *
 * Deliberately ground-only: no jump/dodge/aerial decision-making (not
 * in the Phase 9 checklist; see docs/build-decisions.md).
 */
export class OpponentAiController {
  private lastDebugState: AiDebugState = {
    mode: "retreat",
    targetPosition: { x: 0, y: 0, z: 0 }
  };

  private previousMatchState: MatchState = "BOOT";
  private kickoffActive = false;
  private kickoffStartTick = 0;

  /** Stateless beyond per-tick debug telemetry — nothing to set up. */
  public initialise(): void {
    // No-op.
  }

  public dispose(): void {
    // No-op.
  }

  public update(context: AiUpdateContext): CarInput {
    const { controlledCar, humanCar, ball, boostPads, ownGoalCentre, targetGoalCentre } = context;

    this.updateKickoffCommitment(context);

    if (!controlledCar.grounded) {
      this.lastDebugState = { mode: "recover", targetPosition: controlledCar.position };
      return computeRecoveryInput(controlledCar);
    }

    if (this.kickoffActive) {
      this.lastDebugState = { mode: "kickoff", targetPosition: ball.position };
      return driveTowardPoint(controlledCar, ball.position, { boostAllowed: true });
    }

    const prediction = predictBallTrajectory(ball);
    const aiReach = bestReachEstimate(controlledCar, ball, prediction);
    const humanReach = estimateReachSeconds(humanCar, ball.position);

    const ballToOwnGoal = flatDistance(ball.position, ownGoalCentre);
    const ballHeadingToOwnGoal = isMovingToward(ball, ownGoalCentre);
    const humanClearlyCloser = humanReach + AI_CONSTANTS.reachabilityMargin < aiReach.time;

    const mustDefend =
      (ballHeadingToOwnGoal && ballToOwnGoal < AI_CONSTANTS.ownGoalDangerDistance) ||
      (humanClearlyCloser && ballToOwnGoal < AI_CONSTANTS.ownGoalDangerDistance);

    if (mustDefend) {
      const target = defensiveShadowPosition(ball.position, ownGoalCentre);
      this.lastDebugState = { mode: "defend", targetPosition: target };
      return driveTowardPoint(controlledCar, target, { boostAllowed: true });
    }

    // Worth attacking only if the AI isn't clearly outpaced *and* the
    // ball is reachable within a bounded time — otherwise every distant
    // loose ball would win a purely relative "faster than human" check
    // and the AI would never collect boost or hold position (AI spec
    // section 11's reachability estimate is deliberately approximate;
    // this absolute cutoff keeps it from being the only gate).
    const canAttack = !humanClearlyCloser && aiReach.time <= AI_CONSTANTS.attackReachTimeLimit;

    if (canAttack) {
      const approachPoint = shotApproachPoint(aiReach.position, targetGoalCentre);
      this.lastDebugState = { mode: "attack", targetPosition: approachPoint };
      return driveTowardPoint(controlledCar, approachPoint, { boostAllowed: true });
    }

    if (controlledCar.boostAmount < AI_CONSTANTS.boostReserveThreshold) {
      const pad = selectBoostPad(controlledCar.position, boostPads, controlledCar.boostAmount);
      if (pad) {
        this.lastDebugState = { mode: "collect-boost", targetPosition: pad.position };
        return driveTowardPoint(controlledCar, pad.position, { boostAllowed: true });
      }
    }

    const retreatTarget = retreatPosition(ball.position, ownGoalCentre);
    this.lastDebugState = { mode: "retreat", targetPosition: retreatTarget };
    return driveTowardPoint(controlledCar, retreatTarget, { boostAllowed: true });
  }

  /** Neutral input for when game-flow disables control (AI spec section 2.4). */
  public neutralInput(): CarInput {
    return { ...NEUTRAL_CAR_INPUT };
  }

  public getDebugState(): AiDebugState {
    return this.lastDebugState;
  }

  /**
   * AI spec section 27: kickoff is a committed state entered on the
   * PLAYING/OVERTIME_PLAYING transition (not re-derived from ball physics
   * every tick, which false-negatives while the ball is still settling
   * from its kickoff-reset drop — found via ad hoc Vitest debugging).
   * Held until ball contact/movement away from centre, or a timeout.
   */
  private updateKickoffCommitment(context: AiUpdateContext): void {
    const enteredLivePlay =
      LIVE_PLAY_STATES.includes(context.matchState) && !LIVE_PLAY_STATES.includes(this.previousMatchState);

    if (enteredLivePlay) {
      this.kickoffActive = true;
      this.kickoffStartTick = context.tick;
    }
    this.previousMatchState = context.matchState;

    if (!this.kickoffActive) {
      return;
    }

    const flatDistanceFromCentre = Math.hypot(context.ball.position.x, context.ball.position.z);
    const ticksSinceKickoff = context.tick - this.kickoffStartTick;

    if (flatDistanceFromCentre > KICKOFF_EXIT_RADIUS || ticksSinceKickoff > KICKOFF_TIMEOUT_TICKS) {
      this.kickoffActive = false;
    }
  }
}


/**
 * Picks the earliest predicted ball sample the car can reach at or
 * before the ball gets there (AI spec section 18 "basic intercept"),
 * falling back to the ball's current position if nothing in the
 * prediction horizon is reachable in time.
 */
function bestReachEstimate(
  car: AiUpdateContext["controlledCar"],
  ball: AiUpdateContext["ball"],
  prediction: ReturnType<typeof predictBallTrajectory>
): { time: number; position: V.Vec3Like } {
  for (const sample of prediction) {
    const reach = estimateReachSeconds(car, sample.position);
    if (reach <= sample.time + AI_CONSTANTS.reachabilityMargin) {
      return { time: reach, position: sample.position };
    }
  }
  return { time: estimateReachSeconds(car, ball.position), position: ball.position };
}

function flatDistance(a: V.Vec3Like, b: V.Vec3Like): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.z - b.z) ** 2);
}

function isMovingToward(ball: AiUpdateContext["ball"], point: V.Vec3Like): boolean {
  const toPoint = V.normalize({ x: point.x - ball.position.x, y: 0, z: point.z - ball.position.z });
  const velocityFlat = { x: ball.linearVelocity.x, y: 0, z: ball.linearVelocity.z };
  return V.dot(velocityFlat, toPoint) > 1.0;
}

/** AI spec section 21: goal-side shadow position between the ball and own goal. */
function defensiveShadowPosition(ballPosition: V.Vec3Like, ownGoalCentre: V.Vec3Like): V.Vec3Like {
  const distance = flatDistance(ballPosition, ownGoalCentre);
  const direction = V.normalize({
    x: ownGoalCentre.x - ballPosition.x,
    y: 0,
    z: ownGoalCentre.z - ballPosition.z
  });

  const shadowDistance = Math.min(AI_CONSTANTS.defensiveShadowDistance, distance * 0.6);
  return V.add(ballPosition, V.scale(direction, shadowDistance));
}

/**
 * AI spec section 19 "shot planning": aim through the ball toward the
 * target goal by approaching from the far side of the ball, so contact
 * pushes the ball goalward rather than the car simply bumping into it
 * from an arbitrary angle.
 */
function shotApproachPoint(ballPosition: V.Vec3Like, targetGoalCentre: V.Vec3Like): V.Vec3Like {
  const awayFromGoal = V.normalize({
    x: ballPosition.x - targetGoalCentre.x,
    y: 0,
    z: ballPosition.z - targetGoalCentre.z
  });
  return V.add(ballPosition, V.scale(awayFromGoal, AI_CONSTANTS.shotApproachOffset));
}

function retreatPosition(ballPosition: V.Vec3Like, ownGoalCentre: V.Vec3Like): V.Vec3Like {
  const direction = V.normalize({
    x: -ownGoalCentre.x,
    y: 0,
    z: -ownGoalCentre.z
  });
  const holdPoint = V.add(ownGoalCentre, V.scale(direction, AI_CONSTANTS.defensiveShadowDistance * 2));
  return { x: V.clamp(ballPosition.x, -12, 12), y: 0, z: holdPoint.z };
}

function selectBoostPad(
  carPosition: V.Vec3Like,
  boostPads: readonly BoostPadObservation[],
  currentBoost: number
): BoostPadObservation | null {
  const preferFull = currentBoost < AI_CONSTANTS.boostCriticalThreshold;

  let best: BoostPadObservation | null = null;
  let bestDistance = Infinity;

  for (const pad of boostPads) {
    if (!pad.active) {
      continue;
    }
    if (preferFull && pad.type !== "full") {
      continue;
    }

    const distance = flatDistance(carPosition, pad.position);
    if (distance > AI_CONSTANTS.boostPadSearchRadius) {
      continue;
    }
    if (distance < bestDistance) {
      bestDistance = distance;
      best = pad;
    }
  }

  if (!best && preferFull) {
    return selectBoostPad(carPosition, boostPads, AI_CONSTANTS.boostCriticalThreshold + 1);
  }

  return best;
}

export type { AiTacticalMode };
