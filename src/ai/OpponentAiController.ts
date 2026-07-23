import {
  AI_DIFFICULTY_PRESETS,
  MISTAKE_COOLDOWN_SECONDS,
  type AiDifficulty,
  type AiDifficultyParameters
} from "@/ai/AiDifficulty";
import { AI_CONSTANTS } from "@/ai/AiConstants";
import { AiRandom } from "@/ai/AiRandom";
import { computeRecoveryInput, driveTowardPoint, headingErrorTo } from "@/ai/GroundManeuverController";
import { applyPerceptionNoise, PerceptionBuffer } from "@/ai/PerceptionBuffer";
import type { AiDebugState, AiTacticalMode, AiUpdateContext } from "@/ai/AiTypes";
import type { MatchState } from "@/game-flow/MatchFlowTypes";
import { RL_CONSTANTS } from "@/physics/PhysicsConstants";
import { TEST_ARENA_DIMENSIONS } from "@/physics/arena/TestArenaPresets";
import { NEUTRAL_CAR_INPUT, type BallSerializableState, type CarInput } from "@/physics/PhysicsTypes";
import * as V from "@/physics/Vec3Math";

const KICKOFF_TIMEOUT_TICKS = 360;
const KICKOFF_EXIT_RADIUS = 3;
const LIVE_PLAY_STATES: readonly MatchState[] = ["PLAYING", "OVERTIME_PLAYING"];

const JUMP_BALL_HEIGHT_THRESHOLD = 1.3;
const JUMP_TRIGGER_RADIUS = 3.5;

const MISTAKE_CHECK_INTERVAL_TICKS = 60;
const MISTAKE_DURATION_TICKS = 20;
const MISTAKE_STEER_MAGNITUDE = 0.3;

/**
 * Opponent AI (Master Brief Phases 9 + 10 / core architecture spec
 * sections 65-66), planning core rewritten in WS6
 * (plan/POLISH_OVERHAUL_PLAN.md) to a minimal chase-and-shoot planner
 * plus stuck recovery — see `replan()`. Difficulty tiers, reaction
 * delay, perception uncertainty, limited jumps, hard-only limited
 * aerials, and bounded humanisation mistakes are unchanged from Phase
 * 10. The old utility-scored defend/clear/collect-boost/retreat mode
 * set is gone: WS6's stated problem was an AI that "drives briefly then
 * pins itself against a wall forever", and the fix prioritised a
 * planner simple enough to reason about plus real stuck-recovery over
 * the previous mode variety — see docs/ai-calibration-log.md.
 */
export class OpponentAiController {
  private lastDebugState: AiDebugState = {
    mode: "attack",
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

  /** WS6 stuck-recovery state (plan/POLISH_OVERHAUL_PLAN.md WS6). */
  private stuckTicks = 0;
  private unstuckTicksRemaining = 0;
  private unstuckSteer = 0;

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
    const { controlledCar, targetGoalCentre } = context;

    this.perception.record(context.tick, context.ball, context.humanCar);
    const delayed = this.perception.getDelayed(context.tick, this.params.reactionDelaySeconds);
    const ball = applyPerceptionNoise(
      delayed.ball,
      this.params.perceptionPositionNoise,
      this.params.perceptionVelocityNoise,
      this.random
    );

    this.updateKickoffCommitment(context.tick, context.matchState, ball);
    this.updateMistakeState(context.tick);

    if (!controlledCar.grounded) {
      if ((this.difficulty === "hard" || this.difficulty === "legend") && this.aerialPursuitTicksRemaining > 0) {
        this.aerialPursuitTicksRemaining -= 1;
        this.lastDebugState = { mode: "attack", targetPosition: ball.position };
        return computeAerialPursuitInput(controlledCar, ball.position);
      }
      this.lastDebugState = { mode: "recover", targetPosition: controlledCar.position };
      return computeRecoveryInput(controlledCar);
    }
    this.aerialPursuitTicksRemaining = 0;

    // WS6 stuck recovery: reverse away first, before any other grounded
    // logic — a car actively backing out of a wall shouldn't have that
    // interrupted by the normal planner re-aiming it back at the wall.
    if (this.unstuckTicksRemaining > 0) {
      this.unstuckTicksRemaining -= 1;
      this.lastDebugState = { mode: "unstuck", targetPosition: ball.position };
      return {
        throttle: -1,
        steer: this.unstuckSteer,
        pitch: 0,
        yaw: 0,
        roll: 0,
        jump: false,
        boost: false,
        powerslide: false
      };
    }

    let input: CarInput;
    if (this.kickoffActive) {
      this.lastDebugState = { mode: "kickoff", targetPosition: ball.position };
      input = this.withHumanisation(driveTowardPoint(controlledCar, ball.position, { boostAllowed: true }));
    } else {
      // AI spec section 5: "do not recalculate tactical state every
      // tick" — mode/target selection only runs at the difficulty's
      // tacticalHz; low-level driving toward the last chosen target
      // still runs every tick below.
      if (context.tick >= this.nextPlanTick) {
        this.replan(controlledCar, ball, targetGoalCentre);
        const ticksPerPlan = Math.max(1, Math.round(RL_CONSTANTS.physicsHz / this.params.tacticalHz));
        this.nextPlanTick = context.tick + ticksPerPlan;
      }
      input = this.withHumanisation(
        driveTowardPoint(controlledCar, this.plannedTarget, { boostAllowed: this.plannedBoostAllowed })
      );
    }

    input = this.maybeJump(ball, controlledCar.position, input);

    // WS6 stuck detection: pushing forward without gaining speed for
    // `stuckTicksThreshold` ticks (0.75s at 120Hz) arms the reversal for
    // the *next* tick, steering opposite the current heading error to
    // the ball so backing out also swings the nose toward it.
    if (input.throttle > 0.5 && controlledCar.speed < AI_CONSTANTS.stuckSpeedThreshold) {
      this.stuckTicks += 1;
    } else {
      this.stuckTicks = 0;
    }
    if (this.stuckTicks >= AI_CONSTANTS.stuckTicksThreshold) {
      this.stuckTicks = 0;
      this.unstuckTicksRemaining = AI_CONSTANTS.unstuckDurationTicks;
      const headingErrorToBall = headingErrorTo(controlledCar, ball.position);
      this.unstuckSteer = -V.signOrOne(headingErrorToBall);
    }

    return input;
  }

