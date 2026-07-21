import type { AiRandom } from "@/ai/AiRandom";
import { RL_CONSTANTS } from "@/physics/PhysicsConstants";
import type { BallSerializableState, CarSerializableState } from "@/physics/PhysicsTypes";

interface Sample {
  readonly tick: number;
  readonly ball: BallSerializableState;
  readonly humanCar: CarSerializableState;
}

const HISTORY_TICKS = Math.ceil(0.4 * RL_CONSTANTS.physicsHz) + 4;

/**
 * AI spec section 6.2/6.3: "unexpected events enter perception after a
 * difficulty-specific delay" and a bounded perception history. Records
 * the ground-truth ball/human state every tick and, when queried, returns
 * the sample from `reactionDelaySeconds` ago (not the instantaneous
 * truth) — this is what gives the AI a fair, human-like information
 * disadvantage rather than omniscient reflexes. Only the ball and the
 * human car are delayed; the AI's own car state is read directly (AI
 * spec's `ownStateDelaySeconds` is much smaller and is not modelled
 * separately here — see docs/build-decisions.md Phase 10 section).
 */
export class PerceptionBuffer {
  private readonly history: Sample[] = [];

  public record(tick: number, ball: BallSerializableState, humanCar: CarSerializableState): void {
    this.history.push({ tick, ball, humanCar });
    while (this.history.length > HISTORY_TICKS) {
      this.history.shift();
    }
  }

  /** Returns the oldest-available sample at or before `tick - delaySeconds`. */
  public getDelayed(tick: number, delaySeconds: number): Sample {
    const delayTicks = Math.round(delaySeconds * RL_CONSTANTS.physicsHz);
    const targetTick = tick - delayTicks;

    let selected = this.history[0];
    for (const sample of this.history) {
      if (sample.tick > targetTick) {
        break;
      }
      selected = sample;
    }

    return selected ?? this.history[this.history.length - 1]!;
  }
}

/**
 * AI spec section 6.4 "imperfect perception": applies bounded noise to a
 * delayed position/velocity sample, scaled by the difficulty's
 * perception noise parameters, using the AI's own seeded PRNG (never
 * `Math.random()`).
 */
export function applyPerceptionNoise(
  ball: BallSerializableState,
  positionNoise: number,
  velocityNoise: number,
  random: AiRandom
): BallSerializableState {
  if (positionNoise <= 0 && velocityNoise <= 0) {
    return ball;
  }

  return {
    ...ball,
    position: {
      x: ball.position.x + random.range(-positionNoise, positionNoise),
      y: ball.position.y,
      z: ball.position.z + random.range(-positionNoise, positionNoise)
    },
    linearVelocity: {
      x: ball.linearVelocity.x + random.range(-velocityNoise, velocityNoise),
      y: ball.linearVelocity.y,
      z: ball.linearVelocity.z + random.range(-velocityNoise, velocityNoise)
    }
  };
}
