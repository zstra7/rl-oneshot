import { RL_CONSTANTS } from "@/physics/PhysicsConstants";
import * as V from "@/physics/Vec3Math";
import type { CarEntity } from "@/physics/entities/CarRegistry";

/** physics spec section 20: boost consumption + acceleration. */
export function applyBoost(
  car: CarEntity,
  boostRequested: boolean,
  carForwardWorld: V.Vec3Like,
  grounded: boolean,
  dt: number
): void {
  const active = boostRequested && car.runtime.boostAmount > 0;

  if (!active) {
    return;
  }

  car.runtime.boostAmount = Math.max(
    0,
    car.runtime.boostAmount - RL_CONSTANTS.boostConsumptionPerSecond * dt
  );

  const acceleration = grounded
    ? RL_CONSTANTS.boostAccelerationGround
    : RL_CONSTANTS.boostAccelerationAir;

  const impulse = V.scale(carForwardWorld, RL_CONSTANTS.carMass * acceleration * dt);
  car.body.applyImpulse(impulse, true);
}
