import {
  AI_DIFFICULTY_PRESETS,
  MISTAKE_COOLDOWN_SECONDS,
  type AiDifficulty,
  type AiDifficultyParameters
} from "@/ai/AiDifficulty";
import { AI_CONSTANTS } from "@/ai/AiConstants";
import { AiRandom } from "@/ai/AiRandom";
import { predictBallTrajectory } from "@/ai/BallPredictor";
import { computeRecoveryInput, driveTowardPoint } from "@/ai/GroundManeuverController";
import { applyPerceptionNoise, PerceptionBuffer } from "@/ai/PerceptionBuffer";
import { estimateReachSeconds } from "@/ai/Reachability";
import type { AiDebugState, AiTacticalMode, AiUpdateContext } from "@/ai/AiTypes";
import type { MatchState } from "@/game-flow/MatchFlowTypes";
import { RL_CONSTANTS } from "@/physics/PhysicsConstants";
import type { BoostPadObservation } from "@/physics/boost/BoostPadTypes";
import { NEUTRAL_CAR_INPUT, type BallSerializableState, type CarInput } from "@/physics/PhysicsTypes";
import * as V from "@/physics/Vec3Math";

const KICKOFF_TIMEOUT_TICKS = 360;
const KICKOFF_EXIT_RADIUS = 3;
const LIVE_PLAY_STATES: readonly MatchState[] = ["PLAYING", "OVERTIME_PLAYING"];

const CLEAR_DISTANCE = 12;
const MISTAKE_CHECK_INTERVAL_TICKS = 60;
const MISTAKE_DURATION_TICKS = 20;
const MISTAKE_STEER_MAGNITUDE = 0.3;

const JUMP_BALL_HEIGHT_THRESHOLD = 1.3;
const JUMP_TRIGGER_RADIUS = 3.5;

/**
 * Opponent AI (Master Brief Phases 9 + 10 / core architecture spec
 * sections 65-66). Layered design per AI spec section 4, deliberately
 * scoped to a heading-error ground planner plus the specific Phase 10
 * additions the master brief lists (difficulty tiers, reaction delay,
 * perception uncertainty, shadow defence, challenge logic, clears,
 * boost-route awareness, limited jumps, hard-only limited aerials,
 * bounded humanisation mistakes) — not the full utility-scored
 * candidate-search planner or the complete AI spec surface. See
 * docs/build-decisions.md Phase 10 section for exactly what is and
 * isn't consumed from `AiDifficultyParameters`.
 */
export class OpponentAiController {
  private lastDebugState: AiDebugState = {
    mode: "retreat",
    targetPosition: { x: 0, y: 0, z: 0 }
  };

  private difficulty: AiDifficulty = "medium";
  private params: AiDifficultyParameters = AI_DIFFICULTY_PRESETS.medium;
  private random = new AiRandom(1);

  private readonly perception = new PerceptionBuffer();

  private previousMatchState: MatchState = "BOOT";
  private kickoffActive = false;
  private kickoffStartTick = 0;

  private mistakeCooldownTicksRemaining = 0;
  private mistakeActiveTicksRemaining = 0;
  private mistakeSteerOffset = 0;

  private aerialPursuitTicksRemaining = 0;

  private nextPlanTick = 0;
  private plannedTarget: V.Vec3Like = { x: 0, y: 0, z: 0 };
  private plannedBoostAllowed = true;

  /** Stateless beyond per-tick debug telemetry — nothing to set up. */
  public initialise(): void {
    // No-op.
  }

  public dispose(): void {
    // No-op.
  }

  public setDifficulty(difficulty: AiDifficulty): void {
    this.difficulty = difficulty;
    this.params = AI_DIFFICULTY_PRESETS[difficulty];
  }

  public getDifficulty(): AiDifficulty {
    return this.difficulty;
  }

  /** AI spec section 8: deterministic given seed + observations. */
  public setSeed(seed: number): void {
    this.random = new AiRandom(seed);
  }

