import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PhysicsFacade } from "@/physics/PhysicsFacade";
import * as V from "@/physics/Vec3Math";

/**
 * WS7.B (plan/POLISH_OVERHAUL_PLAN.md): a car stranded upside down,
 * airborne and roughly stationary gets righted automatically after
 * ~1 second — a deliberate deviation from real Rocket League (no auto-
 * flip there; players dodge out themselves), documented in
 * docs/physics-deviations.md.
 */
describe("Auto-flip when stranded upside down", () => {
  let physics: PhysicsFacade;

  beforeEach(async () => {
    physics = new PhysicsFacade();
    await physics.initialise();
  });

  afterEach(() => {
    physics.dispose();
  });

  function upY(carId: string): number {
    const car = physics.getCarState(carId);
    return V.applyQuaternion(V.UP, car.rotation).y;
  }

  it("rights a stationary upside-down car by ~1.25s and it's grounded by 300 ticks", () => {
    physics.spawnCar({ id: "car-a", transform: { x: 0, y: 0.6, z: 0 } });
    physics.setCarState("car-a", {
      // Roll pi about Z: up (0,1,0) -> (0,-1,0), fully upside down.
      rotation: { x: 0, y: 0, z: 1, w: 0 },
      linearVelocity: { x: 0, y: 0, z: 0 },
      angularVelocity: { x: 0, y: 0, z: 0 }
    });

    let sawUprightByHalfway = false;
    for (let i = 0; i < 300; i += 1) {
      physics.stepTicks(1);
      if (i === 150 && upY("car-a") > 0.9) {
        sawUprightByHalfway = true;
      }
    }

    expect(sawUprightByHalfway).toBe(true);
    expect(physics.getCarState("car-a").grounded).toBe(true);
  });

  it("does not auto-flip a car that's upside down but still sliding fast", () => {
    physics.spawnCar({ id: "car-a", transform: { x: 0, y: 5, z: 0 } });
    physics.setCarState("car-a", {
      rotation: { x: 0, y: 0, z: 1, w: 0 },
      linearVelocity: { x: 5, y: 0, z: 0 },
      angularVelocity: { x: 0, y: 0, z: 0 }
    });

    for (let i = 0; i < 200; i += 1) {
      // Keep re-asserting horizontal speed so gravity's vertical pull
      // (which would eventually ground the car and change the scenario)
      // doesn't confound the "still moving fast" gate being tested.
      const state = physics.getCarState("car-a");
      physics.setCarState("car-a", { linearVelocity: { x: 5, y: state.linearVelocity.y, z: 0 } });
      physics.stepTicks(1);
    }

    expect(upY("car-a")).toBeLessThan(-0.5);
  });
});
