import * as THREE from "three";

import { CHASE_CAMERA_CONSTANTS as CAM } from "@/camera/CameraConstants";
import type { RenderFrameContext, RenderFrameModule } from "@/core/GameModule";
import type { MatchFlowController } from "@/game-flow/MatchFlowController";
import type { MatchState } from "@/game-flow/MatchFlowTypes";
import type { CameraInput } from "@/input/InputTypes";
import type { PhysicsFacade } from "@/physics/PhysicsFacade";
import type { CarId } from "@/physics/PhysicsTypes";

const MENU_MATCH_STATES: readonly MatchState[] = ["MAIN_MENU", "MATCH_SETUP", "SETTINGS"];

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Real chase camera (Master Brief Phase 8, game-flow spec section 21).
 * Owns the single `THREE.PerspectiveCamera` created by
 * `PlaceholderSceneRenderer` — it never creates a camera of its own,
 * preserving the "exactly one renderer/scene/camera" rule. Reads only
 * physics render snapshots (never steps or mutates physics) and the
 * match-flow state (menu vs. live-match framing); consumes `CameraInput`
 * edges forwarded once per fixed tick from `GameRuntime.onFixedTick`.
 */
export class ChaseCameraController implements RenderFrameModule {
  private ballCameraEnabled = false;
  private rearViewHeld = false;
  private swivelX = 0;
  private swivelY = 0;

  private readonly smoothedPosition = new THREE.Vector3();
  private readonly smoothedTarget = new THREE.Vector3();
  private initialised = false;

  private menuOrbitAngle = 0;

