import { AI_CONSTANTS } from "@/ai/AiConstants";
import { RL_CONSTANTS } from "@/physics/PhysicsConstants";
import { NEUTRAL_CAR_INPUT, type CarInput, type CarSerializableState } from "@/physics/PhysicsTypes";
import * as V from "@/physics/Vec3Math";

export interface DriveOptions {
  readonly boostAllowed: boolean;
}

/**
 * AI spec section 29 "Ground Maneuver Controller", scoped to Phase 9's
 * ground-only behaviour (no reverse-driving state machine, no dodges) —
 * a simple heading-error proportional steering controller. The physics
 * module's own yaw-rate servo (`GroundSteeringController`) turns a
 * normalised `steer` value into the actual torque, so the AI only needs
 * to output that normalised value, not reimplement car handling.
 *
 * Signed heading error in (-pi, pi] from the car's current facing to
 * `target`: 0 = target dead ahead, positive = target to the right.
 * `GroundSteeringController` maps positive `steer` directly to a
 * rightward turn (matching the human input mapping, `steerRight -
 * steerLeft`, D key => positive steer => turns right), so a positive
 * heading error (target to the right) maps directly to a positive
 * steer command — no compensating negation needed (WS1 fix).
 */
export function headingErrorTo(car: CarSerializableState, target: V.Vec3Like): number {
  const toTarget = V.sub(target, car.position);
  const flatToTarget = { x: toTarget.x, y: 0, z: toTarget.z };
  if (V.length(flatToTarget) < 0.05) {
    return 0;
  }

  const forward = V.applyQuaternion(V.LOCAL_FORWARD, car.rotation);
  const forwardFlat = V.normalize({ x: forward.x, y: 0, z: forward.z });
  const right = V.applyQuaternion(V.LOCAL_RIGHT, car.rotation);
  const rightFlat = V.normalize({ x: right.x, y: 0, z: right.z });

  const targetDirection = V.normalize(flatToTarget);
  const forwardDot = V.clamp(V.dot(forwardFlat, targetDirection), -1, 1);
  const rightDot = V.dot(rightFlat, targetDirection);

  return Math.atan2(rightDot, forwardDot);
}

export function driveTowardPoint(
  car: CarSerializableState,
  target: V.Vec3Like,
  options: DriveOptions
): CarInput {
  const toTarget = V.sub(target, car.position);
  const flatToTarget = { x: toTarget.x, y: 0, z: toTarget.z };
  const distance = V.length(flatToTarget);

  if (distance < 0.05) {
    return { ...NEUTRAL_CAR_INPUT };
  }

  const angleError = headingErrorTo(car, target);
  const steer = V.clamp(angleError * AI_CONSTANTS.steerGain, -1, 1);
  const absAngle = Math.abs(angleError);

  const boost =
    options.boostAllowed &&
    car.boostAmount > 0 &&
    absAngle < AI_CONSTANTS.boostAlignmentThreshold &&
    car.forwardSpeed < RL_CONSTANTS.noBoostDriveSpeed * AI_CONSTANTS.boostSpeedFraction;

  const powerslide =
    absAngle > AI_CONSTANTS.powerslideAngleThreshold &&
    car.speed > AI_CONSTANTS.powerslideMinimumSpeed;

  return {
    throttle: 1,
    steer,
    pitch: 0,
    yaw: 0,
    roll: 0,
    jump: false,
    boost,
    powerslide
  };
}

/**
 * AI spec section 26.1 "Air recovery": drives pitch/roll to bring the
 * car's up vector back toward world-up while airborne, reusing the same
 * `CarInput.pitch/roll` channel the human aerial controller consumes
 * (`AerialController.applyAerialRotation`) — no special-cased physics
 * path needed for AI recovery.
 */
export function computeRecoveryInput(car: CarSerializableState): CarInput {
  const inverseRotation = {
    x: -car.rotation.x,
    y: -car.rotation.y,
    z: -car.rotation.z,
    w: car.rotation.w
  };
  // Where world-up currently sits in the car's local frame. Upright ==
  // (0, 1, 0); local X deviation means roll is needed, local Z deviation
  // means pitch is needed.
  const localUpTarget = V.applyQuaternion(V.UP, inverseRotation);
  // A proportional-only controller badly overshoots here: a large initial
  // error saturates the output for many ticks, builds up real angular
  // momentum, and carries straight through the upright point. Damp using
  // the car's own current local roll/pitch rate (found via ad hoc Vitest
  // debugging — ties/logging showed the car sailing past upright on its
  // way to landing on its side instead of settling).
  const localAngularVelocity = V.applyQuaternion(car.angularVelocity, inverseRotation);

  // F5 (plan/ARENA_FLUSH_AND_REFINEMENTS_PLAN.md): both terms' signs were
  // flipped from the pre-F5 formula. AerialController now negates every
  // raw input axis before applying it (see its doc comment), which
  // flipped the physical meaning of a given roll/pitch *value* on both
  // ends of this P-D loop — the proportional term (was tuned to *fight*
  // the old physics's inverted response) and the damping term (a given
  // roll/pitch value now cancels local angular rate in the opposite
  // sense too). Verified empirically (not derived on paper, per the plan):
  // the pre-F5 signs, replayed against the new physics, drove
  // localUpTarget AWAY from upright (see the ad hoc probe in this
  // session); flipping both terms converges cleanly and matches
  // `aiRecovery.spec.ts`. recoveryGain/recoveryDamping magnitudes are
  // unchanged (3.0/0.35 still produce a clean, non-oscillating recovery
  // under the new velocity-space integration).
  let roll = V.clamp(
    localUpTarget.x * AI_CONSTANTS.recoveryGain + localAngularVelocity.z * AI_CONSTANTS.recoveryDamping,
    -1,
    1
  );
  let pitch = V.clamp(
    -localUpTarget.z * AI_CONSTANTS.recoveryGain + localAngularVelocity.x * AI_CONSTANTS.recoveryDamping,
    -1,
    1
  );

  // A near-exact 180-degree flip (nose-over or barrel-roll) is an
  // unstable equilibrium for this proportional controller: localUpTarget
  // sits at (~0, -1, ~0), so both the roll and pitch error terms vanish
  // even though the car is completely inverted. Force a symmetry-
  // breaking roll until the flip tips away from that equilibrium, at
  // which point the proportional terms above take back over.
  const worldUp = V.applyQuaternion(V.UP, car.rotation);
  if (Math.abs(roll) < 0.05 && Math.abs(pitch) < 0.05 && worldUp.y < -0.9) {
    roll = 1;
  }

  return {
    throttle: 0,
    steer: 0,
    pitch,
    yaw: 0,
    roll,
    jump: false,
    boost: false,
    powerslide: false
  };
}
