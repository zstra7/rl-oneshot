import { RL_CONSTANTS } from "@/physics/PhysicsConstants";
import type { PhysicsParameters } from "@/physics/PhysicsParameters";
import * as V from "@/physics/Vec3Math";
import type { CarEntity } from "@/physics/entities/CarRegistry";

/** physics spec section 19: lateral grip + powerslide blend. */
export function applyLateralGrip(
  car: CarEntity,
  powerslideHeld: boolean,
  rightOnSurface: V.Vec3Like,
  parameters: PhysicsParameters,
  dt: number
): void {
  const target = powerslideHeld ? 1 : 0;
  car.runtime.powerslideBlend = V.moveToward(
    car.runtime.powerslideBlend,
    target,
    dt / parameters.grip.blendTime
  );

  const gripRate = lerp(parameters.grip.normalRate, parameters.grip.powerslideRate, car.runtime.powerslideBlend);
  const maxGripAcceleration = lerp(
    parameters.grip.normalMaxAcceleration,
    parameters.grip.powerslideMaxAcceleration,
    car.runtime.powerslideBlend
  );

  const linvel = car.body.linvel();
  const lateralSpeed = V.dot(linvel, rightOnSurface);

  const desiredDeltaLateralVelocity = V.clamp(
    -lateralSpeed * gripRate * dt,
    -maxGripAcceleration * dt,
    maxGripAcceleration * dt
  );

  const impulse = V.scale(rightOnSurface, RL_CONSTANTS.carMass * desiredDeltaLateralVelocity);
  car.body.applyImpulse(impulse, true);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
