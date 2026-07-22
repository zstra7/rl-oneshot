import { RL_CONSTANTS } from "@/physics/PhysicsConstants";
import type { PhysicsParameters } from "@/physics/PhysicsParameters";
import * as V from "@/physics/Vec3Math";
import type { CarEntity } from "@/physics/entities/CarRegistry";

/** physics spec section 24: local-space aerial rotation control. */
export function applyAerialRotation(car: CarEntity, parameters: PhysicsParameters, dt: number): void {
  const rotation = car.body.rotation();
  const inverseRotation = { x: -rotation.x, y: -rotation.y, z: -rotation.z, w: rotation.w };

  const worldAngularVelocity = car.body.angvel();
  const localAngularVelocity = V.applyQuaternion(worldAngularVelocity, inverseRotation);

  const pitchInput = car.currentInput.pitch;
  const yawInput = car.currentInput.yaw;
  const rollInput = car.currentInput.roll;

  const pitchAccel = computeAxisAcceleration(
    pitchInput,
    localAngularVelocity.x,
    RL_CONSTANTS.maxPitchAngularAcceleration,
    parameters.aerial.pitchDamping,
    parameters.aerial.dampingInputReduction
  );
  const yawAccel = computeAxisAcceleration(
    yawInput,
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
    rollInput,
    localAngularVelocity.z,
    RL_CONSTANTS.maxRollAngularAcceleration * car.controlProfile.airRollSensitivity,
    parameters.aerial.rollDamping,
    parameters.aerial.dampingInputReduction
  );

  const localAngularAcceleration = { x: pitchAccel, y: yawAccel, z: rollAccel };
  const worldAngularAcceleration = V.applyQuaternion(localAngularAcceleration, rotation);

  const torqueImpulse = V.scale(worldAngularAcceleration, dt);
  car.body.applyTorqueImpulse(torqueImpulse, true);

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
