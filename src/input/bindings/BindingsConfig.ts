import {
  DEFAULT_GAMEPAD_BINDINGS,
  DEFAULT_KEYBOARD_BINDINGS,
  DEFAULT_MOUSE_BINDINGS,
  POWERSLIDE_KEYBOARD_BINDING,
  STANDARD_GAMEPAD_BUTTONS
} from "@/input/bindings/DefaultBindings";

// POWERSLIDE_KEYBOARD_BINDING_ALT (ShiftRight) folds into
// keyboardMouse.airRollModifierSecondary below rather than becoming a
// distinct rebindable action — it was never a separate binding, just the
// second physical key that satisfies the same air-roll/powerslide modifier.

/** A KB&M-mode binding: either a KeyboardEvent.code or a MouseEvent.button. */
export type KeyOrMouseBinding =
  | { readonly kind: "key"; readonly code: string }
  | { readonly kind: "mouse"; readonly button: number };

export interface KeyboardMouseBindings {
  // key-only actions (KeyboardEvent.code values):
  accelerate: string;
  reverse: string;
  steerLeft: string;
  steerRight: string;
  pitchNoseDown: string;
  pitchNoseUp: string;
  yawLeft: string;
  yawRight: string;
  airRollModifierPrimary: string;
  airRollModifierSecondary: string;
  powerslide: string; // NEW distinct action (default ShiftLeft, replacing the loose consts)
  ballCamera: string;
  scoreboard: string;
  pause: string;
  // key-OR-mouse actions (defaults: mouse 2 / 0 / 1 — today's behaviour). Union
  // because "all controls rebindable" must include the common "jump on a key"
  // case; a mouse-only slot would silently forbid it.
  jump: KeyOrMouseBinding;
  boost: KeyOrMouseBinding;
  rearView: KeyOrMouseBinding;
}

export interface GamepadBindings {
  // button indices (existing shape, unchanged keys)
  accelerateButton: number;
  reverseButton: number;
  airRollModifierButton: number;
  jumpButton: number;
  boostButton: number;
  powerslideButton: number;
  ballCameraButton: number;
  scoreboardButton: number;
  pauseButton: number;
  rearViewButton: number;
}

export interface ControlBindings {
  keyboardMouse: KeyboardMouseBindings;
  gamepad: GamepadBindings;
}

export const DEFAULT_CONTROL_BINDINGS: ControlBindings = {
  keyboardMouse: {
    accelerate: DEFAULT_KEYBOARD_BINDINGS.accelerate,
    reverse: DEFAULT_KEYBOARD_BINDINGS.reverse,
    steerLeft: DEFAULT_KEYBOARD_BINDINGS.steerLeft,
    steerRight: DEFAULT_KEYBOARD_BINDINGS.steerRight,
    pitchNoseDown: DEFAULT_KEYBOARD_BINDINGS.pitchNoseDown,
    pitchNoseUp: DEFAULT_KEYBOARD_BINDINGS.pitchNoseUp,
    yawLeft: DEFAULT_KEYBOARD_BINDINGS.yawLeft,
    yawRight: DEFAULT_KEYBOARD_BINDINGS.yawRight,
    airRollModifierPrimary: DEFAULT_KEYBOARD_BINDINGS.airRollModifierPrimary,
    airRollModifierSecondary: DEFAULT_KEYBOARD_BINDINGS.airRollModifierSecondary,
    powerslide: POWERSLIDE_KEYBOARD_BINDING,
    ballCamera: DEFAULT_KEYBOARD_BINDINGS.ballCamera,
    scoreboard: DEFAULT_KEYBOARD_BINDINGS.scoreboard,
    pause: DEFAULT_KEYBOARD_BINDINGS.pause,
    jump: { kind: "mouse", button: DEFAULT_MOUSE_BINDINGS.jump },
    boost: { kind: "mouse", button: DEFAULT_MOUSE_BINDINGS.boost },
    rearView: { kind: "mouse", button: DEFAULT_MOUSE_BINDINGS.rearView }
  },
  gamepad: {
    accelerateButton: DEFAULT_GAMEPAD_BINDINGS.accelerateButton,
    reverseButton: DEFAULT_GAMEPAD_BINDINGS.reverseButton,
    // Gamepad air-roll semantic trap (R10): the previous "default" of
    // leftTrigger was never actually consumed — buildLogicalStateFromGamepad
    // deliberately read powerslideButton (west) for the air-roll modifier so
    // braking mid-air wouldn't turn stick input into roll (see the in-code
    // comment preserved in InputControlsModule). If the rebind UI showed and
    // rebound the unused leftTrigger entry, the binding would appear dead.
    // The default now matches what is actually consumed: west (same value
    // as powerslideButton). Duplicate values across actions are legal.
    airRollModifierButton: STANDARD_GAMEPAD_BUTTONS.west,
    jumpButton: DEFAULT_GAMEPAD_BINDINGS.jumpButton,
    boostButton: DEFAULT_GAMEPAD_BINDINGS.boostButton,
    powerslideButton: DEFAULT_GAMEPAD_BINDINGS.powerslideButton,
    ballCameraButton: DEFAULT_GAMEPAD_BINDINGS.ballCameraButton,
    scoreboardButton: DEFAULT_GAMEPAD_BINDINGS.scoreboardButton,
    pauseButton: DEFAULT_GAMEPAD_BINDINGS.pauseButton,
    rearViewButton: DEFAULT_GAMEPAD_BINDINGS.rearViewButton
  }
};
