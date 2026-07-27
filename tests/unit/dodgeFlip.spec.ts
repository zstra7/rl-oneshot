import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PhysicsFacade } from "@/physics/PhysicsFacade";
import * as V from "@/physics/Vec3Math";

/** WS3 (plan/POLISH_OVERHAUL_PLAN.md): kinematic dodge/flip rewrite. */
describe("Dodge / flip", () => {
  let physics: PhysicsFacade;

  beforeEach(async () => {
    physics = new PhysicsFacade();
    await physics.initialise();
    physics.spawnCar({ id: "car-a", transform: { x: 0, y: 1, z: 0 } });
    // WS5.B: the ball now spawns resting at the arena centre (kickoff-
    // accurate) instead of falling from 8m — park it away so it doesn't
    // instantly overlap a car spawned at the origin.
    physics.setBallState({ position: { x: 15, y: 5, z: 25 } });
    physics.stepTicks(90);
  });

  afterEach(() => {
    physics.dispose();
  });

  function carUp(): V.Vec3Like {
    return V.applyQuaternion({ x: 0, y: 1, z: 0 }, physics.getCarState("car-a").rotation);
  }

  function carFlatForward(): V.Vec3Like {
    const forward = V.applyQuaternion({ x: 0, y: 0, z: -1 }, physics.getCarState("car-a").rotation);
    return V.normalize({ x: forward.x, y: 0, z: forward.z });
  }

  function jumpThenDodge(pitch: number, yaw: number): void {
    // First jump.
    physics.setCarInput("car-a", { jump: true });
    physics.stepTicks(1);
    physics.setCarInput("car-a", { jump: false });
    physics.stepTicks(6);
    // Second jump with directional input triggers the dodge.
    physics.setCarInput("car-a", { jump: true, pitch, yaw });
    physics.stepTicks(1);
  }

  it("a forward flip completes a near-full rotation and lands the car on its wheels", () => {
    physics.setCarInput("car-a", { throttle: 1 });
    physics.stepTicks(120);

    const axisAtStart = { x: -1, y: 0, z: 0 }; // expected flip axis for a pure forward dodge
    let cumulativeRotationRadians = 0;

    // W in the air => pitchNoseDown => pitch=+1 (forward flip trigger).
    physics.setCarInput("car-a", { throttle: 1, jump: true });
    physics.stepTicks(1);
    physics.setCarInput("car-a", { throttle: 1, jump: false });
    physics.stepTicks(6);
    physics.setCarInput("car-a", { throttle: 1, jump: true, pitch: 1 });

    for (let i = 0; i < 90; i += 1) {
      physics.stepTicks(1);
      const angvel = physics.getCarState("car-a").angularVelocity;
      cumulativeRotationRadians += V.dot(angvel, axisAtStart) * (1 / 120);
      if (i === 5) {
        physics.setCarInput("car-a", { throttle: 1, jump: false, pitch: 0 });
      }
    }

    expect((cumulativeRotationRadians * 180) / Math.PI).toBeGreaterThan(300);

    physics.stepTicks(180); // let it land and settle
    const finalState = physics.getCarState("car-a");
    expect(carUp().y).toBeGreaterThan(0.9);
    expect(finalState.grounded).toBe(true);
  });

  it("G7.a: after a full forward dodge + recovery, spin has settled to near zero and the car landed close to wheels-down", () => {
    physics.setCarInput("car-a", { throttle: 1 });
    physics.stepTicks(120);

    physics.setCarInput("car-a", { throttle: 1, jump: true });
    physics.stepTicks(1);
    physics.setCarInput("car-a", { throttle: 1, jump: false });
    physics.stepTicks(6);
    physics.setCarInput("car-a", { throttle: 1, jump: true, pitch: 1 });
    physics.stepTicks(1);
    physics.setCarInput("car-a", { throttle: 1, jump: false, pitch: 0 });

    // Run through the full active phase (78 ticks at activeDuration=0.65s)
    // plus the eased recovery damp (well past RECOVERY_DAMP_TICKS) without
    // letting the car touch the ground yet, so this isolates the flip's
    // own settling from any suspension/ground-contact damping.
    physics.stepTicks(90);

    const angvel = physics.getCarState("car-a").angularVelocity;
    const pitchRollMagnitude = Math.hypot(angvel.x, angvel.z);
    expect(pitchRollMagnitude).toBeLessThan(0.1);

    physics.stepTicks(180); // let it land and settle
    expect(carUp().y).toBeGreaterThan(0.9);
    expect(physics.getCarState("car-a").grounded).toBe(true);
  });

  it("a forward flip accelerates the car", () => {
    physics.setCarInput("car-a", { throttle: 1 });
    physics.stepTicks(120);
    // Capture the pre-dodge forward direction once and reuse it as a fixed
    // reference axis — the car's *current* forward vector is meaningless
    // mid-flip (it's actively tumbling), so re-deriving "forward speed"
    // from the live rotation after the dodge would measure the wrong
    // thing entirely.
    const referenceForward = carFlatForward();
    const preForward = V.dot(physics.getCarState("car-a").linearVelocity, referenceForward);

    jumpThenDodge(1, 0);

    physics.stepTicks(30);
    const postForward = V.dot(physics.getCarState("car-a").linearVelocity, referenceForward);
    const planarSpeed = Math.sqrt(
      physics.getCarState("car-a").linearVelocity.x ** 2 + physics.getCarState("car-a").linearVelocity.z ** 2
    );

    expect(postForward).toBeGreaterThan(preForward + 3);
    expect(planarSpeed).toBeLessThanOrEqual(23.05);
  });

  it("cancels upward velocity when dodging at the apex of a jump", () => {
    physics.setCarInput("car-a", { jump: true });
    physics.stepTicks(1);
    physics.setCarInput("car-a", { jump: false });
    physics.stepTicks(15); // rising
    expect(physics.getCarState("car-a").linearVelocity.y).toBeGreaterThan(0.5);

    physics.setCarInput("car-a", { jump: true, pitch: 1 });
    physics.stepTicks(1);

    expect(physics.getCarState("car-a").linearVelocity.y).toBeLessThanOrEqual(0.2);
  });

  it("flip-cancel (holding opposite pitch) stops the flip early and still lands upright", () => {
    physics.setCarInput("car-a", { throttle: 1 });
    physics.stepTicks(120);

    let cumulativeRotationRadians = 0;
    const axis = { x: -1, y: 0, z: 0 };

    physics.setCarInput("car-a", { throttle: 1, jump: true });
    physics.stepTicks(1);
    physics.setCarInput("car-a", { throttle: 1, jump: false });
    physics.stepTicks(6);
    physics.setCarInput("car-a", { throttle: 1, jump: true, pitch: 1 });
    physics.stepTicks(1);
    physics.setCarInput("car-a", { throttle: 1, jump: false, pitch: 1 });

    for (let i = 0; i < 5; i += 1) {
      physics.stepTicks(1);
      cumulativeRotationRadians += V.dot(physics.getCarState("car-a").angularVelocity, axis) * (1 / 120);
    }

    // Now hold the opposite pitch (nose-up) to cancel the flip.
    physics.setCarInput("car-a", { throttle: 1, pitch: -1 });
    for (let i = 0; i < 40; i += 1) {
      physics.stepTicks(1);
      cumulativeRotationRadians += V.dot(physics.getCarState("car-a").angularVelocity, axis) * (1 / 120);
    }

    expect((cumulativeRotationRadians * 180) / Math.PI).toBeLessThan(220);

    physics.setCarInput("car-a", { throttle: 0 });
    physics.stepTicks(200);
    expect(carUp().y).toBeGreaterThan(0.85);
  });

  it("a sideways dodge rolls the car about its forward axis and gains lateral speed toward its right", () => {
    physics.setCarInput("car-a", { throttle: 1 });
    physics.stepTicks(60);

    let cumulativeRotationRadians = 0;

    jumpThenDodge(0, 1);

    for (let i = 0; i < 90; i += 1) {
      physics.stepTicks(1);
      cumulativeRotationRadians += Math.abs(
        V.dot(physics.getCarState("car-a").angularVelocity, { x: 0, y: 0, z: -1 })
      ) * (1 / 120);
    }

    expect((cumulativeRotationRadians * 180) / Math.PI).toBeGreaterThan(300);

    const finalState = physics.getCarState("car-a");
    const lateralSpeed = V.dot(finalState.linearVelocity, { x: 1, y: 0, z: 0 });
    expect(lateralSpeed).toBeGreaterThan(3.5);
  });

  it("a backward dodge (nose-up input) imparts velocity opposite the car's forward direction", () => {
    physics.setCarInput("car-a", { throttle: 1 });
    physics.stepTicks(120);
    const preVelocity = physics.getCarState("car-a").linearVelocity;
    const forward = carFlatForward();

    jumpThenDodge(-1, 0);
    physics.stepTicks(10);

    const postVelocity = physics.getCarState("car-a").linearVelocity;
    const deltaVelocity = V.sub(postVelocity, preVelocity);
    expect(V.dot(deltaVelocity, forward)).toBeLessThan(0);
  });
});
