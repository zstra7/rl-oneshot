import { RL_CONSTANTS } from "@/physics/PhysicsConstants";
import { flipRate } from "@/physics/car/DodgeRateProfile";
import type { PhysicsParameters } from "@/physics/PhysicsParameters";
import * as V from "@/physics/Vec3Math";
import type { CarEntity } from "@/physics/entities/CarRegistry";

/**
 * G7.a (plan/GAME_ENHANCEMENTS_PLAN.md): ticks of exponential decay applied
 * to the flip's residual non-yaw spin once the active phase ends, instead
 * of an instant snap to zero — see `updateDodgeState`'s recovery branch.
 */
const RECOVERY_DAMP_TICKS = 3;
const RECOVERY_DAMP_FACTOR = 0.4;

/**
 * WS3 (plan/POLISH_OVERHAUL_PLAN.md): kinematic flip rewrite. Rocket
 * League's directional dodge is a crisp, guaranteed near-360-degree
 * flip that lands the car back on its wheels — a torque ramp (the
 * previous implementation) can't guarantee a fixed rotation amount, so
 * this drives angular velocity directly at a fixed rate for a fixed
 * duration instead.
 *
 * physics spec section 25: dodge trigger + linear impulse. Returns true if
 * a dodge was triggered (so the caller skips the neutral second-jump
 * impulse).
 */
export function tryTriggerDodge(car: CarEntity, parameters: PhysicsParameters): boolean {
  const direction = {
    // Nose-down pitch input (W in the air) triggers a *forward* dodge —
    // matching Rocket League's stick-forward-flips-forward convention.
    forward: car.currentInput.pitch,
    right: car.currentInput.yaw
  };

  const magnitude = Math.sqrt(direction.forward ** 2 + direction.right ** 2);

  if (magnitude < car.controlProfile.dodgeDeadzone) {
    return false;
  }

  const rotation = car.body.rotation();
  const carForward = V.applyQuaternion(V.LOCAL_FORWARD, rotation);
  const carRight = V.applyQuaternion(V.LOCAL_RIGHT, rotation);

  // Flatten onto the horizontal plane so a slightly nose-up/down car still
  // dodges horizontally, like Rocket League.
  const flatForward = V.normalize({ x: carForward.x, y: 0, z: carForward.z });
  const flatRight = V.normalize({ x: carRight.x, y: 0, z: carRight.z });

  const worldDirection = V.normalize(
    V.add(V.scale(flatForward, direction.forward), V.scale(flatRight, direction.right))
  );

  // Vertical cancel: a directional dodge zeroes any upward velocity first
  // (this is what makes front-flips/speed-flips hug the ground instead of
  // launching upward).
  const linvelBefore = car.body.linvel();
  if (linvelBefore.y > 0) {
    car.body.setLinvel({ x: linvelBefore.x, y: 0, z: linvelBefore.z }, true);
  }

  const impulse = V.scale(worldDirection, RL_CONSTANTS.carMass * parameters.dodge.linearImpulse);
  car.body.applyImpulse(impulse, true);

  // Cap resulting planar speed at the car's normal max speed so the dodge
  // impulse can't push the car past what driving/boosting ever reaches.
  const linvelAfter = car.body.linvel();
  const planar = { x: linvelAfter.x, z: linvelAfter.z };
  const planarSpeed = Math.sqrt(planar.x ** 2 + planar.z ** 2);
  if (planarSpeed > RL_CONSTANTS.carMaxSpeed) {
    const scaleFactor = RL_CONSTANTS.carMaxSpeed / planarSpeed;
    car.body.setLinvel(
      { x: planar.x * scaleFactor, y: linvelAfter.y, z: planar.z * scaleFactor },
      true
    );
  }

  // The flip axis is fixed at trigger time: rotating the world-up vector
  // toward the dodge direction is exactly the axis that pitches/rolls the
  // car's nose toward where it's dodging.
  const flipAxis = V.normalize(V.cross(V.UP, worldDirection));

  car.runtime.dodgeState = "active";
  car.runtime.dodgeElapsed = 0;
  car.runtime.dodgeDirection = { x: worldDirection.x, z: worldDirection.z };
  car.runtime.dodgeAxis = flipAxis;
  car.runtime.dodgeForwardInput = direction.forward;
  car.runtime.dodgeCancelBlend = 0;

  return true;
}