  public update(context: AiUpdateContext): CarInput {
    const { controlledCar, boostPads, ownGoalCentre, targetGoalCentre } = context;

    this.perception.record(context.tick, context.ball, context.humanCar);
    const delayed = this.perception.getDelayed(context.tick, this.params.reactionDelaySeconds);
    const ball = applyPerceptionNoise(
      delayed.ball,
      this.params.perceptionPositionNoise,
      this.params.perceptionVelocityNoise,
      this.random
    );
    const humanCar = delayed.humanCar;

    this.updateKickoffCommitment(context.tick, context.matchState, ball);
    this.updateMistakeState(context.tick);

    if (!controlledCar.grounded) {
      if (this.difficulty === "hard" && this.aerialPursuitTicksRemaining > 0) {
        this.aerialPursuitTicksRemaining -= 1;
        this.lastDebugState = { mode: "attack", targetPosition: ball.position };
        return computeAerialPursuitInput(controlledCar, ball.position);
      }
      this.lastDebugState = { mode: "recover", targetPosition: controlledCar.position };
      return computeRecoveryInput(controlledCar);
    }
    this.aerialPursuitTicksRemaining = 0;

    if (this.kickoffActive) {
      this.lastDebugState = { mode: "kickoff", targetPosition: ball.position };
      return this.maybeJump(
        ball,
        controlledCar.position,
        this.withHumanisation(driveTowardPoint(controlledCar, ball.position, { boostAllowed: true }))
      );
    }

    // AI spec section 5: "do not recalculate tactical state every tick".
    // Mode/target selection only runs at the difficulty's tacticalHz —
    // low-level driving toward the last chosen target still runs every
    // tick below. This also matters for correctness, not just fidelity:
    // re-deriving the multi-second ball-trajectory prediction from a
    // freshly-noised ball sample every single 120Hz tick made the chosen
    // approach point flicker between different noise-driven predictions
    // tick to tick, which was enough to destabilise steering into a wide,
    // never-converging arc — found via ad hoc Vitest debugging.
    if (context.tick >= this.nextPlanTick) {
      this.replan(controlledCar, humanCar, ball, boostPads, ownGoalCentre, targetGoalCentre);
      const ticksPerPlan = Math.max(1, Math.round(RL_CONSTANTS.physicsHz / this.params.tacticalHz));
      this.nextPlanTick = context.tick + ticksPerPlan;
    }

    return this.maybeJump(
      ball,
      controlledCar.position,
      this.withHumanisation(
        driveTowardPoint(controlledCar, this.plannedTarget, { boostAllowed: this.plannedBoostAllowed })
      )
    );
  }

  private replan(
    controlledCar: AiUpdateContext["controlledCar"],
    humanCar: AiUpdateContext["humanCar"],
    ball: BallSerializableState,
    boostPads: readonly BoostPadObservation[],
    ownGoalCentre: V.Vec3Like,
    targetGoalCentre: V.Vec3Like
  ): void {
    const prediction = predictBallTrajectory(ball);
    const aiReach = bestReachEstimate(controlledCar, ball, prediction);
    const humanReach = estimateReachSeconds(humanCar, ball.position);

    const ballToOwnGoal = flatDistance(ball.position, ownGoalCentre);
    const ballHeadingToOwnGoal = isMovingToward(ball, ownGoalCentre);

    // AI spec section 22 "challenge logic": more aggressive difficulties
    // need less of a time advantage before deciding to contest the ball
    // rather than concede it to the human.
    const challengeMargin =
      AI_CONSTANTS.reachabilityMargin * (1.6 - V.clamp(this.params.challengeAggression, 0, 1));
    const humanClearlyCloser = humanReach + challengeMargin < aiReach.time;

    const mustDefend =
      (ballHeadingToOwnGoal && ballToOwnGoal < AI_CONSTANTS.ownGoalDangerDistance) ||
      (humanClearlyCloser && ballToOwnGoal < AI_CONSTANTS.ownGoalDangerDistance);

    if (mustDefend) {
      // AI spec section 24: CLEAR (remove immediate danger, imprecise
      // direction is fine) differs from SHADOW DEFENCE (hold position).
      if (ballToOwnGoal < CLEAR_DISTANCE) {
        const target = clearApproachPoint(ball.position, ownGoalCentre);
        this.lastDebugState = { mode: "clear", targetPosition: target };
        this.plannedTarget = target;
        this.plannedBoostAllowed = true;
        return;
      }

      // AI spec section 21: shadow distance tightens with defensiveUrgency.
      const target = defensiveShadowPosition(
        ball.position,
        ownGoalCentre,
        this.params.defensiveUrgency
      );
      this.lastDebugState = { mode: "defend", targetPosition: target };
      this.plannedTarget = target;
      this.plannedBoostAllowed = true;
      return;
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
      this.plannedTarget = approachPoint;
      this.plannedBoostAllowed = true;
      return;
    }

    if (controlledCar.boostAmount < AI_CONSTANTS.boostReserveThreshold) {
      const pad = selectBoostPad(
        controlledCar.position,
        boostPads,
        controlledCar.boostAmount,
        this.params.boostPadAwarenessRadius
      );
      if (pad) {
        this.lastDebugState = { mode: "collect-boost", targetPosition: pad.position };
        this.plannedTarget = pad.position;
        this.plannedBoostAllowed = true;
        return;
      }
    }

    const retreatTarget = retreatPosition(ball.position, ownGoalCentre);
    this.lastDebugState = { mode: "retreat", targetPosition: retreatTarget };
    this.plannedTarget = retreatTarget;
    this.plannedBoostAllowed = true;
  }

