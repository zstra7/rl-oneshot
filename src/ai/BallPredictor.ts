import { AI_CONSTANTS } from "@/ai/AiConstants";
import { RL_CONSTANTS } from "@/physics/PhysicsConstants";
import type { BallSerializableState } from "@/physics/PhysicsTypes";
import * as V from "@/physics/Vec3Math";

export interface BallPredictionSample {
  readonly time: number;
  readonly position: V.Vec3Like;
  readonly velocity: V.Vec3Like;
}

/**
 * AI spec section 10.3's explicitly-permitted fallback: "Analytical
 * gravity plus swept collision approximation... must share ball bounce
 * constants with physics." Predicts free flight plus floor-bounce
 * reflections only (no wall/ceiling bounces, no car interaction, no
 * rolling friction after a bounce) — Phase 9's tactical use of this
 * (short-horizon aim/intercept point selection) is dominated by the
 * first floor contact, and the spec explicitly forbids spinning up a
 * second full Rapier world or an iterative exact solver for this. See
 * docs/build-decisions.md Phase 9 section.
 */
export function predictBallTrajectory(
  ball: BallSerializableState,
  horizonSeconds: number = AI_CONSTANTS.predictionHorizonSeconds,
  sampleIntervalSeconds: number = AI_CONSTANTS.predictionSampleIntervalSeconds,
  floorY: number = RL_CONSTANTS.ballRadius
): BallPredictionSample[] {
  const samples: BallPredictionSample[] = [];

  let position = { ...ball.position };
  let velocity = { ...ball.linearVelocity };
  let t = 0;

  while (t < horizonSeconds) {
    velocity = {
      x: velocity.x,
      y: velocity.y - RL_CONSTANTS.gravity * sampleIntervalSeconds,
      z: velocity.z
    };
    position = V.add(position, V.scale(velocity, sampleIntervalSeconds));

    if (position.y <= floorY && velocity.y < 0) {
      position = { ...position, y: floorY };
      velocity = { x: velocity.x, y: -velocity.y * RL_CONSTANTS.ballWorldRestitution, z: velocity.z };
    }

    t += sampleIntervalSeconds;
    samples.push({ time: t, position, velocity });
  }

  return samples;
}
