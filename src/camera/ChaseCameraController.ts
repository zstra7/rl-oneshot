import * as THREE from "three";

import { SeededRandom } from "@/assets/procedural/SeededRandom";
import { CHASE_CAMERA_CONSTANTS as CAM } from "@/camera/CameraConstants";
import { clampCameraSettings, DEFAULT_CAMERA_SETTINGS, type CameraSettings } from "@/camera/CameraSettings";
import type { RenderFrameContext, RenderFrameModule } from "@/core/GameModule";
import type { MatchFlowController } from "@/game-flow/MatchFlowController";
import type { MatchState } from "@/game-flow/MatchFlowTypes";
import type { CameraInput } from "@/input/InputTypes";
import type { PhysicsFacade } from "@/physics/PhysicsFacade";
import type { CarId } from "@/physics/PhysicsTypes";
import * as V from "@/physics/Vec3Math";

const MENU_MATCH_STATES: readonly MatchState[] = [
  "MAIN_MENU",
  "MATCH_SETUP",
  "SETTINGS",
  "CREDITS",
  // R13: plain orbit camera is fine for the tournament screens — no
  // dedicated framing needed, unlike CAR_CUSTOMISE below.
  "TOURNAMENT_BRACKET",
  "TOURNAMENT_VICTORY"
];

/** R12.3: same "far-back" kickoff pose GameRuntime spawns the menu-presentation player car at (GameRuntime.initialise). */
const CUSTOMISE_CAR_SPAWN_POSITION = { x: 0, y: 0.35, z: -24 };
const CUSTOMISE_ORBIT_RADIUS = 4.6;
const CUSTOMISE_ORBIT_HEIGHT = 1.5;
const CUSTOMISE_ORBIT_ANGULAR_SPEED = 0.25;

const UP = new THREE.Vector3(0, 1, 0);
const SHAKE_RANDOM_SEED = 0x43414d31; // "CAM1"

/**
 * Real chase camera (Master Brief Phase 8, game-flow spec section 21;
 * rewritten to a Rocket-League-accurate rig in WS4 —
 * plan/POLISH_OVERHAUL_PLAN.md). Owns the single `THREE.PerspectiveCamera`
 * created by `PlaceholderSceneRenderer` — it never creates a camera of
 * its own, preserving the "exactly one renderer/scene/camera" rule. Reads
 * only physics render snapshots (never steps or mutates physics) and the
 * match-flow state (menu vs. live-match framing); consumes `CameraInput`
 * edges forwarded once per fixed tick from `GameRuntime.onFixedTick`.
 *
 * Camera/car/ball framing model (WS4): the camera stays close (RL's own
 * distance/height defaults) and directly behind the car (normal cam) or
 * directly behind the car *relative to the ball* (ball cam, keeping
 * camera/car/ball roughly collinear) — this alone keeps the car pinned in
 * the bottom-centre of the frame in both modes without any screen-space
 * math, matching real Rocket League framing.
 */
export class ChaseCameraController implements RenderFrameModule {
  private ballCameraEnabled = false;
  private rearViewHeld = false;
  private swivelX = 0;
  private swivelY = 0;

  private readonly smoothedPosition = new THREE.Vector3();
  private readonly smoothedTarget = new THREE.Vector3();
  private smoothedYaw = Math.PI; // facing -Z (camera behind a car facing -Z sits at +Z, yaw 0 by convention below)
  private initialised = false;

  private menuOrbitAngle = 0;
  private customiseOrbitAngle = 0;

  private settings: CameraSettings = DEFAULT_CAMERA_SETTINGS;
  private smoothedFov: number = CAM.fov;

  private previousBallVelocity: V.Vec3Like = { x: 0, y: 0, z: 0 };
  private shakeEnergy = 0;
  private readonly shakeRandom = new SeededRandom(SHAKE_RANDOM_SEED);
  private dodgeYawHold: number | null = null;

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