  /** Neutral input for when game-flow disables control (AI spec section 2.4). */
  public neutralInput(): CarInput {
    return { ...NEUTRAL_CAR_INPUT };
  }

  public getDebugState(): AiDebugState {
    return this.lastDebugState;
  }

  /**
   * AI spec section 31/32 "limited jumps"/"hard limited aerials": jump
   * when closing in on a ball too high to reach on the ground. Hard
   * difficulty gets a short bounded airborne pursuit window afterward;
   * other difficulties just jump and fall back to normal recovery.
   */
  private maybeJump(ball: BallSerializableState, carPosition: V.Vec3Like, input: CarInput): CarInput {
    if (this.params.dodgeSkill <= 0.1) {
      return input;
    }

    const ballHeight = ball.position.y - RL_CONSTANTS.ballRadius;
    const horizontalDistance = flatDistance(carPosition, ball.position);

    if (ballHeight > JUMP_BALL_HEIGHT_THRESHOLD && horizontalDistance < JUMP_TRIGGER_RADIUS) {
      if (this.difficulty === "hard" && this.params.aerialSkill > 0.3) {
        this.aerialPursuitTicksRemaining = Math.round(
          this.params.maximumAerialTime * RL_CONSTANTS.physicsHz
        );
      }
      return { ...input, jump: true };
    }

    return input;
  }

  /**
   * AI spec section 34 "humanisation": a small, bounded, cooldown-gated
   * steering perturbation — never touches throttle/boost/goal-direction
   * logic, so a "mistake" can only ever make a turn slightly worse, not
   * produce an own goal or a frozen car (spec section 34.1's explicit
   * "avoid" list).
   */
  private withHumanisation(input: CarInput): CarInput {
    if (this.mistakeActiveTicksRemaining <= 0) {
      return input;
    }
    return { ...input, steer: V.clamp(input.steer + this.mistakeSteerOffset, -1, 1) };
  }

  private updateMistakeState(tick: number): void {
    if (this.mistakeActiveTicksRemaining > 0) {
      this.mistakeActiveTicksRemaining -= 1;
      return;
    }
    if (this.mistakeCooldownTicksRemaining > 0) {
      this.mistakeCooldownTicksRemaining -= 1;
      return;
    }
    // Only roll the dice once per "decision cycle", not every physics
    // tick -- mistakeFrequency is a per-decision probability (AI spec
    // section 34), and 120 independent rolls per second at even a small
    // probability would make mistakes the dominant behaviour instead of
    // an occasional bounded one.
    if (tick % MISTAKE_CHECK_INTERVAL_TICKS !== 0) {
      return;
    }
    if (this.random.chance(this.params.mistakeFrequency)) {
      this.mistakeActiveTicksRemaining = MISTAKE_DURATION_TICKS;
      this.mistakeSteerOffset = this.random.range(-MISTAKE_STEER_MAGNITUDE, MISTAKE_STEER_MAGNITUDE);
      this.mistakeCooldownTicksRemaining = Math.round(
        MISTAKE_COOLDOWN_SECONDS[this.difficulty] * RL_CONSTANTS.physicsHz
      );
    }
  }

