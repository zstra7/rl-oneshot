import type * as RAPIER from "@dimforge/rapier3d-compat";

import type { PhysicsParameters } from "@/physics/PhysicsParameters";
import * as V from "@/physics/Vec3Math";
import type { CarEntity } from "@/physics/entities/CarRegistry";
import { applyAerialRotation } from "@/physics/car/AerialController";
import { applyAirborneThrottle } from "@/physics/car/AirborneThrottleController";
import { applyBoost } from "@/physics/car/BoostController";
import { updateDodgeState } from "@/physics/car/DodgeController";
import { applyGroundDrive, computeSurfaceFrame } from "@/physics/car/GroundDriveController";
import { applyGroundSteering } from "@/physics/car/GroundSteeringController";
import { applyLateralGrip } from "@/physics/car/GripController";
import { processJump, processJumpReset } from "@/physics/car/JumpController";
import { updateSuspension } from "@/physics/car/SuspensionController";

/**
 * physics spec section 29 fixed-tick order, steps 4-16 (per car, before
 * `world.step()`).
 */
export function prePhysicsTick(
  world: RAPIER.World,
  car: CarEntity,
  parameters: PhysicsParameters,
  dt: number
): void {
  updateSuspension(world, car, parameters, dt);

  const rotation = car.body.rotation();
  const carForwardWorld = V.applyQuaternion(V.LOCAL_FORWARD, rotation);
  const carUpWorld = V.applyQuaternion(V.UP, rotation);

  processJump(car, carUpWorld, parameters, dt);
  updateDodgeState(car, parameters, dt);

  const input = car.currentInput;
  const grounded = car.runtime.grounded;

  applyBoost(car, input.boost, carForwardWorld, grounded, dt);

  if (grounded && car.runtime.dodgeState === "none") {
    const { forwardOnSurface, rightOnSurface } = computeSurfaceFrame(
      carForwardWorld,
      car.runtime.supportNormal
    );

    applyGroundDrive(car, input.throttle, forwardOnSurface, dt);
    applyGroundSteering(car, input.steer, forwardOnSurface, car.runtime.supportNormal, parameters, dt);
    applyLateralGrip(car, input.powerslide, rightOnSurface, parameters, dt);
  } else {
    applyAirborneThrottle(car, carForwardWorld, dt);

    if (car.runtime.dodgeState === "none") {
      applyAerialRotation(car, parameters, dt);
    }
  }
}

/** physics spec section 29, steps 25-28 (per car, after `world.step()`). */
export function postPhysicsTick(car: CarEntity): void {
  processJumpReset(car);
}
