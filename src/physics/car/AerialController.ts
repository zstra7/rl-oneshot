import { RL_CONSTANTS } from "@/physics/PhysicsConstants";
import type { PhysicsParameters } from "@/physics/PhysicsParameters";
import * as V from "@/physics/Vec3Math";
import type { CarEntity } from "@/physics/entities/CarRegistry";

/**
 * physics spec section 24: local-space aerial rotation control.
 *
 * F5 (plan/ARENA_FLUSH_AND_REFINEMENTS_PLAN.md): this integrates angular
 * velocity directly in velocity-space (matching DodgeController and how
 * Rocket League itself behaves — angular response independent of the
 * body's mass/inertia) instead of going through `applyTorqueImpulse`.
 * The old torque-impulse approach let Rapier divide the impulse by the
 * car body's moment of inertia to get the actual angular velocity change,
 * silently dividing the RL-accurate constants in PhysicsConstants.ts by
 * ~23x (measured: pitch=1 held 1.0s reached only 0.537 rad/s, far short
 * of the 5.5 rad/s cap).
 *
 * Sign convention (matches DodgeController + Rocket League): pitch=+1
 * (the "pitchNoseDown" input, W in the air) must pitch the nose DOWN,
 * yaw=+1 swings the nose RIGHT, roll=+1 rolls the top of the car RIGHT.
 * With LOCAL_FORWARD=(0,0,-1)/LOCAL_RIGHT=(1,0,0)/UP=(0,1,0) and Rapier's
 * standard rotation convention, all three of these map to NEGATIVE local-
 * axis rates for a POSITIVE input — i.e. each axis's raw input must be
 * negated before going into computeAxisAcceleration. This was verified
 * empirically via the direction tests in aerialControl.spec.ts (not
 * derived on paper) — those tests are the authority if this comment and
 * reality ever disagree. The pre-fix code did not negate any axis, which
 * is why pitch was backwards (nose UP instead of DOWN) — nobody had
 * noticed the other two axes were equally wrong because the ~23x
 * weakness above made aerial control too feeble to matter.
 */
export function applyAerialRotation(car: CarEntity, parameters: PhysicsParameters, dt: number): void {
  const rotation = car.body.rotation();
  const inverseRotation = { x: -rotation.x, y: -rotation.y, z: -rotation.z, w: rotation.w };

  const worldAngularVelocity = car.body.angvel();
  const localAngularVelocity = V.applyQuaternion(worldAngularVelocity, inverseRotation);

  const pitchInput = car.currentInput.pitch;
  const yawInput = car.currentInput.yaw;
  const rollInput = car.currentInput.roll;

  const pitchAccel = computeAxisAcceleration(
    -pitchInput,
    localAngularVelocity.x,
    RL_CONSTANTS.maxPitchAngularAcceleration,
    parameters.aerial.pitchDamping,
    parameters.aerial.dampingInputReduction
  );
  const yawAccel = computeAxisAcceleration(
    -yawInput,
    localAngularVelocity.y,
    RL_CONSTANTS.maxYawAngularAcceleration,
    parameters.aerial.yawDamping,
    parameters.aerial.dampingInputReduction
  );
  // R10.3: air-roll sensitivity is a per-car control-profile multiplier on
  // the roll axis only (not pitch/yaw) — it scales how much rotational
  // acceleration a given input magnitude produces, physics-real for both
  // digital (roll=±1) and analog input.
  const rollAccel = computeAxisAcceleration(
    -rollInput,
    localAngularVelocity.z,
    RL_CONSTANTS.maxRollAngularAcceleration * car.controlProfile.airRollSensitivity,
    parameters.aerial.rollDamping,
    parameters.aerial.dampingInputReduction
  );

  const newLocalAngularVelocity = {
    x: localAngularVelocity.x + pitchAccel * dt,
    y: localAngularVelocity.y + yawAccel * dt,
    z: localAngularVelocity.z + rollAccel * dt
  };
  const newWorldAngularVelocity = V.applyQuaternion(newLocalAngularVelocity, rotation);
  car.body.setAngvel(newWorldAngularVelocity, true);

  clampAngularSpeed(car);
}

function computeAxisAcceleration(
  input: number,
  currentLocalRate: number,
  maxAcceleration: number,
  baseDamping: number,
  dampingInputReduction: number
): number {
  const inputAcceleration = input * maxAcceleration;
  const damping = baseDamping * (1 - dampingInputReduction * Math.abs(input));
  const dampingAcceleration = -currentLocalRate * damping;
  return inputAcceleration + dampingAcceleration;
}

function clampAngularSpeed(car: CarEntity): void {
  const angvel = car.body.angvel();
  const speed = V.length(angvel);

  if (speed > RL_CONSTANTS.carMaxAngularSpeed) {
    const clamped = V.scale(angvel, RL_CONSTANTS.carMaxAngularSpeed / speed);
    car.body.setAngvel(clamped, true);
  }
}