  public constructor(
    private readonly physics: PhysicsFacade,
    private readonly gameFlow: MatchFlowController,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly getAlpha: () => number,
    private readonly playerCarId: CarId
  ) {
    this.camera.fov = CAM.fov;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Called once per fixed tick (input spec section 4.4/28-30): applies
   * the ball-camera toggle edge and stores the held/analogue camera
   * inputs for the next render frame(s) to consume. Camera does not
   * itself track press/release edges — that is the input module's job.
   */
  public consumeCameraInput(input: CameraInput): void {
    if (input.toggleBallCameraPressed) {
      this.ballCameraEnabled = !this.ballCameraEnabled;
    }
    if (input.resetSwivelPressed) {
      this.swivelX = 0;
      this.swivelY = 0;
    } else {
      this.swivelX = input.swivelX;
      this.swivelY = input.swivelY;
    }
    this.rearViewHeld = input.rearViewHeld;
  }

  public updateRenderFrame(context: RenderFrameContext): void {
    if (MENU_MATCH_STATES.includes(this.gameFlow.getMatchState())) {
      this.updateMenuCamera(context);
      return;
    }
    this.updateChaseCamera(context);
  }

  private updateMenuCamera(context: RenderFrameContext): void {
    // game-flow spec section 21 "Menu camera": slow loop, car/ball/goal/
    // starfield visible, no dedicated cinematic path — a simple orbit
    // around the field satisfies this without needing scripted keyframes.
    this.menuOrbitAngle += CAM.menuOrbitAngularSpeed * context.frameDeltaSeconds;

    const x = Math.sin(this.menuOrbitAngle) * CAM.menuOrbitRadius;
    const z = Math.cos(this.menuOrbitAngle) * CAM.menuOrbitRadius;

    this.camera.position.set(x, CAM.menuOrbitHeight, z);
    this.camera.lookAt(0, 1.5, 0);
    this.initialised = false; // re-settle the chase camera instantly next match
  }

  private updateChaseCamera(context: RenderFrameContext): void {
    const snapshot = this.physics.getRenderSnapshot(this.getAlpha());
    const carTransform = snapshot.cars.get(this.playerCarId);
    if (!carTransform) {
      return;
    }

    const carPosition = new THREE.Vector3(
      carTransform.position.x,
      carTransform.position.y,
      carTransform.position.z
    );
    const carQuaternion = new THREE.Quaternion(
      carTransform.rotation.x,
      carTransform.rotation.y,
      carTransform.rotation.z,
      carTransform.rotation.w
    );
    const ballPosition = new THREE.Vector3(
      snapshot.ball.position.x,
      snapshot.ball.position.y,
      snapshot.ball.position.z
    );

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(carQuaternion);
    // Rear view (input spec section 29): looks backward along the car's
    // direction of travel instead of forward, without altering the
    // stored ball-camera toggle state.
    const chaseDirection = this.rearViewHeld ? forward.clone() : forward.clone().negate();
    const lookDirection = this.rearViewHeld ? forward.clone().negate() : forward.clone();

    // Camera swivel (input spec section 30): a temporary yaw/pitch offset
    // around the chase direction that eases back to the default framing
    // as the raw input returns to neutral, via the same smoothing used
    // for the rest of the rig -- no separate "return" logic needed.
    if (this.swivelX !== 0) {
      chaseDirection.applyAxisAngle(UP, this.swivelX);
    }
    if (this.swivelY !== 0) {
      const pitchAxis = new THREE.Vector3().crossVectors(chaseDirection, UP).normalize();
      chaseDirection.applyAxisAngle(pitchAxis, this.swivelY);
    }

    // Ball framing (exit criterion: "ball remains visible in normal
    // play") -- widen distance/height as the ball separates from the car
    // so both stay in frame without needing full frustum containment
    // math.
    const separation = carPosition.distanceTo(ballPosition);
    const framingBoost = THREE.MathUtils.clamp(separation / CAM.framingReferenceSeparation, 0, 1);
    const distance = CAM.distance + framingBoost * CAM.maxFramingDistanceBoost;
    const height = CAM.height + framingBoost * CAM.maxFramingHeightBoost;

    const desiredPosition = carPosition
      .clone()
      .addScaledVector(chaseDirection, distance)
      .addScaledVector(UP, height);

    const ballWeight = this.ballCameraEnabled
      ? CAM.ballWeightBallCamera
      : THREE.MathUtils.clamp(
          CAM.ballWeightNearField * (1 - separation / CAM.ballWeightReferenceDistance),
          0,
          CAM.ballWeightNearField
        );

    const carLookAtPoint = carPosition.clone().addScaledVector(lookDirection, -CAM.lookAhead);
    const desiredTarget = carLookAtPoint.clone().lerp(ballPosition, ballWeight);

    // Camera collision avoidance (spec: "Ray or sphere cast from target
    // to desired camera position; move inward if blocked").
    const toCamera = desiredPosition.clone().sub(desiredTarget);
    const desiredDistance = toCamera.length();
    if (desiredDistance > 0.001) {
      const direction = toCamera.clone().normalize();
      const hitDistance = this.physics.raycastArena(
        { x: desiredTarget.x, y: desiredTarget.y, z: desiredTarget.z },
        { x: direction.x, y: direction.y, z: direction.z },
        desiredDistance
      );
      if (hitDistance !== null) {
        const clamped = Math.max(0, hitDistance - CAM.collisionMargin);
        desiredPosition.copy(desiredTarget).addScaledVector(direction, clamped);
      }
    }

    if (!this.initialised) {
      this.smoothedPosition.copy(desiredPosition);
      this.smoothedTarget.copy(desiredTarget);
      this.initialised = true;
    } else {
      const positionAlpha = 1 - Math.exp(-CAM.positionSmoothingRate * context.frameDeltaSeconds);
      const targetAlpha = 1 - Math.exp(-CAM.targetSmoothingRate * context.frameDeltaSeconds);
      this.smoothedPosition.lerp(desiredPosition, positionAlpha);
      this.smoothedTarget.lerp(desiredTarget, targetAlpha);
    }

    this.camera.position.copy(this.smoothedPosition);
    this.camera.lookAt(this.smoothedTarget);
  }

  public isBallCameraEnabled(): boolean {
    return this.ballCameraEnabled;
  }

  public getDiagnostics(): CameraDiagnostics {
    return {
      position: { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z },
      target: { x: this.smoothedTarget.x, y: this.smoothedTarget.y, z: this.smoothedTarget.z },
      fov: this.camera.fov,
      ballCameraEnabled: this.ballCameraEnabled,
      rearViewHeld: this.rearViewHeld
    };
  }

  public dispose(): void {
    // The camera object itself is owned by PlaceholderSceneRenderer.
  }
}

export interface CameraDiagnostics {
  readonly position: { x: number; y: number; z: number };
  readonly target: { x: number; y: number; z: number };
  readonly fov: number;
  readonly ballCameraEnabled: boolean;
  readonly rearViewHeld: boolean;
}
