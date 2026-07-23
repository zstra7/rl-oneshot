import { RL_CONSTANTS } from "@/physics/PhysicsConstants";
import * as V from "@/physics/Vec3Math";
import type { CarEntity } from "@/physics/entities/CarRegistry";

/** physics spec section 23: airborne throttle (acts alongside boost). */
export function applyAirborneThrottle(car: CarEntity, carForwardWorld: V.Vec3Like, dt: number): void {
  const throttle = car.currentInput.throttle;

  if (throttle === 0) {
    return;
  }

  const accelerationScale =
    throttle > 0
      ? RL_CONSTANTS.airThrottleForwardAcceleration
      : RL_CONSTANTS.airThrottleReverseAcceleration;

  const impulse = V.scale(carForwardWorld, RL_CONSTANTS.carMass * accelerationScale * throttle * dt);
  car.body.applyImpulse(impulse, true);
}
