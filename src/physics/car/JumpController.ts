import { RL_CONSTANTS } from "@/physics/PhysicsConstants";
import type { PhysicsParameters } from "@/physics/PhysicsParameters";
import * as V from "@/physics/Vec3Math";
import type { CarEntity } from "@/physics/entities/CarRegistry";
import { tryTriggerDodge } from "@/physics/car/DodgeController";

export function isJumpPressed(car: CarEntity): boolean {
  return car.currentInput.jump && !car.previousInput.jump;
}

/** physics spec section 22: first jump, held jump, sticky force, second jump/dodge trigger. */
export function processJump(
  car: CarEntity,
  carUpWorld: V.Vec3Like,
  parameters: PhysicsParameters,
  dt: number
): void {
  const jumpPressed = isJumpPressed(car);

  if (jumpPressed) {
    if (car.runtime.grounded && !car.runtime.firstJumpUsed) {
      applyJumpImpulse(car, carUpWorld);
      car.runtime.firstJumpUsed = true;
      car.runtime.secondJumpAvailable = true;
      car.runtime.jumpHoldElapsed = 0;
      car.runtime.jumpElapsed = 0;
      car.runtime.jumpButtonHeldTicks = 0;
      car.runtime.stickyTicksRemaining = RL_CONSTANTS.stickyTicks;
      car.runtime.secondJumpWindowElapsed = 0;
      car.runtime.hasLeftGroundSinceJump = false;
    } else if (
      car.runtime.firstJumpUsed &&
      car.runtime.secondJumpAvailable &&
      car.runtime.secondJumpWindowElapsed < parameters.jump.secondJumpWindow
    ) {
      const dodgeTriggered = tryTriggerDodge(car, parameters);

      if (!dodgeTriggered) {
        // Neutral second jump: same delta velocity, no held-force component.
        applyJumpImpulse(car, carUpWorld);
      }

      car.runtime.secondJumpAvailable = false;
    }
  }

  // Held jump: applies for up to jumpHoldMaximumTime while held, with a
  // guaranteed minimum application window regardless of an early release.
  if (car.runtime.firstJumpUsed && car.runtime.jumpHoldElapsed < RL_CONSTANTS.jumpHoldMaximumTime) {
    const shouldApply =
      car.currentInput.jump || car.runtime.jumpButtonHeldTicks < RL_CONSTANTS.jumpHoldMinimumTicks;

    if (shouldApply) {
      const impulse = V.scale(carUpWorld, RL_CONSTANTS.carMass * RL_CONSTANTS.jumpHoldAcceleration * dt);
      car.body.applyImpulse(impulse, true);
      car.runtime.jumpHoldElapsed += dt;
      car.runtime.jumpButtonHeldTicks += 1;
    }
  }

  // Sticky force: for exactly three ticks after the first jump, a small
  // downward pull keeps the car from popping off the ground on liftoff.
  if (car.runtime.stickyTicksRemaining > 0) {
    const impulse = V.scale(
      V.scale(carUpWorld, -1),
      RL_CONSTANTS.carMass * RL_CONSTANTS.stickyAcceleration * dt
    );
    car.body.applyImpulse(impulse, true);
    car.runtime.stickyTicksRemaining -= 1;
  }

  if (!car.runtime.grounded) {
    car.runtime.secondJumpWindowElapsed += dt;

    if (car.runtime.firstJumpUsed) {
      car.runtime.hasLeftGroundSinceJump = true;
    }
  }
}

function applyJumpImpulse(car: CarEntity, carUpWorld: V.Vec3Like): void {
  const impulse = V.scale(carUpWorld, RL_CONSTANTS.carMass * RL_CONSTANTS.jumpDeltaVelocity);
  car.body.applyImpulse(impulse, true);
}

/** physics spec section 22.7-style flip/jump reset when the car lands again. */
export function processJumpReset(car: CarEntity): void {
  const landedAfterLeavingGround = car.runtime.grounded && car.runtime.hasLeftGroundSinceJump;
  const neverJumped = car.runtime.grounded && !car.runtime.firstJumpUsed;

  if ((landedAfterLeavingGround || neverJumped) && car.runtime.dodgeState === "none") {
    car.runtime.firstJumpUsed = false;
    car.runtime.secondJumpAvailable = false;
    car.runtime.secondJumpWindowElapsed = 0;
    car.runtime.hasLeftGroundSinceJump = false;
  }
}