  /**
   * WS4.B: live settings from the settings panel/persisted store. Applies
   * FOV immediately (not just via the per-frame smoothing in
   * `updateFov()`) so it takes effect even while the menu camera is
   * active, which never calls `updateFov()`.
   */
  public applyCameraSettings(settings: Partial<CameraSettings>): void {
    this.settings = clampCameraSettings(settings, this.settings);
    this.smoothedFov = this.settings.fov;
    this.camera.fov = this.settings.fov;
    this.camera.updateProjectionMatrix();
  }

  public getCameraSettings(): CameraSettings {
    return this.settings;
  }

  public updateRenderFrame(context: RenderFrameContext): void {
    const state = this.gameFlow.getMatchState();
    if (state === "CAR_CUSTOMISE") {
      this.updateCustomiseCamera(context);
      return;
    }
    if (MENU_MATCH_STATES.includes(state)) {
      this.updateMenuCamera(context);
      return;
    }
    this.updateChaseCamera(context);
  }

  /**
   * R12.3: dedicated Customise Car framing — a slow orbit around the live
   * player car (not the generic menu-orbit-around-field-centre used by
   * `updateMenuCamera`), so the car being customised fills the frame. The
   * car itself stays stationary (menu physics idles; no inputs are live in
   * this state) — only the camera moves.
   */
  private updateCustomiseCamera(context: RenderFrameContext): void {
    const snapshot = this.physics.getRenderSnapshot(this.getAlpha());
    const carTransform = snapshot.cars.get(this.playerCarId);
    const carPosition = carTransform
      ? new THREE.Vector3(carTransform.position.x, carTransform.position.y, carTransform.position.z)
      : new THREE.Vector3(
          CUSTOMISE_CAR_SPAWN_POSITION.x,
          CUSTOMISE_CAR_SPAWN_POSITION.y,
          CUSTOMISE_CAR_SPAWN_POSITION.z
        );

    this.customiseOrbitAngle += CUSTOMISE_ORBIT_ANGULAR_SPEED * context.frameDeltaSeconds;

    const x = carPosition.x + Math.sin(this.customiseOrbitAngle) * CUSTOMISE_ORBIT_RADIUS;
    const z = carPosition.z + Math.cos(this.customiseOrbitAngle) * CUSTOMISE_ORBIT_RADIUS;

    this.camera.position.set(x, carPosition.y + CUSTOMISE_ORBIT_HEIGHT, z);
    this.camera.lookAt(carPosition.x, carPosition.y + 0.6, carPosition.z);
    this.initialised = false; // re-settle the chase camera instantly next match
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
    const playerCar = this.physics.getCarState(this.playerCarId);

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

    // Chase yaw direction: the unit vector (horizontal only) pointing
    // from the car toward where the camera should sit.
    let chaseDirection: THREE.Vector3;
    if (this.ballCameraEnabled) {
      // Ball cam: behind the car relative to the ball, keeping
      // camera/car/ball roughly collinear.
      chaseDirection = carPosition.clone().sub(ballPosition);
      chaseDirection.y = 0;
    } else {
      const dodging = playerCar.dodgeState !== "none";
      if (dodging) {
        // R5: hold the yaw the camera had when the dodge started — a
        // tumbling body's flattened forward vector swings wildly
        // (diagonal/side flips) or degenerates through vertical
        // (front/back flips), which otherwise whips the chase direction
        // around mid-flip. Real Rocket League's camera holds its line
        // through a dodge instead of tracking the tumble.
        if (this.dodgeYawHold === null) {
          this.dodgeYawHold = this.smoothedYaw;
        }
        chaseDirection = new THREE.Vector3(Math.sin(this.dodgeYawHold), 0, Math.cos(this.dodgeYawHold));
      } else {
        this.dodgeYawHold = null;
        // Normal cam: directly behind the car's own facing. Velocity is
        // deliberately not used here — it flips 180° on reversing, which
        // real Rocket League's camera does not do; the yaw smoothing below
        // supplies the "camera swings out in turns" lag instead.
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(carQuaternion);
        chaseDirection = forward.clone().negate();
        chaseDirection.y = 0;
      }
    }

    if (chaseDirection.lengthSq() < 0.01) {
      // Car pointing straight up/down (e.g. mid-flip against a wall) —
      // keep whatever direction was last smoothed rather than snapping to
      // an undefined heading.
      chaseDirection = new THREE.Vector3(Math.sin(this.smoothedYaw), 0, Math.cos(this.smoothedYaw));
    } else {
      chaseDirection.normalize();
    }

    if (this.rearViewHeld) {
      chaseDirection.negate();
    }

    const targetYaw = Math.atan2(chaseDirection.x, chaseDirection.z);
    const yawRate = CAM.yawSmoothingRate * this.settings.stiffness;
    if (!this.initialised) {
      this.smoothedYaw = targetYaw;
    } else {
      const yawAlpha = 1 - Math.exp(-yawRate * context.frameDeltaSeconds);
      this.smoothedYaw = lerpAngle(this.smoothedYaw, targetYaw, yawAlpha);
    }

    const smoothedDir = new THREE.Vector3(Math.sin(this.smoothedYaw), 0, Math.cos(this.smoothedYaw));

    // Swivel (input spec section 30): a temporary yaw/pitch offset around
    // the smoothed chase direction.
    if (this.swivelX !== 0) {
      smoothedDir.applyAxisAngle(UP, this.swivelX);
    }
    const distance = CAM.distance * this.settings.distance;
    const height = CAM.height * this.settings.height;

    const desiredPosition = carPosition
      .clone()
      .addScaledVector(smoothedDir, distance)
      .addScaledVector(UP, height);
    if (this.swivelY !== 0) {
      const pitchAxis = new THREE.Vector3().crossVectors(smoothedDir, UP).normalize();
      desiredPosition.sub(carPosition).applyAxisAngle(pitchAxis, this.swivelY).add(carPosition);
    }
    if (desiredPosition.y < CAM.minHeightAboveFloor) {
      desiredPosition.y = CAM.minHeightAboveFloor;
    }

    // Aim target: a point ahead of the camera (normal cam) or biased
    // toward the ball (ball cam) — this is what pins the car bottom-
    // centre while keeping the ball framed in ball cam.
    let desiredTarget: THREE.Vector3;
    if (this.ballCameraEnabled) {
      const ballLookBias = 0.3 * (1 - this.settings.ballLookStrength);
      desiredTarget = ballPosition.clone().lerp(carPosition, ballLookBias);
    } else {
      const aheadDirection = smoothedDir.clone().negate();
      desiredTarget = carPosition
        .clone()
        .addScaledVector(aheadDirection, CAM.aimAheadDistance)
        .addScaledVector(UP, CAM.aimHeightOffset);

      // Downward pitch bias so the horizon stays visible with the car's
      // roof in frame.
      const cameraToTarget = desiredTarget.clone().sub(desiredPosition);
      const rightAxis = new THREE.Vector3().crossVectors(smoothedDir, UP).normalize();
      cameraToTarget.applyAxisAngle(rightAxis, THREE.MathUtils.degToRad(CAM.angleDegrees));
      desiredTarget = desiredPosition.clone().add(cameraToTarget);
    }

    const positionRate = CAM.positionSmoothingRate * this.settings.stiffness;
    if (!this.initialised) {
      this.smoothedPosition.copy(desiredPosition);
      this.smoothedTarget.copy(desiredTarget);
      this.initialised = true;
    } else {
      const positionAlpha = 1 - Math.exp(-positionRate * context.frameDeltaSeconds);
      const targetAlpha = 1 - Math.exp(-CAM.targetSmoothingRate * context.frameDeltaSeconds);
      this.smoothedPosition.lerp(desiredPosition, positionAlpha);
      this.smoothedTarget.lerp(desiredTarget, targetAlpha);
    }

    this.updateShake(context, carPosition);
    const shakenPosition = this.smoothedPosition.clone();
    if (this.shakeEnergy > 0.001) {
      shakenPosition.addScaledVector(this.nextShakeOffset(), CAM.shakeMaxOffset * this.shakeEnergy);
    }

    this.camera.position.copy(shakenPosition);
    this.camera.lookAt(this.smoothedTarget);

    this.updateFov(context, playerCar);
  }

