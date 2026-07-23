import { maxCurvature } from "@/physics/PhysicsConstants";
import type { PhysicsParameters } from "@/physics/PhysicsParameters";
import * as V from "@/physics/Vec3Math";
import type { CarEntity } from "@/physics/entities/CarRegistry";

/** physics spec section 18: yaw-rate servo steering + upright alignment. */
export function applyGroundSteering(
  car: CarEntity,
  steer: number,
  forwardOnSurface: V.Vec3Like,
  supportNormal: V.Vec3Like,
  parameters: PhysicsParameters,
  dt: number
): void {
  const linvel = car.body.linvel();
  const angvel = car.body.angvel();

  const forwardSpeed = V.dot(linvel, forwardOnSurface);
  // steer:+1 = turn right = negative yaw rate about the support normal
  // (the car's local forward is -Z, so a positive yaw rate about +Y turns
  // the car toward its left, not its right).
  const desiredYawRate =
    -steer * maxCurvature(Math.abs(forwardSpeed)) * Math.abs(forwardSpeed) * V.signOrOne(forwardSpeed);

  const currentYawRate = V.dot(angvel, supportNormal);
  const error = desiredYawRate - currentYawRate;

  let yawAcceleration = V.clamp(
    error * parameters.steering.response,
    -parameters.steering.maximumYawAcceleration,
    parameters.steering.maximumYawAcceleration
  );

  if (car.runtime.powerslideBlend > 0) {
    yawAcceleration *= lerp(1, parameters.steering.powerslideYawMultiplier, car.runtime.powerslideBlend);
  }

  const torqueImpulse = V.scale(supportNormal, yawAcceleration * dt);
  car.body.applyTorqueImpulse(torqueImpulse, true);

  applyUprightAlignment(car, supportNormal, parameters, dt);
}

function applyUprightAlignment(
  car: CarEntity,
  supportNormal: V.Vec3Like,
  parameters: PhysicsParameters,
  dt: number
): void {
  const rotation = car.body.rotation();
  const carUp = V.applyQuaternion(V.UP, rotation);
  const angvel = car.body.angvel();

  const alignmentAxis = V.cross(carUp, supportNormal);

  // Angular velocity component tangential to the alignment axis (damping term).
  const tangentAngularVelocity = V.sub(
    angvel,
    V.scale(supportNormal, V.dot(angvel, supportNormal))
  );

  const alignmentAcceleration = V.sub(
    V.scale(alignmentAxis, parameters.steering.uprightStrength),
    V.scale(tangentAngularVelocity, parameters.steering.uprightDamping)
  );

  car.body.applyTorqueImpulse(V.scale(alignmentAcceleration, dt), true);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
