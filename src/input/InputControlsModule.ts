import {
  DEFAULT_KEYBOARD_BINDINGS,
  DEFAULT_MOUSE_BINDINGS,
  GAMEPAD_TRIGGER_ACTIVATION_THRESHOLD,
  STANDARD_GAMEPAD_AXES
} from "@/input/bindings/DefaultBindings";
import {
  DEFAULT_CONTROL_BINDINGS,
  type ControlBindings,
  type KeyOrMouseBinding
} from "@/input/bindings/BindingsConfig";
import { BrowserGamepadProvider } from "@/input/gamepad/BrowserGamepadProvider";
import type { GamepadLike, GamepadProvider } from "@/input/gamepad/GamepadProvider";
import type {
  ActiveInputDevice,
  ActionEdge,
  CameraInput,
  CarControlProfile,
  GameplayInputContext,
  HumanGameplayInputFrame,
  InputContext,
  InputDiagnostics,
  SystemInputFrame,
  UiInputFrame
} from "@/input/InputTypes";
import { DEFAULT_AIR_ROLL_SENSITIVITY, DEFAULT_HUMAN_DODGE_DEADZONE } from "@/input/InputTypes";
import {
  buildCarInput,
  neutralLogicalGameplayState,
  type LogicalGameplayState
} from "@/input/LogicalGameplayState";
import { KeyboardState } from "@/input/KeyboardState";
import { MouseState } from "@/input/MouseState";

export interface InputInitialisationOptions {
  readonly gameplayElement: HTMLElement;
  readonly initialContext: InputContext;
  readonly gamepadProvider?: GamepadProvider;
}

/** Result of a completed rebind capture (R10.2). */
export interface CapturedBinding {
  readonly kind: "key" | "mouse" | "gamepad";
  readonly code?: string;
  readonly button?: number;
}

const AXIS_DEADZONE = 0.15;
const STICK_ACTIVATION_THRESHOLD = 0.35;
const AIR_ROLL_SENSITIVITY_MIN = 0.5;
const AIR_ROLL_SENSITIVITY_MAX = 2.0;

