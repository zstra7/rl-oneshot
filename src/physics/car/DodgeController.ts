import { RL_CONSTANTS } from "@/physics/PhysicsConstants";
import type { PhysicsParameters } from "@/physics/PhysicsParameters";
import * as V from "@/physics/Vec3Math";
import type { CarEntity } from "@/physics/entities/CarRegistry";

/**
 * physics spec section 25: dodge trigger + linear impulse. Returns true if
 * a dodge was triggered (so the caller skips the neutral second-jump
 * impulse). Rotation profile is intentionally simplified for Phase 5 —
 * see docs/physics-deviations.md.
 */
export function tryTriggerDodge(car: CarEntity, parameters: PhysicsParameters): boolean {
  const direction = {
    forward: -car.currentInput.pitch,
    right: car.currentInput.yaw
  };

  const magnitude = Math.sqrt(direction.forward ** 2 + direction.right ** 2);

  if (magnitude < car.controlProfile.dodgeDeadzone) {
    return false;
  }

  const rotation = car.body.rotation();
  const carForward = V.applyQuaternion(V.LOCAL_FORWARD, rotation);
  const carRight = V.applyQuaternion(V.LOCAL_RIGHT, rotation);

  const worldDirection = V.normalize(
    V.add(V.scale(carForward, direction.forward), V.scale(carRight, direction.right))
  );

  const impulse = V.scale(worldDirection, RL_CONSTANTS.carMass * parameters.dodge.linearImpulse);
  car.body.applyImpulse(impulse, true);

  car.runtime.dodgeState = "active";
  car.runtime.dodgeElapsed = 0;
  car.runtime.dodgeDirection = { x: worldDirection.x, z: worldDirection.z };

  return true;
}

/** physics spec section 25.4-25.5: dodge rotation profile + state phases. */
export function updateDodgeState(car: CarEntity, parameters: PhysicsParameters, dt: number): void {
  if (car.runtime.dodgeState === "none") {
    return;
  }

  car.runtime.dodgeElapsed += dt;

  if (car.runtime.dodgeState === "active") {
    // Drive a fast rotation toward the dodge direction, restricting
    // ordinary aerial input for the active duration. Opposite pitch input
    // cancels the pitch component (flip cancel).
    const pitchCancel = car.currentInput.pitch > 0 ? car.currentInput.pitch : 0;
    const pitchRate =
      -car.runtime.dodgeDirection.z * parameters.dodge.angularAcceleration -
      pitchCancel * parameters.dodge.flipCancelPitchDeceleration;
    const rollRate = car.runtime.dodgeDirection.x * parameters.dodge.angularAcceleration;

    const rotation = car.body.rotation();
    const carRight = V.applyQuaternion(V.LOCAL_RIGHT, rotation);
    const carForward = V.applyQuaternion(V.LOCAL_FORWARD, rotation);

    const torqueImpulse = V.add(
      V.scale(carRight, pitchRate * dt),
      V.scale(carForward, rollRate * dt)
    );
    car.body.applyTorqueImpulse(torqueImpulse, true);

    if (car.runtime.dodgeElapsed >= parameters.dodge.activeDuration) {
      car.runtime.dodgeState = "recovery";
      car.runtime.dodgeElapsed = 0;
    }
  } else if (car.runtime.dodgeState === "recovery") {
    if (car.runtime.dodgeElapsed >= parameters.dodge.recoveryDuration) {
      car.runtime.dodgeState = "none";
      car.runtime.dodgeElapsed = 0;
    }
  }
}
