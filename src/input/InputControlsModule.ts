import {
  DEFAULT_KEYBOARD_BINDINGS,
  DEFAULT_MOUSE_BINDINGS,
  GAMEPAD_TRIGGER_ACTIVATION_THRESHOLD,
  STANDARD_GAMEPAD_AXES,
  STANDARD_GAMEPAD_BUTTONS
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

/**
 * R11: fixed (non-rebindable) gamepad menu-navigation surface. `up/down/
 * left/right` are HELD states (dpad OR left stick, with hysteresis);
 * `confirmPressed`/`backPressed` are one-shot edges (south/east) that clear
 * on read — see `sampleMenuNavigation()`.
 */
export interface MenuNavigationFrame {
  readonly up: boolean;
  readonly down: boolean;
  readonly left: boolean;
  readonly right: boolean;
  readonly confirmPressed: boolean;
  readonly backPressed: boolean;
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

/** R11 menu-navigation stick hysteresis thresholds — see updateMenuStickHeld. */
const MENU_STICK_ENGAGE_THRESHOLD = 0.5;
const MENU_STICK_RELEASE_THRESHOLD = 0.35;

function applyDeadzone(value: number): number {
  return Math.abs(value) < AXIS_DEADZONE ? 0 : value;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** R11: engage at > 0.5, release only below 0.35, else keep the current state. */
function axisHysteresis(currentlyHeld: boolean, magnitude: number): boolean {
  if (magnitude > MENU_STICK_ENGAGE_THRESHOLD) {
    return true;
  }
  if (magnitude < MENU_STICK_RELEASE_THRESHOLD) {
    return false;
  }
  return currentlyHeld;
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

  // -- R11: menu-navigation edge quarantine + require-release re-arm --

  /**
   * Set by GameRuntime from `matchFlow.areControlsActive()` once per
   * browser frame. While false, `pollGamepad` must not enqueue gameplay
   * edges (JUMP/BALL_CAMERA/PAUSE) from gamepad presses — otherwise
   * pressing South to click RESUME on the pause menu leaves a queued JUMP
   * edge that fires the instant play resumes.
   */
  private gameplayEdgesEnabled = true;
  /**
   * Set by GameRuntime from `MENU_NAVIGABLE_STATES.includes(matchState)`.
   * While false, gamepad south/east presses must not be collected as menu
   * confirm/back edges (mirror image of `gameplayEdgesEnabled` — the two
   * are never simultaneously true for any real match state).
   */
  private menuEdgesEnabled = false;

  private pendingMenuConfirmEdge = false;
  private pendingMenuBackEdge = false;

  /** Held-with-hysteresis left-stick menu-navigation directions (R11). */
  private menuStickHeld = { up: false, down: false, left: false, right: false };

  /**
   * Require-release re-arm mask (R11): every gamepad button/keyboard
   * code/mouse button held at the instant of a menu->gameplay transition
   * is captured here by `rearmGameplayInputs()` and masked from gameplay
   * sampling until it is physically released at least once.
   */
  private rearmedGamepadButtons = new Set<number>();
  private rearmedKeyboardCodes = new Set<string>();
  private rearmedMouseButtons = new Set<number>();

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
      this.menuStickHeld = { up: false, down: false, left: false, right: false };
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
        } else {
          // R11 edge quarantine: gameplay edges (JUMP/BALL_CAMERA/PAUSE)
          // and menu edges (confirm/back, fixed south/east — not
          // rebindable) are collected from two mutually-exclusive gates so
          // a South press at the pause menu can never also queue a
          // gameplay JUMP edge.
          if (this.gameplayEdgesEnabled) {
            if (i === g.jumpButton) {
              this.pushEdge("JUMP", "pressed");
            } else if (i === g.ballCameraButton) {
              this.pushEdge("BALL_CAMERA", "pressed");
            } else if (i === g.pauseButton) {
              this.pushEdge("PAUSE", "pressed");
            }
          }
          if (this.menuEdgesEnabled) {
            if (i === STANDARD_GAMEPAD_BUTTONS.south) {
              this.pendingMenuConfirmEdge = true;
            } else if (i === STANDARD_GAMEPAD_BUTTONS.east) {
              this.pendingMenuBackEdge = true;
            }
          }
        }
      } else if (!isPressed && wasPressed && i === g.jumpButton && this.gameplayEdgesEnabled) {
        this.pushEdge("JUMP", "released");
      }

      if (!isPressed) {
        this.rearmedGamepadButtons.delete(i);
      }
    }

    this.updateMenuStickHeld(gamepad);

    this.previousGamepadButtonsPressed = gamepad.buttons.map((button) => button.pressed);
    this.latestGamepadSnapshot = gamepad;
  }

  /**
   * R11 stick hysteresis: engage a held direction at |axis| > 0.5, release
   * only below 0.35. A stick hovering right at a single threshold cannot
   * oscillate held/released across frames and machine-gun the focus.
   */
  private updateMenuStickHeld(gamepad: GamepadLike): void {
    const leftX = gamepad.axes[STANDARD_GAMEPAD_AXES.leftX] ?? 0;
    const leftY = gamepad.axes[STANDARD_GAMEPAD_AXES.leftY] ?? 0;

    this.menuStickHeld = {
      left: axisHysteresis(this.menuStickHeld.left, leftX < 0 ? -leftX : 0),
      right: axisHysteresis(this.menuStickHeld.right, leftX > 0 ? leftX : 0),
      up: axisHysteresis(this.menuStickHeld.up, leftY < 0 ? -leftY : 0),
      down: axisHysteresis(this.menuStickHeld.down, leftY > 0 ? leftY : 0)
    };
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

  // -- R11: menu-navigation surface --

  /**
   * Called once per browser frame by GameRuntime while `matchState` is
   * menu-navigable. Held directions are re-derived fresh every call (dpad
   * OR the hysteresis-tracked stick state); confirm/back are edges that
   * clear on read — the single consumption point that guarantees one
   * physical press produces exactly one `confirmPressed`/`backPressed`.
   */
  public sampleMenuNavigation(): MenuNavigationFrame {
    const gamepad = this.latestGamepadSnapshot;
    const dpadUp = gamepad?.buttons[STANDARD_GAMEPAD_BUTTONS.dpadUp]?.pressed ?? false;
    const dpadDown = gamepad?.buttons[STANDARD_GAMEPAD_BUTTONS.dpadDown]?.pressed ?? false;
    const dpadLeft = gamepad?.buttons[STANDARD_GAMEPAD_BUTTONS.dpadLeft]?.pressed ?? false;
    const dpadRight = gamepad?.buttons[STANDARD_GAMEPAD_BUTTONS.dpadRight]?.pressed ?? false;

    const confirmPressed = this.pendingMenuConfirmEdge;
    const backPressed = this.pendingMenuBackEdge;
    this.pendingMenuConfirmEdge = false;
    this.pendingMenuBackEdge = false;

    return {
      up: dpadUp || this.menuStickHeld.up,
      down: dpadDown || this.menuStickHeld.down,
      left: dpadLeft || this.menuStickHeld.left,
      right: dpadRight || this.menuStickHeld.right,
      confirmPressed,
      backPressed
    };
  }

  /** R11 edge quarantine: GameRuntime sets this from `matchFlow.areControlsActive()`. */
  public setGameplayEdgesEnabled(enabled: boolean): void {
    this.gameplayEdgesEnabled = enabled;
  }

  /** R11 edge quarantine: GameRuntime sets this from `MENU_NAVIGABLE_STATES.includes(matchState)`. */
  public setMenuEdgesEnabled(enabled: boolean): void {
    this.menuEdgesEnabled = enabled;
    if (!enabled) {
      // Drop any stale, unconsumed confirm/back edge the instant the menu
      // stops being navigable, so it can never resurface against a
      // different menu that appears later.
      this.pendingMenuConfirmEdge = false;
      this.pendingMenuBackEdge = false;
    }
  }

  /**
   * R11 require-release re-arm: snapshot every currently-held gamepad
   * button/keyboard code/mouse button and mask each from gameplay sampling
   * until it is individually released. Call on every transition into a
   * controls-active state (resume from pause, countdown GO after menus) —
   * otherwise e.g. clicking RESUME with South (=jump on gamepad) still
   * physically held makes the car jump the instant play resumes.
   */
  public rearmGameplayInputs(): void {
    this.rearmedGamepadButtons = new Set(
      this.latestGamepadSnapshot?.buttons
        .map((button, index) => (button.pressed ? index : -1))
        .filter((index) => index >= 0) ?? []
    );
    this.rearmedKeyboardCodes = new Set(this.keyboard?.getHeldCodes() ?? []);
    this.rearmedMouseButtons = new Set(this.mouse?.getHeldButtons() ?? []);
  }

  /** R11: drop all queued gameplay + menu edges (paired with rearmGameplayInputs() on resume). */
  public clearPendingEdges(): void {
    this.pendingEdges = [];
    this.pendingMenuConfirmEdge = false;
    this.pendingMenuBackEdge = false;
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
      return this.keyPressedForGameplay(binding.code);
    }
    return this.mousePressedForGameplay(binding.button);
  }

  // -- R11 require-release re-arm: masked reads for gameplay sampling only.
  // Each helper both (a) reports false while the underlying physical input
  // is in the rearm mask, and (b) drops the mask entry the instant the
  // input is physically released, so a single release re-arms it
  // permanently rather than leaving it stuck masked forever.

  private keyPressedForGameplay(code: string): boolean {
    const held = this.keyboard?.isPressed(code) ?? false;
    if (!held) {
      this.rearmedKeyboardCodes.delete(code);
      return false;
    }
    return !this.rearmedKeyboardCodes.has(code);
  }

  private mousePressedForGameplay(button: number): boolean {
    const held = this.mouse?.isPressed(button) ?? false;
    if (!held) {
      this.rearmedMouseButtons.delete(button);
      return false;
    }
    return !this.rearmedMouseButtons.has(button);
  }

  private gamepadButtonPressedForGameplay(gamepad: GamepadLike, index: number): boolean {
    const held = gamepad.buttons[index]?.pressed ?? false;
    if (!held) {
      this.rearmedGamepadButtons.delete(index);
      return false;
    }
    return !this.rearmedGamepadButtons.has(index);
  }

  private gamepadButtonValueForGameplay(gamepad: GamepadLike, index: number): number {
    const value = gamepad.buttons[index]?.value ?? 0;
    if (value <= 0) {
      this.rearmedGamepadButtons.delete(index);
      return 0;
    }
    return this.rearmedGamepadButtons.has(index) ? 0 : value;
  }

  private buildLogicalStateFromKeyboardMouse(): LogicalGameplayState {
    if (!this.keyboard || !this.mouse) {
      return neutralLogicalGameplayState();
    }

    const b = this.bindings.keyboardMouse;

    const airRollModifier =
      this.keyPressedForGameplay(b.airRollModifierPrimary) ||
      this.keyPressedForGameplay(b.airRollModifierSecondary);

    return {
      accelerate: this.keyPressedForGameplay(b.accelerate) ? 1 : 0,
      reverse: this.keyPressedForGameplay(b.reverse) ? 1 : 0,
      steerLeft: this.keyPressedForGameplay(b.steerLeft) ? 1 : 0,
      steerRight: this.keyPressedForGameplay(b.steerRight) ? 1 : 0,
      pitchNoseDown: this.keyPressedForGameplay(b.pitchNoseDown) ? 1 : 0,
      pitchNoseUp: this.keyPressedForGameplay(b.pitchNoseUp) ? 1 : 0,
      yawLeft: this.keyPressedForGameplay(b.yawLeft) ? 1 : 0,
      yawRight: this.keyPressedForGameplay(b.yawRight) ? 1 : 0,
      airRollLeft: false,
      airRollRight: false,
      airRollModifier,
      jumpHeld: this.isKeyOrMouseHeld(b.jump),
      boostHeld: this.isKeyOrMouseHeld(b.boost),
      powerslideHeld: this.keyPressedForGameplay(b.powerslide) || airRollModifier
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

    const accelerateValue = this.gamepadButtonValueForGameplay(gamepad, g.accelerateButton);
    const reverseValue = this.gamepadButtonValueForGameplay(gamepad, g.reverseButton);
    // Air-roll/powerslide modifier is a dedicated face button (west/X by
    // default, matching RL), not the brake trigger — braking mid-air must
    // not turn stick input into roll. R10 semantic-trap fix: this now
    // consumes bindings.gamepad.airRollModifierButton (default matches
    // powerslideButton's value) so the binding the rebind UI displays is
    // the one actually driving air-roll.
    const airRollModifier = this.gamepadButtonPressedForGameplay(gamepad, g.airRollModifierButton);

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
      jumpHeld: this.gamepadButtonPressedForGameplay(gamepad, g.jumpButton),
      boostHeld: this.gamepadButtonPressedForGameplay(gamepad, g.boostButton),
      powerslideHeld: this.gamepadButtonPressedForGameplay(gamepad, g.powerslideButton)
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
        ? this.latestGamepadSnapshot
          ? this.gamepadButtonPressedForGameplay(
              this.latestGamepadSnapshot,
              this.bindings.gamepad.rearViewButton
            )
          : false
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