  /**
   * WS6 chase-and-shoot planner (plan/POLISH_OVERHAUL_PLAN.md WS6):
   * drive to a point behind the ball on the shot line toward the target
   * goal; if the car is already between the ball and that goal (pushing
   * from there would send the ball the wrong way), loop around the near
   * side instead.
   */
  private replan(
    controlledCar: AiUpdateContext["controlledCar"],
    ball: BallSerializableState,
    targetGoalCentre: V.Vec3Like
  ): void {
    const shotDir = V.normalize({
      x: targetGoalCentre.x - ball.position.x,
      y: 0,
      z: targetGoalCentre.z - ball.position.z
    });
    const approach = V.sub(ball.position, V.scale(shotDir, RL_CONSTANTS.ballRadius + AI_CONSTANTS.approachOffset));

    const carToBall = V.normalize({
      x: ball.position.x - controlledCar.position.x,
      y: 0,
      z: ball.position.z - controlledCar.position.z
    });
    const wrongSide = V.dot(shotDir, carToBall) < AI_CONSTANTS.wrongSideDotThreshold;

    let target: V.Vec3Like;
    if (wrongSide) {
      const perp = { x: -shotDir.z, y: 0, z: shotDir.x };
      const ballToCar = {
        x: controlledCar.position.x - ball.position.x,
        y: 0,
        z: controlledCar.position.z - ball.position.z
      };
      const sideSign = V.signOrOne(V.dot(perp, ballToCar));
      target = V.add(
        V.sub(ball.position, V.scale(shotDir, AI_CONSTANTS.loopBehindDistance)),
        V.scale(perp, AI_CONSTANTS.loopSideDistance * sideSign)
      );
    } else {
      target = approach;
    }

    target = clampToArenaBounds(target);

    const headingError = headingErrorTo(controlledCar, target);
    const aligned = Math.abs(headingError) < AI_CONSTANTS.boostAlignmentThreshold;
    const far = flatDistance(controlledCar.position, target) > AI_CONSTANTS.possessionRadius;

    this.lastDebugState = { mode: "attack", targetPosition: target };
    this.plannedTarget = target;
    this.plannedBoostAllowed = aligned && far;
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
      if ((this.difficulty === "hard" || this.difficulty === "legend") && this.params.aerialSkill > 0.3) {
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

function flatDistance(a: V.Vec3Like, b: V.Vec3Like): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.z - b.z) ** 2);
}

/** Keeps planned targets from being aimed straight into a wall. */
function clampToArenaBounds(point: V.Vec3Like): V.Vec3Like {
  const maxX = TEST_ARENA_DIMENSIONS.halfWidth - AI_CONSTANTS.arenaMargin;
  const maxZ = TEST_ARENA_DIMENSIONS.halfLength - AI_CONSTANTS.arenaMargin;
  return { x: V.clamp(point.x, -maxX, maxX), y: point.y, z: V.clamp(point.z, -maxZ, maxZ) };
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
