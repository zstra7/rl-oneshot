import * as RAPIER from "@dimforge/rapier3d-compat";

import {
  RL_CONSTANTS,
  SUSPENSION_PROBE_RADIUS,
  WHEEL_ANCHORS_LOCAL
} from "@/physics/PhysicsConstants";
import type { PhysicsParameters } from "@/physics/PhysicsParameters";
import * as V from "@/physics/Vec3Math";
import type { CarEntity } from "@/physics/entities/CarRegistry";

let sharedProbeShape: RAPIER.Ball | null = null;

function getProbeShape(): RAPIER.Ball {
  if (!sharedProbeShape) {
    sharedProbeShape = new RAPIER.Ball(SUSPENSION_PROBE_RADIUS);
  }
  return sharedProbeShape;
}

/**
 * Four sphere-cast suspension probes replacing physical wheels (physics
 * spec section 16). Applies spring/damper impulses at each anchor and
 * updates the car's grounded/supportNormal runtime state.
 */
export function updateSuspension(
  world: RAPIER.World,
  car: CarEntity,
  parameters: PhysicsParameters,
  dt: number
): void {
  const probe = getProbeShape();
  const bodyPos = car.body.translation();
  const bodyRot = car.body.rotation();
  const linvel = car.body.linvel();
  const angvel = car.body.angvel();

  let contactCount = 0;
  let normalSum = { x: 0, y: 0, z: 0 };
  let weightSum = 0;

  const downDirection = V.applyQuaternion({ x: 0, y: -1, z: 0 }, bodyRot);

  for (const anchorLocal of WHEEL_ANCHORS_LOCAL) {
    const anchorWorld = V.add(bodyPos, V.applyQuaternion(anchorLocal, bodyRot));

    const hit = world.castShape(
      anchorWorld,
      bodyRot,
      downDirection,
      probe,
      0,
      parameters.suspension.maximumLength,
      true,
      undefined,
      undefined,
      car.collider
    );

    if (!hit) {
      continue;
    }

    const hitDistance = hit.time_of_impact;
    const compression = Math.max(0, parameters.suspension.restLength - hitDistance);

    if (compression <= 0) {
      continue;
    }

    const contactNormal = hit.normal1 ?? { x: 0, y: 1, z: 0 };

    const leverArm = V.sub(anchorWorld, bodyPos);
    const pointVelocity = V.add(linvel, V.cross(angvel, leverArm));
    const compressionVelocity = -V.dot(pointVelocity, contactNormal);

    const springAcceleration = V.clamp(
      parameters.suspension.springStrength * compression +
        parameters.suspension.dampingStrength * compressionVelocity,
      0,
      parameters.suspension.maximumAcceleration
    );

    const impulse = V.scale(contactNormal, RL_CONSTANTS.carMass * springAcceleration * dt);
    car.body.applyImpulseAtPoint(impulse, anchorWorld, true);

    contactCount += 1;
    const weight = Math.max(compression, 0.001);
    normalSum = V.add(normalSum, V.scale(contactNormal, weight));
    weightSum += weight;
  }

  car.runtime.wheelContactCount = contactCount;
  car.runtime.grounded = contactCount >= parameters.suspension.requiredGroundContacts;

  if (weightSum > 0) {
    car.runtime.supportNormal = V.normalize(normalSum);
  }

  if (car.runtime.grounded) {
    car.runtime.ticksSinceGrounded = 0;
  } else {
    car.runtime.ticksSinceGrounded += 1;
  }
}
