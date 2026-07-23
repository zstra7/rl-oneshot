/** Rocket-League-style defaults (input spec section 7). */
export const DEFAULT_KEYBOARD_BINDINGS = {
  accelerate: "KeyW",
  reverse: "KeyS",
  steerLeft: "KeyA",
  steerRight: "KeyD",

  pitchNoseDown: "KeyW",
  pitchNoseUp: "KeyS",
  yawLeft: "KeyA",
  yawRight: "KeyD",

  airRollModifierPrimary: "ShiftLeft",
  airRollModifierSecondary: "ShiftRight",

  ballCamera: "Space",
  scoreboard: "Tab",
  pause: "Escape",

  uiUp: "ArrowUp",
  uiDown: "ArrowDown",
  uiLeft: "ArrowLeft",
  uiRight: "ArrowRight",
  uiConfirm: "Enter",
  uiConfirmAlt: "Space",
  uiCancel: "Escape",
  uiTabLeft: "KeyQ",
  uiTabRight: "KeyE"
} as const;

/** Standard DOM MouseEvent.button values: 0=LMB, 1=MMB, 2=RMB. */
export const DEFAULT_MOUSE_BINDINGS = {
  boost: 0,
  rearView: 1,
  jump: 2
} as const;

/** Powerslide / normal air roll share the same physical key by default. */
export const POWERSLIDE_KEYBOARD_BINDING = "ShiftLeft";
export const POWERSLIDE_KEYBOARD_BINDING_ALT = "ShiftRight";

/**
 * Gamepad standard mapping button indices (input spec section 10) and the
 * modern default action mapping (section 9.1). Normal Air Roll deliberately
 * shares leftTrigger with reverse/brake, not a face button.
 */
export const STANDARD_GAMEPAD_BUTTONS = {
  south: 0,
  east: 1,
  west: 2,
  north: 3,
  leftBumper: 4,
  rightBumper: 5,
  leftTrigger: 6,
  rightTrigger: 7,
  select: 8,
  start: 9,
  leftStickClick: 10,
  rightStickClick: 11,
  dpadUp: 12,
  dpadDown: 13,
  dpadLeft: 14,
  dpadRight: 15,
  home: 16
} as const;

export const STANDARD_GAMEPAD_AXES = {
  leftX: 0,
  leftY: 1,
  rightX: 2,
  rightY: 3
} as const;

export const DEFAULT_GAMEPAD_BINDINGS = {
  accelerateButton: STANDARD_GAMEPAD_BUTTONS.rightTrigger,
  reverseButton: STANDARD_GAMEPAD_BUTTONS.leftTrigger,
  airRollModifierButton: STANDARD_GAMEPAD_BUTTONS.leftTrigger,
  jumpButton: STANDARD_GAMEPAD_BUTTONS.south,
  boostButton: STANDARD_GAMEPAD_BUTTONS.east,
  powerslideButton: STANDARD_GAMEPAD_BUTTONS.west,
  ballCameraButton: STANDARD_GAMEPAD_BUTTONS.north,
  scoreboardButton: STANDARD_GAMEPAD_BUTTONS.leftBumper,
  pauseButton: STANDARD_GAMEPAD_BUTTONS.start,
  rearViewButton: STANDARD_GAMEPAD_BUTTONS.rightStickClick
} as const;

export const GAMEPAD_TRIGGER_ACTIVATION_THRESHOLD = 0.1;
