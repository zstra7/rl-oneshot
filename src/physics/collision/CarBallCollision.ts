import type * as RAPIER from "@dimforge/rapier3d-compat";

import type { PhysicsParameters } from "@/physics/PhysicsParameters";
import * as V from "@/physics/Vec3Math";
import type { CarEntity } from "@/physics/entities/CarRegistry";

/**
 * physics spec section 27, "phase one" implementation: Rapier solves base
 * contact; this adds one one-sided extra impulse per car-ball pair,
 * applied only on new-contact onset (simplified from the spec's
 * separation-distance re-contact tracking — see docs/physics-deviations.md).
 */
export function resolveCarBallContacts(
  world: RAPIER.World,
  cars: readonly CarEntity[],
  ballBody: RAPIER.RigidBody,
  wasTouchingLastTick: Map<string, boolean>,
  parameters: PhysicsParameters,
  dt: number
): void {
  const ballPosition = ballBody.translation();
  const ballVelocity = ballBody.linvel();

  let combinedContribution: V.Vec3Like = { x: 0, y: 0, z: 0 };
  let anyContribution = false;

  for (const car of cars) {
    let touchingNow = false;

    world.contactPair(car.collider, ballBody.collider(0), (manifold, flipped) => {
      if (manifold.numContacts() > 0) {
        touchingNow = true;
      }
      void flipped;
    });

    const wasTouching = wasTouchingLastTick.get(car.id) ?? false;

    if (touchingNow && !wasTouching) {
      const contribution = computeExtraHitContribution(car, ballPosition, ballVelocity, parameters);
      combinedContribution = V.add(combinedContribution, contribution);
      anyContribution = true;
    }

    wasTouchingLastTick.set(car.id, touchingNow);
  }

  if (anyContribution) {
    const newBallVelocity = V.add(ballVelocity, combinedContribution);
    ballBody.setLinvel(newBallVelocity, true);
  }

  void dt;
}

function computeExtraHitContribution(
  car: CarEntity,
  ballPosition: V.Vec3Like,
  ballVelocity: V.Vec3Like,
  parameters: PhysicsParameters
): V.Vec3Like {
  const carPosition = car.body.translation();
  const rotation = car.body.rotation();
  const carForward = V.applyQuaternion(V.LOCAL_FORWARD, rotation);

  // physics spec section 25.4: Y-up conversion of the reverse-engineered
  // extra-hit normal shaping.
  let n = V.sub(ballPosition, carPosition);
  n = { x: n.x, y: n.y * 0.35, z: n.z };
  n = V.normalize(V.sub(n, V.scale(carForward, 0.35 * V.dot(n, carForward))));

  const carLinearVelocity = car.body.linvel();
  const carAngularVelocity = car.body.angvel();

  // Approximate contact point as the ball centre (spec allows this
  // provisional simplification — see docs/physics-deviations.md).
  const leverArm = V.sub(ballPosition, carPosition);
  const carPointVelocity = V.add(carLinearVelocity, V.cross(carAngularVelocity, leverArm));

  const relativeClosing = Math.max(0, V.dot(V.sub(carPointVelocity, ballVelocity), n));
  const forwardContribution = Math.max(0, V.dot(carLinearVelocity, n));

  let extraDeltaSpeed =
    parameters.carBall.extraHitBaseScale * relativeClosing +
    parameters.carBall.extraHitForwardScale * forwardContribution;

  if (relativeClosing > 0.5) {
    extraDeltaSpeed += parameters.carBall.extraHitMinimumPunch;
  }

  if (car.runtime.dodgeState === "active") {
    extraDeltaSpeed += parameters.dodge.explicitBallHitBonus;
  }

  extraDeltaSpeed = V.clamp(extraDeltaSpeed, 0, parameters.carBall.extraHitMaximumDeltaSpeed);

  return V.scale(n, extraDeltaSpeed);
}
