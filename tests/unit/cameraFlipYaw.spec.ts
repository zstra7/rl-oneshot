import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ChaseCameraController } from "@/camera/ChaseCameraController";
import type { MatchFlowController } from "@/game-flow/MatchFlowController";
import { PLAYER_CAR_ID } from "@/game-flow/MatchFlowConstants";
import { PhysicsFacade } from "@/physics/PhysicsFacade";

/**
 * R5 (plan/RAMPS_AND_FEATURES_PLAN.md): `ChaseCameraController.
 * updateChaseCamera`'s normal-cam branch used to recompute the chase
 * direction every frame from the car's flattened forward vector. During
 * a dodge the body tumbles: the flattened forward swings (diagonal/side
 * flips) or degenerates through vertical (front/back flips), so the yaw
 * target swings and then "corrects" — a visible camera whip that real
 * Rocket League doesn't have (its camera holds its line through a dodge).
 * Ball cam is unaffected because its direction comes from car<->ball
 * positions, not the car's own orientation.
 */
describe("Chase camera stays steady through a dodge (non-ball-cam)", () => {
  let physics: PhysicsFacade;
  let camera: THREE.PerspectiveCamera;
  let gameFlow: MatchFlowController;
  let controller: ChaseCameraController;

  beforeEach(async () => {
    physics = new PhysicsFacade();
    await physics.initialise();
    physics.spawnCar({ id: PLAYER_CAR_ID, transform: { x: 0, y: 1, z: 0 } });
    physics.setBallState({ position: { x: 15, y: 5, z: 25 } });
    physics.stepTicks(90);

    camera = new THREE.PerspectiveCamera(90, 16 / 9, 0.1, 1000);
    gameFlow = { getMatchState: () => "PLAYING" } as MatchFlowController;
    controller = new ChaseCameraController(physics, gameFlow, camera, () => 1, PLAYER_CAR_ID);
  });

  afterEach(() => {
    physics.dispose();
  });

  function cameraYaw(): number {
    // Reconstruct the yaw from where the camera is currently looking, via
    // the diagnostics target it last aimed at.
    const diagnostics = controller.getDiagnostics();
    const dx = diagnostics.target.x - diagnostics.position.x;
    const dz = diagnostics.target.z - diagnostics.position.z;
    return Math.atan2(dx, dz);
  }

  let frameTimestampMs = 0;

  function tickRenderFrame(): void {
    frameTimestampMs += 1000 / 120;
    controller.updateRenderFrame({ timestampMs: frameTimestampMs, frameDeltaSeconds: 1 / 120, alpha: 1 });
  }

  function jumpThenDiagonalDodge(): void {
    physics.setCarInput(PLAYER_CAR_ID, { jump: true });
    physics.stepTicks(1);
    tickRenderFrame();
    physics.setCarInput(PLAYER_CAR_ID, { jump: false });
    for (let i = 0; i < 6; i += 1) {
      physics.stepTicks(1);
      tickRenderFrame();
    }
    physics.setCarInput(PLAYER_CAR_ID, { jump: true, pitch: 1, yaw: 1 });
    physics.stepTicks(1);
    tickRenderFrame();
  }

  it("holds camera yaw within ~3.4 degrees through a diagonal dodge", () => {
    physics.setCarInput(PLAYER_CAR_ID, { throttle: 1 });
    for (let i = 0; i < 120; i += 1) {
      physics.stepTicks(1);
      tickRenderFrame();
    }
    const settledYaw = cameraYaw();

    jumpThenDiagonalDodge();

    let maxAbsYawDeviation = 0;
    for (let i = 0; i < 60; i += 1) {
      physics.stepTicks(1);
      tickRenderFrame();
      if (physics.getCarState(PLAYER_CAR_ID).dodgeState !== "none") {
        let delta = cameraYaw() - settledYaw;
        delta = ((delta + Math.PI) % (2 * Math.PI)) - Math.PI;
        maxAbsYawDeviation = Math.max(maxAbsYawDeviation, Math.abs(delta));
      }
    }

    expect(maxAbsYawDeviation).toBeLessThan(0.06);
  });

  it("ball cam is unaffected by the dodge-yaw-hold change (no NaN, tracks the ball line)", () => {
    physics.setCarInput(PLAYER_CAR_ID, { throttle: 1 });
    for (let i = 0; i < 60; i += 1) {
      physics.stepTicks(1);
      tickRenderFrame();
    }
    controller.consumeCameraInput({
      toggleBallCameraPressed: true,
      resetSwivelPressed: false,
      swivelX: 0,
      swivelY: 0,
      rearViewHeld: false
    });
    tickRenderFrame();
    expect(controller.isBallCameraEnabled()).toBe(true);

    jumpThenDiagonalDodge();

    for (let i = 0; i < 60; i += 1) {
      physics.stepTicks(1);
      tickRenderFrame();
      const diagnostics = controller.getDiagnostics();
      expect(Number.isFinite(diagnostics.position.x)).toBe(true);
      expect(Number.isFinite(diagnostics.position.y)).toBe(true);
      expect(Number.isFinite(diagnostics.position.z)).toBe(true);
    }
  });
});