  private updateFov(context: RenderFrameContext, playerCar: ReturnType<PhysicsFacade["getCarState"]>): void {
    const targetFov = this.settings.fov + (playerCar.supersonic ? CAM.supersonicFovKick : 0);
    const alpha = 1 - Math.exp(-CAM.supersonicFovSmoothingRate * context.frameDeltaSeconds);
    const nextFov = this.smoothedFov + (targetFov - this.smoothedFov) * alpha;

    if (Math.abs(nextFov - this.camera.fov) > 0.01) {
      this.smoothedFov = nextFov;
      this.camera.fov = nextFov;
      this.camera.updateProjectionMatrix();
    } else {
      this.smoothedFov = nextFov;
    }
  }

  /** WS4.D: impact camera shake, gated by the gameplay settings toggle. */
  private updateShake(context: RenderFrameContext, carPosition: THREE.Vector3): void {
    const ball = this.physics.getBallState();
    const delta = V.length(V.sub(ball.linearVelocity, this.previousBallVelocity));
    this.previousBallVelocity = ball.linearVelocity;

    this.shakeEnergy *= Math.exp(-CAM.shakeDecayRate * context.frameDeltaSeconds);

    if (!this.settings.shakeEnabled) {
      this.shakeEnergy = 0;
      return;
    }

    if (delta > CAM.shakeVelocityDeltaThreshold) {
      const ballDistance = carPosition.distanceTo(
        new THREE.Vector3(ball.position.x, ball.position.y, ball.position.z)
      );
      if (ballDistance <= CAM.shakeRadius) {
        const energy = THREE.MathUtils.clamp(delta / CAM.shakeMaxDeltaForFullEnergy, 0, 1) * this.settings.shakeIntensity;
        this.shakeEnergy = Math.max(this.shakeEnergy, energy);
      }
    }
  }

