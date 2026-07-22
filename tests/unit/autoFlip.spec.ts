import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PhysicsFacade } from "@/physics/PhysicsFacade";
import { TEST_ARENA_DIMENSIONS } from "@/physics/arena/TestArenaPresets";
import * as V from "@/physics/Vec3Math";

/**
 * R3 (plan/RAMPS_AND_FEATURES_PLAN.md): a car stranded in a non-driveable
 * pose — upside down, on its side, or standing on its nose/tail — roughly
 * stationary (including still drifting, not just fully stopped) gets
 * righted automatically after ~0.75s — a deliberate deviation from real
 * Rocket League (no auto-flip there; players dodge out themselves),
 * documented in docs/physics-deviations.md. v2 widens WS7.B's original
 * "upside down and fully stopped" case to cover every non-driveable pose
 * while still never misfiring on legitimate ramp/wall driving.
 */
describe("Auto-flip when stranded in a non-driveable pose", () => {
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

  function quaternionFacing(fromLocalForward: THREE.Vector3, toWorldForward: THREE.Vector3) {
    const q = new THREE.Quaternion().setFromUnitVectors(fromLocalForward.normalize(), toWorldForward.normalize());
    return { x: q.x, y: q.y, z: q.z, w: q.w };
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

  it("rights a car on its side, drifting, within 1.5s, and preserves its horizontal drift", () => {
    const rotation = V.quatFromAxisAngle({ x: 0, y: 0, z: 1 }, Math.PI / 2);
    // Precondition: this pose really is "on its side" (up mostly horizontal).
    expect(Math.abs(V.applyQuaternion(V.UP, rotation).y)).toBeLessThan(0.2);

    physics.spawnCar({ id: "car-a", transform: { x: 0, y: 0.6, z: 0 } });
    physics.setCarState("car-a", {
      rotation,
      linearVelocity: { x: 3, y: 0, z: 1 },
      angularVelocity: { x: 0, y: 0, z: 0 }
    });

    let rightedTick = -1;
    let horizontalSpeedAtRighting = 0;
    for (let i = 0; i < 180; i += 1) {
      physics.stepTicks(1);
      if (rightedTick === -1 && upY("car-a") > 0.9) {
        rightedTick = i;
        const state = physics.getCarState("car-a");
        horizontalSpeedAtRighting = Math.hypot(state.linearVelocity.x, state.linearVelocity.z);
      }
    }

    expect(rightedTick).toBeGreaterThanOrEqual(0);
    expect(rightedTick).toBeLessThan(180); // within 1.5s
    // Checked at the instant of righting, not after — once grounded and
    // upright, tire friction legitimately bleeds off lateral drift over
    // subsequent ticks, which is expected car behaviour, not a bug.
    expect(horizontalSpeedAtRighting).toBeGreaterThanOrEqual(1); // drift preserved, not zeroed
  });

  it("rights a car standing on its nose within 1.5s", () => {
    const rotation = V.quatFromAxisAngle({ x: 1, y: 0, z: 0 }, -Math.PI / 2);
    physics.spawnCar({ id: "car-a", transform: { x: 0, y: 0.6, z: 0 } });
    physics.setCarState("car-a", {
      rotation,
      linearVelocity: { x: 0, y: 0, z: 0 },
      angularVelocity: { x: 0, y: 0, z: 0 }
    });

    let rightedTick = -1;
    for (let i = 0; i < 180; i += 1) {
      physics.stepTicks(1);
      if (rightedTick === -1 && upY("car-a") > 0.9) {
        rightedTick = i;
      }
    }

    expect(rightedTick).toBeGreaterThanOrEqual(0);
    expect(rightedTick).toBeLessThan(180);
  });

  it("rights a car standing on its tail within 1.5s", () => {
    const rotation = V.quatFromAxisAngle({ x: 1, y: 0, z: 0 }, Math.PI / 2);
    physics.spawnCar({ id: "car-a", transform: { x: 0, y: 0.6, z: 0 } });
    physics.setCarState("car-a", {
      rotation,
      linearVelocity: { x: 0, y: 0, z: 0 },
      angularVelocity: { x: 0, y: 0, z: 0 }
    });

    let rightedTick = -1;
    for (let i = 0; i < 180; i += 1) {
      physics.stepTicks(1);
      if (rightedTick === -1 && upY("car-a") > 0.9) {
        rightedTick = i;
      }
    }

    expect(rightedTick).toBeGreaterThanOrEqual(0);
    expect(rightedTick).toBeLessThan(180);
  });

  it("does not auto-flip a car that's upside down but still sliding fast (above the speed threshold)", () => {
    physics.spawnCar({ id: "car-a", transform: { x: 0, y: 5, z: 0 } });
    physics.setCarState("car-a", {
      rotation: { x: 0, y: 0, z: 1, w: 0 },
      linearVelocity: { x: 8, y: 0, z: 0 },
      angularVelocity: { x: 0, y: 0, z: 0 }
    });

    for (let i = 0; i < 200; i += 1) {
      // Keep re-asserting horizontal speed (above the 6.0 threshold) so
      // gravity's vertical pull doesn't confound the "still moving fast"
      // gate being tested.
      const state = physics.getCarState("car-a");
      physics.setCarState("car-a", { linearVelocity: { x: 8, y: state.linearVelocity.y, z: 0 } });
      physics.stepTicks(1);
    }

    expect(upY("car-a")).toBeLessThan(-0.5);
  });

  it("wall-driving regression: a car climbing a wall fillet is never teleport-righted", () => {
    // R3: the contact-based exemption (grounded && supportNormal.y > 0.05)
    // must never misfire on legitimate wall/ramp driving — this reuses
    // the same climb scenario as wallDriving.spec.ts's left-wall test.
    const { halfWidth } = TEST_ARENA_DIMENSIONS;
    physics.spawnCar({ id: "car-a", transform: { x: -halfWidth + 8, y: 0.4, z: 0 } });
    physics.setCarState("car-a", {
      rotation: quaternionFacing(new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0))
    });
    physics.stepTicks(10);
    physics.setCarInput("car-a", {
      throttle: 1,
      steer: 0,
      boost: true,
      powerslide: false,
      jump: false,
      pitch: 0,
      yaw: 0,
      roll: 0
    });

    let previousUpY = upY("car-a");
    for (let i = 0; i < 300; i += 1) {
      physics.stepTicks(1);
      const currentUpY = upY("car-a");
      // A teleport-righting snaps upY from well below 0.7 to above 0.99
      // in a single tick — a genuine physical roll-upright takes many
      // ticks and never produces that discontinuity.
      const suspiciousJump = previousUpY < 0.7 && currentUpY > 0.99;
      expect(suspiciousJump).toBe(false);
      previousUpY = currentUpY;
    }
  });

  it("ramp-coast regression: releasing input mid-climb never gets teleport-righted while still on the ramp", () => {
    // R3: closes the false-flip window an earlier (rejected) throttle-
    // gated design would have left — a car that coasts up a ramp and
    // releases input while still tilted must stay exempt via wheel
    // contact, not get flipped for lack of throttle.
    const { halfWidth } = TEST_ARENA_DIMENSIONS;
    physics.spawnCar({ id: "car-a", transform: { x: -halfWidth + 8, y: 0.4, z: 0 } });
    physics.setCarState("car-a", {
      rotation: quaternionFacing(new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0))
    });
    physics.stepTicks(10);
    physics.setCarInput("car-a", {
      throttle: 1,
      steer: 0,
      boost: true,
      powerslide: false,
      jump: false,
      pitch: 0,
      yaw: 0,
      roll: 0
    });

    // Climb until tilted (upY below 0.55), then release all input.
    let climbed = false;
    for (let i = 0; i < 200 && !climbed; i += 1) {
      physics.stepTicks(1);
      if (upY("car-a") < 0.55) {
        climbed = true;
      }
    }
    expect(climbed).toBe(true);
    physics.clearCarInput("car-a");

    let previousUpY = upY("car-a");
    for (let i = 0; i < 300; i += 1) {
      physics.stepTicks(1);
      const currentUpY = upY("car-a");
      const suspiciousJump = previousUpY < 0.7 && currentUpY > 0.99;
      expect(suspiciousJump).toBe(false);
      previousUpY = currentUpY;
    }
  });

  it("upright-brake regression: a decelerating upright car never gets the righting pop", () => {
    physics.spawnCar({ id: "car-a", transform: { x: 0, y: 0.4, z: 0 } });
    physics.stepTicks(10);
    physics.setCarState("car-a", { linearVelocity: { x: 5, y: 0, z: 0 } });
    physics.setCarInput("car-a", {
      throttle: 0,
      steer: 0,
      boost: false,
      powerslide: false,
      jump: false,
      pitch: 0,
      yaw: 0,
      roll: 0
    });

    for (let i = 0; i < 300; i += 1) {
      physics.stepTicks(1);
      expect(physics.getCarState("car-a").position.y).toBeLessThan(0.6);
    }
  });
});
