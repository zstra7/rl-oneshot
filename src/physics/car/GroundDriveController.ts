import { BRAKE_SWITCH_SPEED, RL_CONSTANTS, throttleAcceleration } from "@/physics/PhysicsConstants";
import * as V from "@/physics/Vec3Math";
import type { CarEntity } from "@/physics/entities/CarRegistry";

const EPSILON = 0.001;

export interface SurfaceFrame {
  readonly forwardOnSurface: V.Vec3Like;
  readonly rightOnSurface: V.Vec3Like;
}

/** physics spec section 17.1: forward/right projected onto the support plane. */
export function computeSurfaceFrame(carForward: V.Vec3Like, supportNormal: V.Vec3Like): SurfaceFrame {
  const forwardOnSurface = V.normalize(
    V.sub(carForward, V.scale(supportNormal, V.dot(carForward, supportNormal)))
  );
  const rightOnSurface = V.normalize(V.cross(forwardOnSurface, supportNormal));

  return { forwardOnSurface, rightOnSurface };
}

/** physics spec section 17: ground drive (accelerate/brake/coast). */
export function applyGroundDrive(
  car: CarEntity,
  throttle: number,
  forwardOnSurface: V.Vec3Like,
  dt: number
): void {
  const linvel = car.body.linvel();
  const forwardSpeed = V.dot(linvel, forwardOnSurface);

  let accelerationMagnitude: number;
  let direction: V.Vec3Like;

  if (Math.abs(throttle) < EPSILON) {
    // Coast: move forward velocity toward zero.
    accelerationMagnitude = Math.min(RL_CONSTANTS.coastDeceleration, Math.abs(forwardSpeed) / dt);
    direction = V.scale(forwardOnSurface, -Math.sign(forwardSpeed));
  } else if (Math.abs(forwardSpeed) > BRAKE_SWITCH_SPEED && Math.sign(throttle) !== Math.sign(forwardSpeed)) {
    // Brake: opposite throttle direction to current motion.
    accelerationMagnitude = Math.min(RL_CONSTANTS.brakeDeceleration, Math.abs(forwardSpeed) / dt);
    direction = V.scale(forwardOnSurface, -Math.sign(forwardSpeed));
  } else {
    // Accelerate along throttle direction, curve tapers to zero at noBoostDriveSpeed.
    accelerationMagnitude = throttleAcceleration(Math.abs(forwardSpeed)) * Math.abs(throttle);
    direction = V.scale(forwardOnSurface, Math.sign(throttle));
  }

  if (accelerationMagnitude <= 0) {
    return;
  }

  const deltaVelocity = accelerationMagnitude * dt;
  const impulse = V.scale(direction, RL_CONSTANTS.carMass * deltaVelocity);
  car.body.applyImpulse(impulse, true);
}
