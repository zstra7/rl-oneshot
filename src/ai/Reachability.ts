import { AI_CONSTANTS } from "@/ai/AiConstants";
import type { CarSerializableState } from "@/physics/PhysicsTypes";
import * as V from "@/physics/Vec3Math";

/**
 * Simplified kinematic reachability heuristic (AI spec section 11): the
 * spec explicitly warns against "iterative trajectory solvers, complex
 * quadratic equations, or recursive loops" here, recommending instead
 * "distance divided by current speed, plus a flat turn-penalty constant".
 * This estimates seconds for `car` to reach `targetPosition`, ignoring
 * jump/aerial/boost — not a physics simulation.
 */
export function estimateReachSeconds(
  car: CarSerializableState,
  targetPosition: V.Vec3Like
): number {
  const toTarget = V.sub(targetPosition, car.position);
  const flatDistance = Math.sqrt(toTarget.x * toTarget.x + toTarget.z * toTarget.z);

  const forward = V.applyQuaternion(V.LOCAL_FORWARD, car.rotation);
  const forwardFlat = V.normalize({ x: forward.x, y: 0, z: forward.z });
  const targetFlat = V.normalize({ x: toTarget.x, y: 0, z: toTarget.z });

  const headingDot = V.clamp(V.dot(forwardFlat, targetFlat), -1, 1);
  const angle = Math.acos(headingDot);
  const turnPenalty = (angle / Math.PI) * AI_CONSTANTS.reachabilityTurnPenaltySeconds;

  return flatDistance / AI_CONSTANTS.reachabilityAverageSpeed + turnPenalty;
}
