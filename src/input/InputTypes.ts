export type InputContext =
  | "BOOT"
  | "MAIN_MENU"
  | "MATCH_SETUP"
  | "SETTINGS"
  | "COUNTDOWN"
  | "GAMEPLAY"
  | "GOAL_CELEBRATION"
  | "PAUSED"
  | "RESULTS"
  | "REBIND_CAPTURE"
  | "DEBUG_LAB";

export type GameplayAction =
  | "ACCELERATE"
  | "REVERSE"
  | "STEER_LEFT"
  | "STEER_RIGHT"
  | "PITCH_FORWARD"
  | "PITCH_BACKWARD"
  | "YAW_LEFT"
  | "YAW_RIGHT"
  | "JUMP"
  | "BOOST"
  | "POWERSLIDE"
  | "AIR_ROLL"
  | "AIR_ROLL_LEFT"
  | "AIR_ROLL_RIGHT"
  | "BALL_CAMERA"
  | "REAR_VIEW"
  | "CAMERA_SWIVEL_X"
  | "CAMERA_SWIVEL_Y"
  | "SCOREBOARD"
  | "PAUSE"
  | "SKIP_PRESENTATION";

export type UiAction =
  | "UI_UP"
  | "UI_DOWN"
  | "UI_LEFT"
  | "UI_RIGHT"
  | "UI_CONFIRM"
  | "UI_CANCEL"
  | "UI_TAB_LEFT"
  | "UI_TAB_RIGHT";

/**
 * Structurally identical to physics/PhysicsTypes.CarInput. Deliberately
 * not imported from there — input must not import physics (dependency
 * direction, core architecture spec section 10). GameRuntime (integration
 * layer) bridges the two structurally.
 */
export interface CarInput {
  throttle: number;
  steer: number;
  pitch: number;
  yaw: number;
  roll: number;

  jump: boolean;
  boost: boolean;
  powerslide: boolean;
}

export interface CarControlProfile {
  dodgeDeadzone: number;
  airRollSensitivity: number;
}

export const DEFAULT_HUMAN_DODGE_DEADZONE = 0.8;
/** R10.3: multiplier on maxRollAngularAcceleration, clamped [0.5, 2.0]. */
export const DEFAULT_AIR_ROLL_SENSITIVITY = 1.0;

export interface CameraInput {
  toggleBallCameraPressed: boolean;
  rearViewHeld: boolean;
  swivelX: number;
  swivelY: number;
  resetSwivelPressed: boolean;
}

export interface SystemInputFrame {
  scoreboardHeld: boolean;
  pausePressed: boolean;
  skipPresentationPressed: boolean;
}

export interface UiInputFrame {
  navigateX: -1 | 0 | 1;
  navigateY: -1 | 0 | 1;
  confirmPressed: boolean;
  cancelPressed: boolean;
  tabLeftPressed: boolean;
  tabRightPressed: boolean;
  pointerMoved: boolean;
  pointerPosition?: { x: number; y: number };
  pointerPrimaryPressed: boolean;
  pointerSecondaryPressed: boolean;
}

export type ActiveInputDevice = "keyboard-mouse" | "gamepad" | "none";

/**
 * Minimal for Phase 4: only the grounded flag the CarInput resolver needs
 * (physics spec section 27). No physics module is imported to build this
 * — the integration layer (Phase 5+) supplies a real grounded value once
 * the car controller exists; Phase 4 defaults to true.
 */
export interface GameplayInputContext {
  readonly grounded: boolean;
}

export interface HumanGameplayInputFrame {
  readonly tick: number;

  readonly car: CarInput;
  readonly carControlProfile: CarControlProfile;

  readonly camera: CameraInput;
  readonly system: SystemInputFrame;

  readonly sourceDevice: ActiveInputDevice;

  readonly edges: {
    readonly jumpPressed: boolean;
    readonly jumpReleased: boolean;
    readonly ballCameraPressed: boolean;
    readonly pausePressed: boolean;
  };
}

export interface ActionEdge {
  readonly sequence: number;
  readonly action: GameplayAction;
  readonly kind: "pressed" | "released";
  readonly timestampMs: number;
  readonly source: ActiveInputDevice;
  consumedByPhysicsTick: number | null;
}

export interface InputDiagnostics {
  readonly context: InputContext;
  readonly activeDevice: ActiveInputDevice;
  readonly rawKeyboardHeld: string[];
  readonly rawMouseButtonsHeld: number[];
  readonly output: HumanGameplayInputFrame;
  /**
   * Which GamepadProvider is currently polled — "browser" means real
   * hardware (navigator.getGamepads()), "virtual" means a test-injected
   * VirtualGamepadProvider. Exists so a real browser session can assert
   * it never silently loses real controller polling to a test hook.
   */
  readonly gamepadProviderKind: "browser" | "virtual";
}
