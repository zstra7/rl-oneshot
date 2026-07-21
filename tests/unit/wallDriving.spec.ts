import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PhysicsFacade } from "@/physics/PhysicsFacade";
import { TEST_ARENA_DIMENSIONS } from "@/physics/arena/TestArenaPresets";

/**
 * WS5.C (plan/POLISH_OVERHAUL_PLAN.md): quarter-round floor→wall fillets
 * plus the wall-stick assist impulse in `CarController.prePhysicsTick`.
 * `SpawnCarOptions` doesn't carry a rotation yet (WS7 adds that) — these
 * tests set the car's orientation directly via `setCarState` after
 * spawning instead.
 */
describe("Wall driving (floor->wall fillets)", () => {
  let physics: PhysicsFacade;
  const { halfWidth } = TEST_ARENA_DIMENSIONS;

  beforeEach(async () => {
    physics = new PhysicsFacade();
    await physics.initialise();
  });

  afterEach(() => {
    physics.dispose();
  });

  function quaternionFacing(fromLocalForward: THREE.Vector3, toWorldForward: THREE.Vector3): { x: number; y: number; z: number; w: number } {
    const q = new THREE.Quaternion().setFromUnitVectors(fromLocalForward.normalize(), toWorldForward.normalize());
    return { x: q.x, y: q.y, z: q.z, w: q.w };
  }

  it("a car driving full throttle + boost at the left wall climbs the fillet smoothly", () => {
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

    const filletStartX = -(halfWidth - 2.0);
    let onFilletTicks = 0;
    let groundedOnFilletTicks = 0;
    let previousLinvel = physics.getCarState("car-a").linearVelocity;
    let maxLinvelDelta = 0;

    for (let i = 0; i < 360; i += 1) {
      physics.stepTicks(1);
      const state = physics.getCarState("car-a");

      const delta = Math.hypot(
        state.linearVelocity.x - previousLinvel.x,
        state.linearVelocity.y - previousLinvel.y,
        state.linearVelocity.z - previousLinvel.z
      );
      maxLinvelDelta = Math.max(maxLinvelDelta, delta);
      previousLinvel = state.linearVelocity;

      if (state.position.x < filletStartX) {
        onFilletTicks += 1;
        if (state.grounded) {
          groundedOnFilletTicks += 1;
        }
      }
    }

    const finalState = physics.getCarState("car-a");
    expect(finalState.position.x).toBeLessThan(-(halfWidth - 1.5));
    expect(finalState.position.y).toBeGreaterThan(2);
    expect(onFilletTicks).toBeGreaterThan(0);
    expect(groundedOnFilletTicks / onFilletTicks).toBeGreaterThanOrEqual(0.7);
    expect(maxLinvelDelta).toBeLessThanOrEqual(12);
  });

  it("a car already on the left wall holds its position and drives along it", () => {
    physics.spawnCar({ id: "car-a", transform: { x: -halfWidth + 0.4, y: 5, z: 0 } });
    physics.setCarState("car-a", {
      rotation: { x: 0, y: 0, z: Math.sin(-Math.PI / 4), w: Math.cos(-Math.PI / 4) }
    });
    physics.stepTicks(10);
    physics.setCarInput("car-a", {
      throttle: 1,
      steer: 0,
      boost: false,
      powerslide: false,
      jump: false,
      pitch: 0,
      yaw: 0,
      roll: 0
    });

    const startZ = physics.getCarState("car-a").position.z;
    physics.stepTicks(240);
    const finalState = physics.getCarState("car-a");

    expect(Math.abs(finalState.position.x - (-halfWidth + 0.4))).toBeLessThan(1.0);
    expect(Math.abs(finalState.position.z - startZ)).toBeGreaterThan(6);
  });

  it("wall-stick assist doesn't apply without throttle: no runaway force pinning an idle car", () => {
    // The wall-stick assist in `CarController.prePhysicsTick` is gated
    // on active throttle input specifically so it can't act as a
    // permanent magnet — with throttle 0 it never fires at all, leaving
    // whatever the ordinary grip model does. The ordinary grip model
    // here (WS2's tuned, effectively-absolute-within-its-cap lateral
    // grip) still holds a stationary car against gravity's fairly small
    // wall-parallel component, so this doesn't detach the car by itself
    // — see docs/physics-deviations.md's WS5 section. What this test
    // pins down is that idling on the wall stays numerically stable
    // (finite, no runaway acceleration into the surface).
    physics.spawnCar({ id: "car-a", transform: { x: -halfWidth + 0.4, y: 5, z: 0 } });
    physics.setCarState("car-a", {
      rotation: { x: 0, y: 0, z: Math.sin(-Math.PI / 4), w: Math.cos(-Math.PI / 4) }
    });
    physics.stepTicks(10);
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

    physics.stepTicks(240);
    const finalState = physics.getCarState("car-a");
    expect(Number.isFinite(finalState.position.x)).toBe(true);
    expect(Number.isFinite(finalState.position.y)).toBe(true);
    expect(Number.isFinite(finalState.position.z)).toBe(true);
    expect(finalState.speed).toBeLessThan(5);
  });
});