function applyDeadzone(value: number): number {
  return Math.abs(value) < AXIS_DEADZONE ? 0 : value;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Not `implements GameModule`: `initialise()` needs the gameplay
 * `HTMLElement` (the canvas) before it can attach listeners, so
 * GameRuntime initialises this module explicitly rather than through the
 * generic zero-argument `GameModule.initialise()` loop. `dispose()` still
 * matches the common shape and participates in the generic dispose pass.
 */
export class InputControlsModule {
  private context: InputContext = "BOOT";
  private keyboard: KeyboardState | null = null;
  private mouse: MouseState | null = null;
  private gamepadProvider: GamepadProvider = new BrowserGamepadProvider();
  private gamepadProviderKind: "browser" | "virtual" = "browser";
  private assignedGamepadIndex: number | null = null;
  private latestGamepadSnapshot: GamepadLike | null = null;
  private previousGamepadButtonsPressed: boolean[] = [];

  private activeDevice: ActiveInputDevice = "none";
  private pendingEdges: ActionEdge[] = [];
  private edgeSequence = 0;

  private dodgeDeadzone = DEFAULT_HUMAN_DODGE_DEADZONE;
  private airRollSensitivity = DEFAULT_AIR_ROLL_SENSITIVITY;

  /** R10.1: the rebindable action->physical-input map, live-swappable via setBindings(). */
  private bindings: ControlBindings = DEFAULT_CONTROL_BINDINGS;

  // R10.2 rebind-UI capture support: while armed, the next matching press is
  // recorded into capturedBinding instead of being dispatched as gameplay
  // input (suppressed from the edge queues).
  private captureArmed: "keyboardMouse" | "gamepad" | null = null;
  private capturedBinding: CapturedBinding | null = null;

  private onBlur = () => this.handleFocusLoss();
  private onVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      this.handleFocusLoss();
    }
  };

  public initialise(options: InputInitialisationOptions): void {
    this.context = options.initialContext;

    if (options.gamepadProvider) {
      this.gamepadProvider = options.gamepadProvider;
    }

    this.keyboard = new KeyboardState(() => this.context === "GAMEPLAY");
    this.keyboard.attach();
    this.keyboard.onPress((code) => this.handleKeyboardPress(code));
    this.keyboard.onRelease((code) => this.handleKeyboardRelease(code));

    this.mouse = new MouseState(options.gameplayElement, () => this.context === "GAMEPLAY");
    this.mouse.attach();
    this.mouse.onPress((button) => this.handleMousePress(button));
    this.mouse.onRelease((button) => this.handleMouseRelease(button));

    window.addEventListener("blur", this.onBlur);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
  }

  public dispose(): void {
    this.keyboard?.detach();
    this.mouse?.detach();
    window.removeEventListener("blur", this.onBlur);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    this.keyboard = null;
    this.mouse = null;
    this.pendingEdges = [];
    this.assignedGamepadIndex = null;
    this.latestGamepadSnapshot = null;
  }

  private handleKeyboardPress(code: string): void {
    this.activeDevice = "keyboard-mouse";

    if (this.captureArmed === "keyboardMouse") {
      if (code === "Escape") {
        this.captureArmed = null;
      } else {
        this.capturedBinding = { kind: "key", code };
        this.captureArmed = null;
      }
      return;
    }

    const b = this.bindings.keyboardMouse;

    if (code === b.ballCamera) {
      this.pushEdge("BALL_CAMERA", "pressed");
    } else if (code === b.pause) {
      this.pushEdge("PAUSE", "pressed");
    }

    if (b.jump.kind === "key" && b.jump.code === code) {
      this.pushEdge("JUMP", "pressed");
    }
  }

  private handleKeyboardRelease(code: string): void {
    // Only press-edges are tracked for BALL_CAMERA/PAUSE (consume-once
    // actions); release edges are not currently needed by any consumer.
    const jump = this.bindings.keyboardMouse.jump;
    if (jump.kind === "key" && jump.code === code) {
      this.pushEdge("JUMP", "released");
    }
  }

  private handleMousePress(button: number): void {
    this.activeDevice = "keyboard-mouse";

    if (this.captureArmed === "keyboardMouse") {
      this.capturedBinding = { kind: "mouse", button };
      this.captureArmed = null;
      return;
    }

    const jump = this.bindings.keyboardMouse.jump;
    if (jump.kind === "mouse" && jump.button === button) {
      this.pushEdge("JUMP", "pressed");
    }
  }

  private handleMouseRelease(button: number): void {
    const jump = this.bindings.keyboardMouse.jump;
    if (jump.kind === "mouse" && jump.button === button) {
      this.pushEdge("JUMP", "released");
    }
  }

  private pushEdge(action: ActionEdge["action"], kind: ActionEdge["kind"]): void {
    this.pendingEdges.push({
      sequence: this.edgeSequence,
      action,
      kind,
      timestampMs: typeof performance !== "undefined" ? performance.now() : Date.now(),
      source: this.activeDevice,
      consumedByPhysicsTick: null
    });
    this.edgeSequence += 1;
  }

  private consumeEdge(action: ActionEdge["action"], kind: ActionEdge["kind"]): boolean {
    const index = this.pendingEdges.findIndex(
      (edge) => edge.action === action && edge.kind === kind && edge.consumedByPhysicsTick === null
    );

    if (index === -1) {
      return false;
    }

    this.pendingEdges.splice(index, 1);
    return true;
  }

  private handleFocusLoss(): void {
    this.keyboard?.clear();
    this.mouse?.clear();
    this.pendingEdges = [];
  }

  public updateBrowserFrame(_timestampMs: number): void {
    this.pollGamepad();
  }

  private pollGamepad(): void {
    if (this.assignedGamepadIndex === null) {
      const gamepads = this.gamepadProvider.getGamepads();
      const firstConnected = gamepads.find((gamepad) => gamepad.connected);
      if (firstConnected) {
        this.assignGamepad(firstConnected.index);
      }
      return;
    }

    const gamepads = this.gamepadProvider.getGamepads();
    const gamepad = gamepads.find((g) => g.index === this.assignedGamepadIndex) ?? null;

    if (!gamepad || !gamepad.connected) {
      this.assignedGamepadIndex = null;
      this.latestGamepadSnapshot = null;
      this.previousGamepadButtonsPressed = [];
      return;
    }

    const g = this.bindings.gamepad;

    // Promote to "gamepad" on analog activity too, not just a button edge —
    // otherwise moving the stick or squeezing a trigger never activates the
    // pad, and any keyboard/mouse touch (including the one-time audio-resume
    // gesture) leaves it stuck on "keyboard-mouse" until a pad button press.
    const leftXActivity = Math.abs(gamepad.axes[STANDARD_GAMEPAD_AXES.leftX] ?? 0);
    const leftYActivity = Math.abs(gamepad.axes[STANDARD_GAMEPAD_AXES.leftY] ?? 0);
    const accelerateActivity = gamepad.buttons[g.accelerateButton]?.value ?? 0;
    const reverseActivity = gamepad.buttons[g.reverseButton]?.value ?? 0;
    if (
      leftXActivity > STICK_ACTIVATION_THRESHOLD ||
      leftYActivity > STICK_ACTIVATION_THRESHOLD ||
      accelerateActivity > GAMEPAD_TRIGGER_ACTIVATION_THRESHOLD ||
      reverseActivity > GAMEPAD_TRIGGER_ACTIVATION_THRESHOLD
    ) {
      this.activeDevice = "gamepad";
    }

    for (let i = 0; i < gamepad.buttons.length; i += 1) {
      const wasPressed = this.previousGamepadButtonsPressed[i] ?? false;
      const isPressed = gamepad.buttons[i]?.pressed ?? false;

      if (isPressed && !wasPressed) {
        this.activeDevice = "gamepad";

        if (this.captureArmed === "gamepad") {
          this.capturedBinding = { kind: "gamepad", button: i };
          this.captureArmed = null;
        } else if (i === g.jumpButton) {
          this.pushEdge("JUMP", "pressed");
        } else if (i === g.ballCameraButton) {
          this.pushEdge("BALL_CAMERA", "pressed");
        } else if (i === g.pauseButton) {
          this.pushEdge("PAUSE", "pressed");
        }
      } else if (!isPressed && wasPressed && i === g.jumpButton) {
        this.pushEdge("JUMP", "released");
      }
    }

    this.previousGamepadButtonsPressed = gamepad.buttons.map((button) => button.pressed);
    this.latestGamepadSnapshot = gamepad;
  }

  /** Test-only: swap in a VirtualGamepadProvider after initialise(). */
  public useVirtualGamepadProvider(provider: GamepadProvider): void {
    this.gamepadProvider = provider;
    this.gamepadProviderKind = "virtual";
    this.assignGamepad(null);
  }

  /** Test-only counterpart of useVirtualGamepadProvider: restore real hardware polling. */
  public useBrowserGamepadProvider(): void {
    this.gamepadProvider = new BrowserGamepadProvider();
    this.gamepadProviderKind = "browser";
    this.assignGamepad(null);
  }

  public setInputContext(context: InputContext): void {
    this.context = context;
  }

  public getInputContext(): InputContext {
    return this.context;
  }

  public getActiveDevice(): ActiveInputDevice {
    return this.activeDevice;
  }

  public getAssignedGamepad(): { index: number; id: string } | null {
    if (this.assignedGamepadIndex === null || !this.latestGamepadSnapshot) {
      return null;
    }
    return { index: this.assignedGamepadIndex, id: this.latestGamepadSnapshot.id };
  }

  public assignGamepad(index: number | null): void {
    this.assignedGamepadIndex = index;
    this.previousGamepadButtonsPressed = [];
    if (index === null) {
      this.latestGamepadSnapshot = null;
    }
  }

  // -- R10.1/R10.2: bindings + rebind-capture surface --

  public setBindings(bindings: ControlBindings): void {
    this.bindings = bindings;
  }

  public getBindings(): ControlBindings {
    return this.bindings;
  }

  public startBindingCapture(device: "keyboardMouse" | "gamepad"): void {
    this.captureArmed = device;
    this.capturedBinding = null;
  }

  public cancelBindingCapture(): void {
    this.captureArmed = null;
  }

  public takeCapturedBinding(): CapturedBinding | null {
    const captured = this.capturedBinding;
    this.capturedBinding = null;
    return captured;
  }

  public getAirRollSensitivity(): number {
    return this.airRollSensitivity;
  }

  public setAirRollSensitivity(value: number): void {
    this.airRollSensitivity = clamp(value, AIR_ROLL_SENSITIVITY_MIN, AIR_ROLL_SENSITIVITY_MAX);
  }

  private isKeyOrMouseHeld(binding: KeyOrMouseBinding): boolean {
    if (binding.kind === "key") {
      return this.keyboard?.isPressed(binding.code) ?? false;
    }
    return this.mouse?.isPressed(binding.button) ?? false;
  }

  private buildLogicalStateFromKeyboardMouse(): LogicalGameplayState {
    if (!this.keyboard || !this.mouse) {
      return neutralLogicalGameplayState();
    }

    const kb = this.keyboard;
    const b = this.bindings.keyboardMouse;

    const airRollModifier =
      kb.isPressed(b.airRollModifierPrimary) || kb.isPressed(b.airRollModifierSecondary);

    return {
      accelerate: kb.isPressed(b.accelerate) ? 1 : 0,
      reverse: kb.isPressed(b.reverse) ? 1 : 0,
      steerLeft: kb.isPressed(b.steerLeft) ? 1 : 0,
      steerRight: kb.isPressed(b.steerRight) ? 1 : 0,
      pitchNoseDown: kb.isPressed(b.pitchNoseDown) ? 1 : 0,
      pitchNoseUp: kb.isPressed(b.pitchNoseUp) ? 1 : 0,
      yawLeft: kb.isPressed(b.yawLeft) ? 1 : 0,
      yawRight: kb.isPressed(b.yawRight) ? 1 : 0,
      airRollLeft: false,
      airRollRight: false,
      airRollModifier,
      jumpHeld: this.isKeyOrMouseHeld(b.jump),
      boostHeld: this.isKeyOrMouseHeld(b.boost),
      powerslideHeld: kb.isPressed(b.powerslide) || airRollModifier
    };
  }

  private buildLogicalStateFromGamepad(): LogicalGameplayState {
    const gamepad = this.latestGamepadSnapshot;
    if (!gamepad) {
      return neutralLogicalGameplayState();
    }

    const g = this.bindings.gamepad;

    const leftX = applyDeadzone(gamepad.axes[STANDARD_GAMEPAD_AXES.leftX] ?? 0);
    const leftY = applyDeadzone(gamepad.axes[STANDARD_GAMEPAD_AXES.leftY] ?? 0);

    const accelerateValue = gamepad.buttons[g.accelerateButton]?.value ?? 0;
    const reverseValue = gamepad.buttons[g.reverseButton]?.value ?? 0;
    // Air-roll/powerslide modifier is a dedicated face button (west/X by
    // default, matching RL), not the brake trigger — braking mid-air must
    // not turn stick input into roll. R10 semantic-trap fix: this now
    // consumes bindings.gamepad.airRollModifierButton (default matches
    // powerslideButton's value) so the binding the rebind UI displays is
    // the one actually driving air-roll.
    const airRollModifier = gamepad.buttons[g.airRollModifierButton]?.pressed ?? false;

    return {
      accelerate: accelerateValue > GAMEPAD_TRIGGER_ACTIVATION_THRESHOLD ? accelerateValue : 0,
      reverse: reverseValue > GAMEPAD_TRIGGER_ACTIVATION_THRESHOLD ? reverseValue : 0,
      steerLeft: leftX < 0 ? -leftX : 0,
      steerRight: leftX > 0 ? leftX : 0,
      pitchNoseDown: leftY < 0 ? -leftY : 0,
      pitchNoseUp: leftY > 0 ? leftY : 0,
      yawLeft: leftX < 0 ? -leftX : 0,
      yawRight: leftX > 0 ? leftX : 0,
      airRollLeft: false,
      airRollRight: false,
      airRollModifier,
      jumpHeld: gamepad.buttons[g.jumpButton]?.pressed ?? false,
      boostHeld: gamepad.buttons[g.boostButton]?.pressed ?? false,
      powerslideHeld: gamepad.buttons[g.powerslideButton]?.pressed ?? false
    };
  }

  public sampleGameplayInputForTick(
    tick: number,
    context: GameplayInputContext
  ): HumanGameplayInputFrame {
    const carControlProfile: CarControlProfile = {
      dodgeDeadzone: this.dodgeDeadzone,
      airRollSensitivity: this.airRollSensitivity
    };

    if (this.context !== "GAMEPLAY") {
      return neutralGameplayFrame(tick, this.activeDevice, carControlProfile);
    }

    const logical =
      this.activeDevice === "gamepad"
        ? this.buildLogicalStateFromGamepad()
        : this.buildLogicalStateFromKeyboardMouse();

    const car = buildCarInput(logical, context.grounded);

    const jumpPressed = this.consumeEdge("JUMP", "pressed");
    const jumpReleased = this.consumeEdge("JUMP", "released");
    const ballCameraPressed = this.consumeEdge("BALL_CAMERA", "pressed");
    const pausePressed = this.consumeEdge("PAUSE", "pressed");

    const rearViewHeld =
      this.activeDevice === "gamepad"
        ? this.latestGamepadSnapshot?.buttons[this.bindings.gamepad.rearViewButton]?.pressed ?? false
        : this.isKeyOrMouseHeld(this.bindings.keyboardMouse.rearView);

    const camera: CameraInput = {
      toggleBallCameraPressed: ballCameraPressed,
      rearViewHeld,
      swivelX: 0,
      swivelY: 0,
      resetSwivelPressed: false
    };

    const system: SystemInputFrame = {
      scoreboardHeld: this.keyboard?.isPressed(this.bindings.keyboardMouse.scoreboard) ?? false,
      pausePressed,
      skipPresentationPressed: false
    };

    return {
      tick,
      car,
      carControlProfile,
      camera,
      system,
      sourceDevice: this.activeDevice,
      edges: { jumpPressed, jumpReleased, ballCameraPressed, pausePressed }
    };
  }

  public sampleUiInput(): UiInputFrame {
    const kb = this.keyboard;
    // UI-navigation keys are fixed and not part of the rebindable
    // ControlBindings surface (R10.1) — they stay sourced from the
    // DefaultBindings constants directly.
    const b = DEFAULT_KEYBOARD_BINDINGS;

    const navigateX = kb?.isPressed(b.uiRight) ? 1 : kb?.isPressed(b.uiLeft) ? -1 : 0;
    const navigateY = kb?.isPressed(b.uiDown) ? 1 : kb?.isPressed(b.uiUp) ? -1 : 0;

    const pointerPosition = this.mouse?.getPosition();

    return {
      navigateX,
      navigateY,
      confirmPressed: false,
      cancelPressed: false,
      tabLeftPressed: false,
      tabRightPressed: false,
      pointerMoved: this.mouse?.consumeMoved() ?? false,
      ...(pointerPosition ? { pointerPosition } : {}),
      // Raw pointer semantics (LMB/RMB), independent of the rebindable
      // boost/jump gameplay actions.
      pointerPrimaryPressed: this.mouse?.isPressed(DEFAULT_MOUSE_BINDINGS.boost) ?? false,
      pointerSecondaryPressed: this.mouse?.isPressed(DEFAULT_MOUSE_BINDINGS.jump) ?? false
    };
  }

  public sampleSystemInput(): SystemInputFrame {
    return {
      scoreboardHeld: this.keyboard?.isPressed(this.bindings.keyboardMouse.scoreboard) ?? false,
      pausePressed: false,
      skipPresentationPressed: false
    };
  }

  public getDodgeDeadzone(): number {
    return this.dodgeDeadzone;
  }

  public setDodgeDeadzone(value: number): void {
    this.dodgeDeadzone = value;
  }

  public getDiagnostics(): InputDiagnostics {
    return {
      context: this.context,
      activeDevice: this.activeDevice,
      rawKeyboardHeld: this.keyboard?.getHeldCodes() ?? [],
      rawMouseButtonsHeld: this.mouse?.getHeldButtons() ?? [],
      output: this.sampleGameplayInputForTick(0, { grounded: true }),
      gamepadProviderKind: this.gamepadProviderKind
    };
  }
}

function neutralGameplayFrame(
  tick: number,
  sourceDevice: ActiveInputDevice,
  carControlProfile: CarControlProfile
): HumanGameplayInputFrame {
  return {
    tick,
    car: { throttle: 0, steer: 0, pitch: 0, yaw: 0, roll: 0, jump: false, boost: false, powerslide: false },
    carControlProfile,
    camera: {
      toggleBallCameraPressed: false,
      rearViewHeld: false,
      swivelX: 0,
      swivelY: 0,
      resetSwivelPressed: false
    },
    system: { scoreboardHeld: false, pausePressed: false, skipPresentationPressed: false },
    sourceDevice,
    edges: {
      jumpPressed: false,
      jumpReleased: false,
      ballCameraPressed: false,
      pausePressed: false
    }
  };
}
