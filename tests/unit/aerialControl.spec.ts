import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PhysicsFacade } from "@/physics/PhysicsFacade";
import * as V from "@/physics/Vec3Math";

/**
 * F5 (plan/ARENA_FLUSH_AND_REFINEMENTS_PLAN.md): aerial rotation rewrite.
 * `applyAerialRotation` previously computed a desired angular
 * *acceleration* and applied it via `applyTorqueImpulse(accel * dt)` —
 * Rapier divides a torque impulse by the body's moment of inertia (large
 * for a 180kg car box), so the achieved angular velocity change was ~23x
 * weaker than the RL-accurate constants in PhysicsConstants.ts intended.
 * On top of that, the sign convention was backwards relative to
 * DodgeController (pitch=+1, i.e. W in the air, pitched the nose UP
 * instead of DOWN). This spec pins down both the direction and the
 * magnitude of the fixed, velocity-space-integrated behaviour.
 */
describe("Aerial rotation control (F5)", () => {
  let physics: PhysicsFacade;

  beforeEach(async () => {
    physics = new PhysicsFacade();
    await physics.initialise();
  });

  afterEach(() => {
    physics.dispose();
  });

  function neutralAerialInput(overrides: Partial<Record<"pitch" | "yaw" | "roll", number>> = {}) {
    return {
      throttle: 0,
      steer: 0,
      pitch: overrides.pitch ?? 0,
      yaw: overrides.yaw ?? 0,
      roll: overrides.roll ?? 0,
      jump: false,
      boost: false,
      powerslide: false
    };
  }

  describe("direction, all three axes", () => {
    it("pitch=+1 tilts the nose DOWN (Rocket League convention, matches DodgeController)", () => {
      physics.spawnCar({ id: "car-a", transform: { x: 0, y: 10, z: 0 } });
      physics.setCarInput("car-a", neutralAerialInput({ pitch: 1 }));
      physics.stepTicks(30);

      const rotation = physics.getCarState("car-a").rotation;
      const forward = V.applyQuaternion(V.LOCAL_FORWARD, rotation);
      expect(forward.y).toBeLessThan(-0.1);
    });

    it("pitch=-1 tilts the nose UP", () => {
      physics.spawnCar({ id: "car-a", transform: { x: 0, y: 10, z: 0 } });
      physics.setCarInput("car-a", neutralAerialInput({ pitch: -1 }));
      physics.stepTicks(30);

      const rotation = physics.getCarState("car-a").rotation;
      const forward = V.applyQuaternion(V.LOCAL_FORWARD, rotation);
      expect(forward.y).toBeGreaterThan(0.1);
    });

    it("yaw=+1 swings the nose toward the car's initial RIGHT", () => {
      physics.spawnCar({ id: "car-a", transform: { x: 0, y: 10, z: 0 } });
      const rotation0 = physics.getCarState("car-a").rotation;
      const right0 = V.applyQuaternion(V.LOCAL_RIGHT, rotation0);

      physics.setCarInput("car-a", neutralAerialInput({ yaw: 1 }));
      physics.stepTicks(30);

      const rotation = physics.getCarState("car-a").rotation;
      const forward = V.applyQuaternion(V.LOCAL_FORWARD, rotation);
      expect(V.dot(forward, right0)).toBeGreaterThan(0.1);
    });

    it("roll=+1 leans the top of the car toward its initial RIGHT", () => {
      physics.spawnCar({ id: "car-a", transform: { x: 0, y: 10, z: 0 } });
      const rotation0 = physics.getCarState("car-a").rotation;
      const right0 = V.applyQuaternion(V.LOCAL_RIGHT, rotation0);

      physics.setCarInput("car-a", neutralAerialInput({ roll: 1 }));
      physics.stepTicks(30);

      const rotation = physics.getCarState("car-a").rotation;
      const up = V.applyQuaternion(V.UP, rotation);
      expect(V.dot(up, right0)).toBeGreaterThan(0.1);
    });
  });

  it("responsiveness: pitch=1 from rest reaches >=4.5 rad/s local pitch rate and forward.y < -0.7 within 60 ticks (0.5s)", () => {
    // On the pre-fix (torque-impulse) code this measured ~0.5 rad/s at
    // 0.5s (matching the plan's probe: 0.537 rad/s after a full second),
    // roughly 9x too slow to clear this bar -- this is the "~23x too
    // weak" regression gate.
    physics.spawnCar({ id: "car-a", transform: { x: 0, y: 10, z: 0 } });
    physics.setCarInput("car-a", neutralAerialInput({ pitch: 1 }));
    physics.stepTicks(60);

    const state = physics.getCarState("car-a");
    const inverseRotation = {
      x: -state.rotation.x,
      y: -state.rotation.y,
      z: -state.rotation.z,
      w: state.rotation.w
    };
    const localAngularVelocity = V.applyQuaternion(state.angularVelocity, inverseRotation);
    // Sign-corrected: pitch=+1 (nose down) is negative local-X rate.
    expect(-localAngularVelocity.x).toBeGreaterThanOrEqual(4.5);

    const forward = V.applyQuaternion(V.LOCAL_FORWARD, state.rotation);
    expect(forward.y).toBeLessThan(-0.7);
  });

  it("decay: releasing pitch input lets the local pitch rate settle back below 0.5 rad/s", () => {
    physics.spawnCar({ id: "car-a", transform: { x: 0, y: 10, z: 0 } });
    physics.setCarInput("car-a", neutralAerialInput({ pitch: 1 }));
    physics.stepTicks(30);

    physics.setCarInput("car-a", neutralAerialInput({ pitch: 0 }));
    physics.stepTicks(120);

    const state = physics.getCarState("car-a");
    const inverseRotation = {
      x: -state.rotation.x,
      y: -state.rotation.y,
      z: -state.rotation.z,
      w: state.rotation.w
    };
    const localAngularVelocity = V.applyQuaternion(state.angularVelocity, inverseRotation);
    expect(Math.abs(localAngularVelocity.x)).toBeLessThan(0.5);
  });

  it("consistency with dodge: aerial pitch-down and a forward dodge's flip axis agree in sign", () => {
    // Aerial: pitch=+1 for 10 ticks from rest, airborne.
    physics.spawnCar({ id: "car-aerial", transform: { x: -20, y: 10, z: 0 } });
    physics.setCarInput("car-aerial", neutralAerialInput({ pitch: 1 }));
    physics.stepTicks(10);
    const aerialAngvel = physics.getCarState("car-aerial").angularVelocity;

    // Dodge: reuse dodgeFlip.spec.ts's jump-then-dodge pattern. During the
    // dodge's active phase, angvel = dodgeAxis * effectiveRate (a positive
    // rate), so its direction IS the dodgeAxis direction -- reading it
    // straight off getCarState avoids needing a test-only accessor for
    // CarRuntimeState.dodgeAxis, which isn't otherwise serialised.
    physics.spawnCar({ id: "car-dodge", transform: { x: 20, y: 1, z: 0 } });
    physics.stepTicks(60); // let it settle onto the ground
    physics.setCarInput("car-dodge", { jump: true });
    physics.stepTicks(1);
    physics.setCarInput("car-dodge", { jump: false });
    physics.stepTicks(6);
    physics.setCarInput("car-dodge", { jump: true, pitch: 1 });
    physics.stepTicks(1);
    const dodgeAngvel = physics.getCarState("car-dodge").angularVelocity;

    expect(V.dot(V.normalize(aerialAngvel), V.normalize(dodgeAngvel))).toBeGreaterThan(0);
  });
});
