import * as RAPIER from "@dimforge/rapier3d-compat";

import { RL_CONSTANTS } from "@/physics/PhysicsConstants";
import * as V from "@/physics/Vec3Math";
import type { CarEntity } from "@/physics/entities/CarRegistry";
import { BoostPadRegistry } from "@/physics/boost/BoostPadRegistry";
import {
  BOOST_PAD_CONSTANTS,
  pickupAmountFor,
  respawnTicksFor,
  type BoostPadClaim,
  type BoostPadDefinition,
  type BoostPadEvent,
  type BoostPadId,
  type BoostPadObservation
} from "@/physics/boost/BoostPadTypes";

/**
 * physics spec section 21: boost pad sensors, deterministic pickup
 * resolution, tick-exact respawn. Sensor colliders interact with cars
 * only (never the ball) and never affect grounded/suspension state.
 */
export class BoostPadSystem {
  public readonly registry = new BoostPadRegistry();
  private readonly colliders = new Map<BoostPadId, RAPIER.Collider>();
  private events: BoostPadEvent[] = [];

  public buildColliders(world: RAPIER.World, definitions: readonly BoostPadDefinition[]): void {
    this.disposeColliders(world);
    this.registry.clear();

    for (const definition of definitions) {
      this.registry.add(definition);

      const collider = world.createCollider(
        RAPIER.ColliderDesc.cylinder(definition.pickupHalfHeight, definition.pickupRadius)
          .setTranslation(definition.position.x, definition.position.y, definition.position.z)
          .setSensor(true)
      );

      this.colliders.set(definition.id, collider);
    }
  }

  private disposeColliders(world: RAPIER.World): void {
    for (const collider of this.colliders.values()) {
      world.removeCollider(collider, true);
    }
    this.colliders.clear();
  }

  public dispose(world: RAPIER.World): void {
    this.disposeColliders(world);
    this.registry.clear();
    this.events = [];
  }

  /** physics spec section 21.5-21.6: gather, group, and resolve claims. */
  public resolveClaims(world: RAPIER.World, cars: readonly CarEntity[], tick: number): void {
    const claimsByPad = new Map<BoostPadId, BoostPadClaim[]>();

    for (const padState of this.registry.getAllStable()) {
      if (!padState.active) {
        continue;
      }

      const padCollider = this.colliders.get(padState.id);
      if (!padCollider) {
        continue;
      }

      const definition = this.registry.getDefinition(padState.id);

      for (const car of cars) {
        if (car.runtime.boostAmount >= RL_CONSTANTS.maximumBoostAmount - BOOST_PAD_CONSTANTS.boostFullEpsilon) {
          continue;
        }

        if (!world.intersectionPair(car.collider, padCollider)) {
          continue;
        }

        const carPosition = car.body.translation();
        const toPad = V.sub(definition.position, carPosition);
        const distanceSquared = V.dot(toPad, toPad);
        const velocityTowardPad = V.dot(car.body.linvel(), V.normalize(toPad));

        const claims = claimsByPad.get(padState.id) ?? [];
        claims.push({ padId: padState.id, carId: car.id, distanceSquared, velocityTowardPad });
        claimsByPad.set(padState.id, claims);
      }
    }

    for (const [padId, claims] of claimsByPad) {
      const winner = resolveWinningClaim(claims);
      if (winner) {
        this.applyPickup(padId, winner.carId, cars, tick);
      }
    }
  }

  private applyPickup(padId: BoostPadId, carId: string, cars: readonly CarEntity[], tick: number): void {
    const car = cars.find((c) => c.id === carId);
    if (!car) {
      return;
    }

    const padState = this.registry.get(padId);
    const definition = this.registry.getDefinition(padId);

    const boostBefore = car.runtime.boostAmount;
    const boostAfter =
      definition.type === "full"
        ? RL_CONSTANTS.maximumBoostAmount
        : Math.min(RL_CONSTANTS.maximumBoostAmount, boostBefore + pickupAmountFor(definition.type));

    car.runtime.boostAmount = boostAfter;

    padState.active = false;
    padState.collectedAtTick = tick;
    const respawnTicks = respawnTicksFor(definition.type, RL_CONSTANTS.physicsHz);
    padState.respawnAtTick = tick + respawnTicks;
    padState.respawnTicksRemaining = respawnTicks;
    padState.lastCollectedByCarId = carId;

    this.events.push({
      type: "boost-pad-collected",
      tick,
      padId,
      padType: definition.type,
      carId,
      boostBefore,
      boostAfter,
      boostGranted: boostAfter - boostBefore,
      respawnAtTick: padState.respawnAtTick
    });
  }

  /** physics spec section 21.8: tick-exact respawn using absolute ticks. */
  public processRespawns(tick: number): void {
    for (const padState of this.registry.getAllStable()) {
      if (!padState.active && padState.respawnAtTick !== null && tick >= padState.respawnAtTick) {
        padState.active = true;
        padState.respawnAtTick = null;
        padState.respawnTicksRemaining = 0;

        this.events.push({
          type: "boost-pad-respawned",
          tick,
          padId: padState.id,
          padType: padState.type
        });
      } else if (!padState.active && padState.respawnAtTick !== null) {
        padState.respawnTicksRemaining = padState.respawnAtTick - tick;
      }
    }
  }

  public getObservations(): BoostPadObservation[] {
    return this.registry.getAllStable().map((state) => {
      const definition = this.registry.getDefinition(state.id);
      return {
        id: state.id,
        type: state.type,
        position: definition.position,
        active: state.active,
        respawnSecondsRemaining: state.respawnTicksRemaining / RL_CONSTANTS.physicsHz,
        pickupAmount: pickupAmountFor(state.type)
      };
    });
  }

  public getEvents(): readonly BoostPadEvent[] {
    return [...this.events];
  }

  public clearEvents(): void {
    this.events = [];
  }

  public resetAllActive(): void {
    this.registry.resetAllActive();
  }
}

/** physics spec section 21.6: deterministic tie-break chain. */
function resolveWinningClaim(claims: readonly BoostPadClaim[]): BoostPadClaim | null {
  if (claims.length === 0) {
    return null;
  }
  if (claims.length === 1) {
    return claims[0]!;
  }

  const tieEpsilon = 1e-6;

  let best = claims[0]!;
  for (const claim of claims.slice(1)) {
    if (claim.distanceSquared < best.distanceSquared - tieEpsilon) {
      best = claim;
    } else if (Math.abs(claim.distanceSquared - best.distanceSquared) <= tieEpsilon) {
      if (claim.velocityTowardPad > best.velocityTowardPad + tieEpsilon) {
        best = claim;
      } else if (Math.abs(claim.velocityTowardPad - best.velocityTowardPad) <= tieEpsilon) {
        if (claim.carId < best.carId) {
          best = claim;
        }
      }
    }
  }

  return best;
}