  private nextShakeOffset(): THREE.Vector3 {
    return new THREE.Vector3(
      this.shakeRandom.range(-1, 1),
      this.shakeRandom.range(-1, 1),
      this.shakeRandom.range(-1, 1)
    );
  }

  public isBallCameraEnabled(): boolean {
    return this.ballCameraEnabled;
  }

  public getDiagnostics(): CameraDiagnostics {
    return {
      position: { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z },
      target: { x: this.smoothedTarget.x, y: this.smoothedTarget.y, z: this.smoothedTarget.z },
      fov: this.camera.fov,
      aspect: this.camera.aspect,
      quaternion: {
        x: this.camera.quaternion.x,
        y: this.camera.quaternion.y,
        z: this.camera.quaternion.z,
        w: this.camera.quaternion.w
      },
      ballCameraEnabled: this.ballCameraEnabled,
      rearViewHeld: this.rearViewHeld,
      settings: this.settings
    };
  }

  public dispose(): void {
    // The camera object itself is owned by PlaceholderSceneRenderer.
  }
}

function lerpAngle(current: number, target: number, alpha: number): number {
  let delta = target - current;
  delta = ((delta + Math.PI) % (2 * Math.PI)) - Math.PI;
  if (delta < -Math.PI) {
    delta += 2 * Math.PI;
  }
  return current + delta * alpha;
}

export interface CameraDiagnostics {
  readonly position: { x: number; y: number; z: number };
  readonly target: { x: number; y: number; z: number };
  readonly fov: number;
  readonly aspect: number;
  readonly quaternion: { x: number; y: number; z: number; w: number };
  readonly ballCameraEnabled: boolean;
  readonly rearViewHeld: boolean;
  readonly settings: CameraSettings;
}
