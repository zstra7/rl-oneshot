import type RAPIER from "@dimforge/rapier3d-compat";

import {
  DEFAULT_DODGE_DEADZONE,
  NEUTRAL_CAR_INPUT,
  type CarControlProfile,
  type CarId,
  type CarInput
} from "@/physics/PhysicsTypes";
import { createInitialCarRuntimeState, type CarRuntimeState } from "@/physics/car/CarRuntimeState";

export interface CarEntity {
  readonly id: CarId;
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  currentInput: CarInput;
  previousInput: CarInput;
  controlProfile: CarControlProfile;
  readonly runtime: CarRuntimeState;
}

export function createCarEntity(
  id: CarId,
  body: RAPIER.RigidBody,
  collider: RAPIER.Collider,
  initialBoost: number
): CarEntity {
  return {
    id,
    body,
    collider,
    currentInput: { ...NEUTRAL_CAR_INPUT },
    previousInput: { ...NEUTRAL_CAR_INPUT },
    controlProfile: { dodgeDeadzone: DEFAULT_DODGE_DEADZONE },
    runtime: createInitialCarRuntimeState(initialBoost)
  };
}

/**
 * Never a global singleton car — every mutable gameplay value belongs to
 * one entry here, keyed by stable CarId (physics spec section 10.1).
 */
export class CarRegistry {
  private readonly cars = new Map<CarId, CarEntity>();
  private readonly insertionOrder: CarId[] = [];

  public add(car: CarEntity): void {
    if (this.cars.has(car.id)) {
      throw new Error(`Duplicate CarId "${car.id}" rejected.`);
    }
    this.cars.set(car.id, car);
    this.insertionOrder.push(car.id);
  }

  public remove(carId: CarId): void {
    this.cars.delete(carId);
    const index = this.insertionOrder.indexOf(carId);
    if (index !== -1) {
      this.insertionOrder.splice(index, 1);
    }
  }

  public get(carId: CarId): CarEntity {
    const car = this.cars.get(carId);
    if (!car) {
      throw new Error(`Unknown CarId "${carId}".`);
    }
    return car;
  }

  public tryGet(carId: CarId): CarEntity | undefined {
    return this.cars.get(carId);
  }

  /** Stable insertion order — required for deterministic multi-car iteration. */
  public getAllStable(): readonly CarEntity[] {
    return this.insertionOrder.map((id) => this.get(id));
  }

  public clear(): void {
    this.cars.clear();
    this.insertionOrder.length = 0;
  }

  public get size(): number {
    return this.cars.size;
  }
}