/** physics spec section 25.4-25.5: dodge rotation profile + state phases. */
export function updateDodgeState(car: CarEntity, parameters: PhysicsParameters, dt: number): void {
  if (car.runtime.dodgeState === "none") {
    return;
  }

  car.runtime.dodgeElapsed += dt;

  if (car.runtime.dodgeState === "active") {
    // G7.a: front-loaded rate profile (peaks immediately, eases down
    // through the back half) instead of a constant metronome rate — see
    // DodgeRateProfile.ts's doc comment for why this is what makes a real
    // RL flip feel clean. Its integral over the full duration is exactly
    // 2*PI, so an uncancelled flip still lands wheels-down.
    const currentRate = flipRate(car.runtime.dodgeElapsed, parameters.dodge.activeDuration);

    // Flip cancel: holding pitch opposite the dodge's own forward
    // component blends the flip rate down to zero and ends the active
    // phase early. Only applies to forward/backward dodges — a pure
    // sideways dodge has no forward component to oppose.
    if (car.runtime.dodgeForwardInput !== 0) {
      const inputPitch = car.currentInput.pitch;
      const opposesFlip = Math.sign(inputPitch) === -Math.sign(car.runtime.dodgeForwardInput);
      if (opposesFlip && Math.abs(inputPitch) > 0.5) {
        car.runtime.dodgeCancelBlend = Math.min(
          1,
          car.runtime.dodgeCancelBlend + dt / parameters.dodge.flipCancelBlendSeconds
        );
      }
    }

    const effectiveRate = currentRate * (1 - car.runtime.dodgeCancelBlend);
    car.body.setAngvel(V.scale(car.runtime.dodgeAxis, effectiveRate), true);

    const cancelledOut = car.runtime.dodgeCancelBlend >= 1;
    if (cancelledOut || car.runtime.dodgeElapsed >= parameters.dodge.activeDuration) {
      // G7.a: landing should carry yaw (so a dodge can still redirect
      // heading) but not the flip's pitch/roll spin — otherwise the car
      // keeps tumbling instead of settling flat. Rather than an instant
      // snap to yaw-only (the old hard cutoff a player felt as a "snap"),
      // the residual non-yaw spin carries into recovery and decays there
      // over RECOVERY_DAMP_TICKS ticks (see the recovery branch below) —
      // easing into wheels-down instead of chopping to it.
      car.runtime.dodgeRecoveryDampTicksRemaining = RECOVERY_DAMP_TICKS;
      car.runtime.dodgeState = "recovery";
      car.runtime.dodgeElapsed = 0;
    }
  } else if (car.runtime.dodgeState === "recovery") {
    if (car.runtime.dodgeRecoveryDampTicksRemaining > 0) {
      const angvel = car.body.angvel();
      const yawComponent = V.scale(V.UP, V.dot(angvel, V.UP));
      const nonYawComponent = V.sub(angvel, yawComponent);

      car.runtime.dodgeRecoveryDampTicksRemaining -= 1;
      if (car.runtime.dodgeRecoveryDampTicksRemaining <= 0) {
        // Final tick: fully settle rather than asymptotically approach zero.
        car.body.setAngvel(yawComponent, true);
      } else {
        car.body.setAngvel(V.add(yawComponent, V.scale(nonYawComponent, RECOVERY_DAMP_FACTOR)), true);
      }
    }

    if (car.runtime.dodgeElapsed >= parameters.dodge.recoveryDuration) {
      car.runtime.dodgeState = "none";
      car.runtime.dodgeElapsed = 0;
      car.runtime.dodgeRecoveryDampTicksRemaining = 0;
    }
  }
}