  /**
   * AI spec section 27: kickoff is a committed state entered on the
   * PLAYING/OVERTIME_PLAYING transition (not re-derived from ball physics
   * every tick, which false-negatives while the ball is still settling
   * from its kickoff-reset drop — found via ad hoc Vitest debugging).
   * Held until ball contact/movement away from centre, or a timeout.
   */
  private updateKickoffCommitment(tick: number, matchState: MatchState, ball: BallSerializableState): void {
    const enteredLivePlay =
      LIVE_PLAY_STATES.includes(matchState) && !LIVE_PLAY_STATES.includes(this.previousMatchState);

    if (enteredLivePlay) {
      this.kickoffActive = true;
      this.kickoffStartTick = tick;
    }
    this.previousMatchState = matchState;

    if (!this.kickoffActive) {
      return;
    }

    const flatDistanceFromCentre = Math.hypot(ball.position.x, ball.position.z);
    const ticksSinceKickoff = tick - this.kickoffStartTick;

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
  ball: BallSerializableState,
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

function isMovingToward(ball: BallSerializableState, point: V.Vec3Like): boolean {
  const toPoint = V.normalize({ x: point.x - ball.position.x, y: 0, z: point.z - ball.position.z });
  const velocityFlat = { x: ball.linearVelocity.x, y: 0, z: ball.linearVelocity.z };
  return V.dot(velocityFlat, toPoint) > 1.0;
}

/** AI spec section 21: goal-side shadow position, tightened by defensive urgency. */
function defensiveShadowPosition(
  ballPosition: V.Vec3Like,
  ownGoalCentre: V.Vec3Like,
  defensiveUrgency: number
): V.Vec3Like {
  const distance = flatDistance(ballPosition, ownGoalCentre);
  const direction = V.normalize({
    x: ownGoalCentre.x - ballPosition.x,
    y: 0,
    z: ownGoalCentre.z - ballPosition.z
  });

  // Higher urgency -> hug closer to the ball (tighter mark); lower
  // urgency -> sit back closer to goal.
  const urgencyScale = 0.4 + 0.4 * V.clamp(defensiveUrgency, 0, 1);
  const shadowDistance = Math.min(AI_CONSTANTS.defensiveShadowDistance, distance * urgencyScale);
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

/**
 * AI spec section 24 "clearing": the opposite approach side from a shot
 * — push the ball away from the AI's own goal instead of toward the
 * target goal, prioritising removing danger over precision.
 */
function clearApproachPoint(ballPosition: V.Vec3Like, ownGoalCentre: V.Vec3Like): V.Vec3Like {
  const towardOwnGoal = V.normalize({
    x: ownGoalCentre.x - ballPosition.x,
    y: 0,
    z: ownGoalCentre.z - ballPosition.z
  });
  return V.add(ballPosition, V.scale(towardOwnGoal, AI_CONSTANTS.shotApproachOffset));
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
  currentBoost: number,
  awarenessRadius: number
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
    if (distance > awarenessRadius) {
      continue;
    }
    if (distance < bestDistance) {
      bestDistance = distance;
      best = pad;
    }
  }

  if (!best && preferFull) {
    return selectBoostPad(carPosition, boostPads, AI_CONSTANTS.boostCriticalThreshold + 1, awarenessRadius);
  }

  return best;
}

/**
 * AI spec section 32 "limited aerial planning", hard-only: a bounded
 * pursuit that orients the car's nose toward the ball while airborne
 * (using the same pitch/yaw channel the human aerial controller
 * consumes) rather than the default recover-to-upright behaviour. Not a
 * precision aerial-hit solver — just enough directional air control to
 * be a meaningfully different (harder to play against) capability than
 * the other two difficulties, which only ever recover.
 */
function computeAerialPursuitInput(
  car: AiUpdateContext["controlledCar"],
  ballPosition: V.Vec3Like
): CarInput {
  const inverseRotation = {
    x: -car.rotation.x,
    y: -car.rotation.y,
    z: -car.rotation.z,
    w: car.rotation.w
  };
  const toBallWorld = V.sub(ballPosition, car.position);
  const toBallLocal = V.normalize(V.applyQuaternion(toBallWorld, inverseRotation));

  const yaw = V.clamp(toBallLocal.x * 2, -1, 1);
  const pitch = V.clamp(-toBallLocal.y * 2, -1, 1);

  return {
    throttle: 1,
    steer: 0,
    pitch,
    yaw,
    roll: 0,
    jump: false,
    boost: true,
    powerslide: false
  };
}

export type { AiTacticalMode };
