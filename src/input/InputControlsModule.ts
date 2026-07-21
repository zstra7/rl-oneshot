import {
  DEFAULT_GAMEPAD_BINDINGS,
  DEFAULT_KEYBOARD_BINDINGS,
  DEFAULT_MOUSE_BINDINGS,
  GAMEPAD_TRIGGER_ACTIVATION_THRESHOLD,
  POWERSLIDE_KEYBOARD_BINDING,
  POWERSLIDE_KEYBOARD_BINDING_ALT,
  STANDARD_GAMEPAD_AXES
} from "@/input/bindings/DefaultBindings";
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
import { DEFAULT_HUMAN_DODGE_DEADZONE } from "@/input/InputTypes";
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

const AXIS_DEADZONE = 0.15;

function applyDeadzone(value: number): number {
  return Math.abs(value) < AXIS_DEADZONE ? 0 : value;
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
  private assignedGamepadIndex: number | null = null;
  private latestGamepadSnapshot: GamepadLike | null = null;
  private previousGamepadButtonsPressed: boolean[] = [];

  private activeDevice: ActiveInputDevice = "none";
  private pendingEdges: ActionEdge[] = [];
  private edgeSequence = 0;

  private dodgeDeadzone = DEFAULT_HUMAN_DODGE_DEADZONE;

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

    if (code === "Space") {
      this.pushEdge("BALL_CAMERA", "pressed");
    } else if (code === "Escape") {
      this.pushEdge("PAUSE", "pressed");
    }
  }

  private handleKeyboardRelease(_code: string): void {
    // Only press-edges are tracked for BALL_CAMERA/PAUSE (consume-once
    // actions); release edges are not currently needed by any consumer.
  }

  private handleMousePress(button: number): void {
    this.activeDevice = "keyboard-mouse";

    if (button === DEFAULT_MOUSE_BINDINGS.jump) {
      this.pushEdge("JUMP", "pressed");
    }
  }

  private handleMouseRelease(button: number): void {
    if (button === DEFAULT_MOUSE_BINDINGS.jump) {
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

    for (let i = 0; i < gamepad.buttons.length; i += 1) {
      const wasPressed = this.previousGamepadButtonsPressed[i] ?? false;
      const isPressed = gamepad.buttons[i]?.pressed ?? false;

      if (isPressed && !wasPressed) {
        this.activeDevice = "gamepad";
        if (i === DEFAULT_GAMEPAD_BINDINGS.jumpButton) {
          this.pushEdge("JUMP", "pressed");
        } else if (i === DEFAULT_GAMEPAD_BINDINGS.ballCameraButton) {
          this.pushEdge("BALL_CAMERA", "pressed");
        } else if (i === DEFAULT_GAMEPAD_BINDINGS.pauseButton) {
          this.pushEdge("PAUSE", "pressed");
        }
      } else if (!isPressed && wasPressed && i === DEFAULT_GAMEPAD_BINDINGS.jumpButton) {
        this.pushEdge("JUMP", "released");
      }
    }

    this.previousGamepadButtonsPressed = gamepad.buttons.map((button) => button.pressed);
    this.latestGamepadSnapshot = gamepad;
  }

  /** Test-only: swap in a VirtualGamepadProvider after initialise(). */
  public useVirtualGamepadProvider(provider: GamepadProvider): void {
    this.gamepadProvider = provider;
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

  private buildLogicalStateFromKeyboardMouse(): LogicalGameplayState {
    if (!this.keyboard || !this.mouse) {
      return neutralLogicalGameplayState();
    }

    const kb = this.keyboard;
    const mouse = this.mouse;
    const b = DEFAULT_KEYBOARD_BINDINGS;

    const airRollModifier =
      kb.isPressed(POWERSLIDE_KEYBOARD_BINDING) || kb.isPressed(POWERSLIDE_KEYBOARD_BINDING_ALT);

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
      jumpHeld: mouse.isPressed(DEFAULT_MOUSE_BINDINGS.jump),
      boostHeld: mouse.isPressed(DEFAULT_MOUSE_BINDINGS.boost),
      powerslideHeld: airRollModifier
    };
  }

  private buildLogicalStateFromGamepad(): LogicalGameplayState {
    const gamepad = this.latestGamepadSnapshot;
    if (!gamepad) {
      return neutralLogicalGameplayState();
    }

    const leftX = applyDeadzone(gamepad.axes[STANDARD_GAMEPAD_AXES.leftX] ?? 0);
    const leftY = applyDeadzone(gamepad.axes[STANDARD_GAMEPAD_AXES.leftY] ?? 0);

    const accelerateValue = gamepad.buttons[DEFAULT_GAMEPAD_BINDINGS.accelerateButton]?.value ?? 0;
    const reverseValue = gamepad.buttons[DEFAULT_GAMEPAD_BINDINGS.reverseButton]?.value ?? 0;
    const airRollModifier =
      reverseValue > GAMEPAD_TRIGGER_ACTIVATION_THRESHOLD;

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
      jumpHeld: gamepad.buttons[DEFAULT_GAMEPAD_BINDINGS.jumpButton]?.pressed ?? false,
      boostHeld: gamepad.buttons[DEFAULT_GAMEPAD_BINDINGS.boostButton]?.pressed ?? false,
      powerslideHeld: gamepad.buttons[DEFAULT_GAMEPAD_BINDINGS.powerslideButton]?.pressed ?? false
    };
  }

  public sampleGameplayInputForTick(
    tick: number,
    context: GameplayInputContext
  ): HumanGameplayInputFrame {
    const carControlProfile: CarControlProfile = { dodgeDeadzone: this.dodgeDeadzone };

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

    const camera: CameraInput = {
      toggleBallCameraPressed: ballCameraPressed,
      rearViewHeld: this.mouse?.isPressed(DEFAULT_MOUSE_BINDINGS.rearView) ?? false,
      swivelX: 0,
      swivelY: 0,
      resetSwivelPressed: false
    };

    const system: SystemInputFrame = {
      scoreboardHeld: this.keyboard?.isPressed(DEFAULT_KEYBOARD_BINDINGS.scoreboard) ?? false,
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
      pointerPrimaryPressed: this.mouse?.isPressed(DEFAULT_MOUSE_BINDINGS.boost) ?? false,
      pointerSecondaryPressed: this.mouse?.isPressed(DEFAULT_MOUSE_BINDINGS.jump) ?? false
    };
  }

  public sampleSystemInput(): SystemInputFrame {
    return {
      scoreboardHeld: this.keyboard?.isPressed(DEFAULT_KEYBOARD_BINDINGS.scoreboard) ?? false,
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
      output: this.sampleGameplayInputForTick(0, { grounded: true })
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
