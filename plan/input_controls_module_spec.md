# Input and Controls Module Specification

**Document version:** 1.0  
**Module ID:** `INPUT_CONTROLS`  
**Primary audience:** A Sonnet-level coding LLM implementing the module with minimal human intervention  
**Runtime:** Browser, local single-player versus AI  
**Language:** TypeScript  
**Supported input:** Keyboard, mouse, and standard game controllers  
**Control reference:** Rocket League modern Default preset  
**Physics dependency:** `PHYSICS_MODULE_CONTRACT_VERSION = "2.1"` or later  
**Visual/game-flow dependency:** `VISUAL_GAMEFLOW_CONTRACT_VERSION = "1.1"` or later  
**Automated browser testing:** Playwright Test with virtual gamepad injection  
**Human-controlled entity:** `car-player`  
**AI-controlled entity:** `car-opponent`  
**Primary gameplay output:** Normalised `CarInput`  
**Scope:** Raw device input, Rocket-League-style bindings, analogue processing, contextual controls, input edge retention, device switching, rebinding, prompts, focus handling, gamepad connection, haptics, menu navigation, persistence, diagnostics, and testing

---

# 0. Instructions to the Implementing LLM

Read the entire specification before modifying the project.

Follow these rules:

1. Implement input as a separate module.
2. Do not read browser keyboard, mouse, or gamepad state inside the physics controllers.
3. Do not let UI components directly mutate car controls.
4. Convert every supported device into the same logical action layer.
5. Convert logical actions into the shared `CarInput` contract.
6. Match Rocket League's modern Default bindings as closely as practical.
7. Do not silently use the older Legacy gamepad preset.
8. Keyboard and mouse together count as one input device family.
9. Support gamepads through the browser Gamepad API.
10. Use the Gamepad API's standard mapping where available.
11. Do not assume all connected controllers are Xbox controllers.
12. Display prompts matching the detected controller family.
13. Support Xbox, PlayStation, Nintendo-style, and generic prompts.
14. Do not require mouse movement for gameplay.
15. Mouse buttons are gameplay controls under the default keyboard/mouse preset.
16. Do not enable gameplay mouse-look by default.
17. Maintain exact press and release edges across render and physics rates.
18. Never lose a short jump press between physics ticks.
19. Never generate repeated jump presses from keyboard auto-repeat.
20. Clear dangerous held input when the page loses focus.
21. Neutralise input when the assigned controller disconnects.
22. Do not combine analogue axes from two different device families.
23. Do not allow stick drift to switch the active prompt device.
24. Keep input latency to at most the next 120 Hz physics tick after state capture.
25. Keep menu input and gameplay input contexts separate.
26. Do not prevent browser shortcuts globally.
27. Prevent default browser behaviour only while the game surface owns the relevant control.
28. Rebinding must detect conflicts.
29. Contextually compatible duplicate bindings are allowed.
30. Persist bindings and control settings using a versioned schema.
31. Validate persisted settings before use.
32. Expose a deterministic virtual-device test API.
33. Playwright quantitative tests must not depend on physical hardware.
34. Haptics are optional capability, never required for gameplay.
35. Do not fail if haptics are unavailable.
36. Input labels must remain understandable without controller images.
37. Preserve keyboard-only navigation throughout every UI screen.
38. Preserve mouse navigation throughout every UI screen.
39. Preserve controller navigation throughout every UI screen.
40. Record deliberate deviations in `docs/input-controls-deviations.md`.
41. Record control-feel calibration in `docs/input-calibration-log.md`.
42. The module is complete only when keyboard/mouse and gamepad both feel immediate and mechanically equivalent.

---

# 1. Module Goal

Create a robust browser input system that gives the human player Rocket-League-like control over the car using:

- Keyboard and mouse
- Xbox-style controllers
- PlayStation-style controllers
- Nintendo-style controllers where the browser exposes a usable mapping
- Generic standard-mapped controllers

The module must support:

- Driving
- Reversing and braking
- Ground steering
- Aerial pitch
- Aerial yaw
- Normal air roll
- Directional air roll bindings
- Jumping
- Dodging
- Boost
- Powerslide
- Ball-camera toggle
- Rear view
- Camera swivel
- Scoreboard
- Pause
- Menu navigation
- Settings rebinding

The same physical mechanics must be available on all input devices.

Device differences should affect control resolution, not available gameplay features.

---

# 2. Module Boundary

## 2.1 Input module owns

- Browser event listeners
- Gamepad polling
- Mouse button state
- Keyboard state
- Controller assignment
- Controller-family detection
- Raw device snapshots
- Binding resolution
- Input contexts
- Analogue deadzones
- Analogue sensitivity
- Trigger processing
- Button edge detection
- Keyboard aerial safety
- Ball-camera toggle requests
- Rear-view hold requests
- Camera-swivel values
- Scoreboard hold
- Pause requests
- UI navigation actions
- Active-device prompt selection
- Rebinding
- Binding conflicts
- Settings persistence
- Focus-loss safety
- Controller disconnection
- Haptic output
- Diagnostics and telemetry
- Virtual test devices

## 2.2 Input module does not own

- Car acceleration
- Car steering physics
- Jump impulses
- Dodge physics
- Boost consumption
- Camera position
- Ball-camera implementation
- Pause state
- Scoreboard rendering
- Menu screen state
- AI input decisions
- Match rules
- Audio playback

## 2.3 Output consumers

The physics module consumes:

```ts
CarInput
CarControlProfile
```

The camera module consumes:

```ts
CameraInput
```

The game-flow/UI modules consume:

```ts
UiInputFrame
SystemInputFrame
ActiveInputDevice
InputPromptProfile
```

The haptic module consumes presentation and physics events and writes only to supported gamepads.

---

# 3. Required Public API

```ts
export interface InputControlsModule {
  initialise(options: InputInitialisationOptions): void;
  dispose(): void;

  updateBrowserFrame(timestampMs: number): void;

  sampleGameplayInputForTick(
    tick: number,
    context: GameplayInputContext
  ): HumanGameplayInputFrame;

  sampleUiInput(): UiInputFrame;
  sampleSystemInput(): SystemInputFrame;

  setInputContext(context: InputContext): void;
  getInputContext(): InputContext;

  getActiveDevice(): ActiveInputDevice;
  getAssignedGamepad(): AssignedGamepad | null;
  assignGamepad(index: number | null): void;

  getBindings(): InputBindingConfiguration;
  setBinding(request: SetBindingRequest): BindingUpdateResult;
  resetBindings(preset?: BindingPresetId): void;

  getControlSettings(): ControlSettings;
  updateControlSettings(
    partial: DeepPartial<ControlSettings>
  ): void;

  getPromptProfile(): InputPromptProfile;

  playHapticEffect(effect: HapticEffectRequest): void;
  stopHaptics(): void;

  getDiagnostics(): InputDiagnostics;
}
```

Initialisation:

```ts
export interface InputInitialisationOptions {
  gameplayElement: HTMLElement;
  initialContext: InputContext;

  onActiveDeviceChanged?: (
    device: ActiveInputDevice
  ) => void;

  onGamepadConnectionChanged?: (
    event: GamepadConnectionStatus
  ) => void;
}
```

---

# 4. Core Data Contracts

## 4.1 Existing physics input

```ts
export interface CarInput {
  throttle: number;   // [-1, 1]
  steer: number;      // [-1, 1]

  pitch: number;      // [-1, 1]
  yaw: number;        // [-1, 1]
  roll: number;       // [-1, 1]

  jump: boolean;
  boost: boolean;
  powerslide: boolean;
}
```

## 4.2 Per-car control profile

The physics module must support control tuning per car rather than using one global human setting.

```ts
export interface CarControlProfile {
  dodgeDeadzone: number;
}
```

Human car:

```ts
{
  dodgeDeadzone: userSettings.dodgeDeadzone
}
```

AI car:

```ts
{
  dodgeDeadzone: aiControlProfile.dodgeDeadzone
}
```

Required integration change:

- Move dodge-deadzone interpretation from a global physics parameter to the controlled car's `CarControlProfile`.
- Do not make changing the player's dodge deadzone alter the opponent AI.
- Default human dodge deadzone is `0.8`.

## 4.3 Human gameplay frame

```ts
export interface HumanGameplayInputFrame {
  tick: number;

  car: CarInput;
  carControlProfile: CarControlProfile;

  camera: CameraInput;
  system: SystemInputFrame;

  sourceDevice: ActiveInputDevice;

  edges: {
    jumpPressed: boolean;
    jumpReleased: boolean;

    ballCameraPressed: boolean;
    pausePressed: boolean;
  };
}
```

## 4.4 Camera input

```ts
export interface CameraInput {
  toggleBallCameraPressed: boolean;

  rearViewHeld: boolean;

  swivelX: number;
  swivelY: number;

  resetSwivelPressed: boolean;
}
```

## 4.5 System input

```ts
export interface SystemInputFrame {
  scoreboardHeld: boolean;
  pausePressed: boolean;
  skipPresentationPressed: boolean;
}
```

## 4.6 UI input

```ts
export interface UiInputFrame {
  navigateX: -1 | 0 | 1;
  navigateY: -1 | 0 | 1;

  confirmPressed: boolean;
  cancelPressed: boolean;
  tabLeftPressed: boolean;
  tabRightPressed: boolean;

  pointerMoved: boolean;
  pointerPosition?: {
    x: number;
    y: number;
  };

  pointerPrimaryPressed: boolean;
  pointerSecondaryPressed: boolean;
}
```

---

# 5. Input Contexts

```ts
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
```

Context controls:

- Which bindings are evaluated
- Which browser defaults are prevented
- Whether gameplay input is neutral
- Whether UI navigation repeats
- Whether mouse pointer is visible
- Whether pause is accepted
- Whether binding capture owns the next input

Do not rely only on DOM focus to determine context.

---

# 6. Logical Action Layer

Use semantic actions.

```ts
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
```

UI actions:

```ts
export type UiAction =
  | "UI_UP"
  | "UI_DOWN"
  | "UI_LEFT"
  | "UI_RIGHT"
  | "UI_CONFIRM"
  | "UI_CANCEL"
  | "UI_TAB_LEFT"
  | "UI_TAB_RIGHT";
```

Physical bindings resolve into actions before context creates `CarInput`.

---

# 7. Rocket-League-Style Default Keyboard and Mouse Bindings

Use these defaults.

| Action | Default |
|---|---|
| Accelerate | W |
| Reverse / Brake | S |
| Steer left | A |
| Steer right | D |
| Pitch nose down | W |
| Pitch nose up | S |
| Yaw left | A |
| Yaw right | D |
| Jump | Right Mouse Button |
| Boost | Left Mouse Button |
| Powerslide | Left Shift |
| Normal Air Roll | Left Shift |
| Ball Camera | Space |
| Rear View | Middle Mouse Button |
| Scoreboard | Tab |
| Pause | Escape |
| Camera Swivel | Unbound by default |
| Air Roll Left | Unbound by default |
| Air Roll Right | Unbound by default |

Menu defaults:

| Action | Keyboard / Mouse |
|---|---|
| Navigate | Arrow keys or WASD |
| Confirm | Enter, Space, or primary click |
| Cancel / Back | Escape or secondary click |
| Tab left/right | Q / E |
| Pointer | Mouse movement |
| Activate | Left Mouse Button |

## 7.1 Contextual WASD behaviour

Grounded:

```text
W -> accelerate
S -> reverse/brake
A -> steer left
D -> steer right
```

Airborne:

```text
W -> positive throttle and pitch nose down
S -> negative throttle and pitch nose up
A -> yaw left
D -> yaw right
```

While normal Air Roll is held in air:

```text
A -> roll left
D -> roll right
W/S -> pitch remains available
Yaw from A/D is replaced by roll
```

Directional air roll bindings, if added, directly set roll and do not require the Air Roll modifier.

## 7.2 Mouse use

Gameplay:

```text
LMB -> boost
RMB -> jump
MMB -> rear view
```

Mouse movement:

- Controls the UI pointer.
- Does not move the gameplay camera under the default preset.
- Does not require pointer lock.
- Does not alter active gameplay prompts from minor movement alone.

Optional mouse camera swivel may be exposed as a custom binding later, but remains unbound by default.

## 7.3 Browser default suppression

While `GAMEPLAY` owns the game surface:

- Prevent context menu on RMB.
- Prevent middle-button autoscroll.
- Prevent Space from scrolling.
- Prevent Tab from changing DOM focus while used for scoreboard.
- Prevent browser text selection from drag.
- Prevent relevant key defaults only if the event target is not an editable field.

Do not suppress these globally in menus or settings.

---

# 8. Keyboard Aerial Safety

Default:

```ts
keyboardAerialSafetyEnabled = true;
```

Purpose:

A player holding W to accelerate before takeoff should not immediately pitch nose-down solely because the same key maps to aerial pitch.

## 8.1 Activation

Activate safety when:

```text
car changes from grounded to airborne
AND W is held
AND no deliberate aerial-orientation input has yet unlocked safety
```

## 8.2 Suppression

While active:

```text
W still produces forward air throttle.
W does not produce pitch nose-down.
```

## 8.3 Unlock conditions

Unlock when any occurs:

- W is released
- S is pressed
- Normal Air Roll is pressed
- Air Roll Left is pressed
- Air Roll Right is pressed
- A deliberate jump/dodge direction resolver explicitly marks aerial intent
- Match resets

Once unlocked for the current airborne period, do not re-enable until the car becomes grounded and leaves the ground again.

## 8.4 Settings

Allow:

```text
Keyboard Aerial Safety: On / Off
```

Do not apply this setting to gamepads.

---

# 9. Modern Default Gamepad Bindings

The project default mirrors Rocket League's modern `Default` preset.

## 9.1 Semantic gamepad table

| Action | Xbox | PlayStation | Nintendo |
|---|---|---|---|
| Accelerate | RT | R2 | ZR |
| Reverse / Brake | LT | L2 | ZL |
| Steer | Left Stick | Left Stick | Left Stick |
| Pitch / Yaw | Left Stick | Left Stick | Left Stick |
| Jump | A | Cross | B |
| Boost | B | Circle | A |
| Powerslide | X | Square | Y |
| Normal Air Roll | LT | L2 | ZL |
| Ball Camera | Y | Triangle | X |
| Camera Swivel | Right Stick | Right Stick | Right Stick |
| Rear View | Right Stick Click | R3 | Right Stick Click |
| Scoreboard | LB | L1 | L |
| Pause | Menu | Options | Plus |
| Air Roll Left | Unbound | Unbound | Unbound |
| Air Roll Right | Unbound | Unbound | Unbound |

The modern Default preset intentionally places normal Air Roll on LT/L2.

Do not map normal Air Roll to X/Square in the default preset.

A separate optional `LEGACY_COMPATIBILITY` preset may place Air Roll on X/Square, but it is not the default.

## 9.2 Contextual LT/L2 behaviour

Grounded:

```text
LT/L2 -> reverse or brake
```

Airborne:

```text
LT/L2 -> negative air throttle
LT/L2 -> normal Air Roll modifier
```

Both semantic actions may be active in air.

While normal Air Roll is held:

- Left-stick X controls roll.
- Left-stick Y continues to control pitch.
- Left-stick X no longer controls yaw.

## 9.3 Left-stick axes

Gamepad standard mapping:

```text
axis 0 -> left stick X
axis 1 -> left stick Y
```

Convert:

```ts
steer = +leftX;
yaw = +leftX;

// Browser up is normally negative.
pitchNoseDown = -leftY;
```

Confirm signs using explicit tests and debug labels.

## 9.4 Right-stick axes

```text
axis 2 -> right stick X
axis 3 -> right stick Y
```

Convert to camera swivel after deadzone and camera sensitivity.

---

# 10. Gamepad API Standard Mapping

Expected standard mapping:

```ts
const StandardGamepad = {
  buttons: {
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
  },

  axes: {
    leftX: 0,
    leftY: 1,
    rightX: 2,
    rightY: 3
  }
} as const;
```

## 10.1 Mapping requirements

If:

```ts
gamepad.mapping === "standard"
```

use the standard mapping.

If mapping is empty or nonstandard:

1. Check a known controller profile registry.
2. If a tested profile exists, use it.
3. Otherwise label it `Generic Controller`.
4. Offer binding capture.
5. Do not guess unsafe trigger/axis mappings silently.

## 10.2 Supported prompt families

```ts
export type ControllerPromptFamily =
  | "xbox"
  | "playstation"
  | "nintendo"
  | "generic";
```

Detection uses:

- `gamepad.id`
- `gamepad.mapping`
- Known vendor/product fragments
- User override

Prompt family affects labels only, not physics.

---

# 11. Controller Support Targets

Primary tested profiles:

- Xbox 360
- Xbox One
- Xbox Series X|S
- DualShock 4
- DualSense
- Generic standard-mapped controller

Best-effort:

- Nintendo Switch Pro Controller
- Steam Controller or Steam Input translated standard pad
- Other standard-mapped USB/Bluetooth controllers

Browser and operating-system support can vary.

The module must:

- Fail gracefully.
- Show a clear unsupported/nonstandard message.
- Always retain keyboard/mouse fallback.

---

# 12. Analogue Processing

## 12.1 Defaults

```ts
export const DEFAULT_ANALOGUE_SETTINGS = {
  controllerDeadzone: 0.20,
  dodgeDeadzone: 0.80,

  steeringSensitivity: 1.00,
  aerialSensitivity: 1.00,
  cameraSwivelSensitivity: 1.00,

  triggerDeadzone: 0.05,
  menuStickDeadzone: 0.55
};
```

`controllerDeadzone = 0.20` and `dodgeDeadzone = 0.80` mirror modern Rocket League defaults.

## 12.2 Radial deadzone

Apply a radial deadzone to each stick.

```ts
function applyRadialDeadzone(
  x: number,
  y: number,
  deadzone: number
): { x: number; y: number } {
  const magnitude = Math.hypot(x, y);

  if (magnitude <= deadzone) {
    return { x: 0, y: 0 };
  }

  const scaledMagnitude =
    (magnitude - deadzone) /
    (1 - deadzone);

  const scale =
    Math.min(1, scaledMagnitude) /
    magnitude;

  return {
    x: x * scale,
    y: y * scale
  };
}
```

Do not use independent square deadzones for the main stick.

## 12.3 Sensitivity

After deadzone:

```ts
processed = clamp(
  value * sensitivity,
  -1,
  1
);
```

Use separate:

- Steering sensitivity on grounded X
- Aerial sensitivity on airborne X/Y
- Camera sensitivity on right stick

Settings range:

```text
0.50–3.00
step 0.05
```

Default `1.00`.

## 12.4 Trigger processing

Gamepad APIs may expose triggers as:

- Button value `0–1`
- Axis `-1–1`
- Digital button only

Normalise to `0–1`.

```ts
function applyTriggerDeadzone(
  value: number,
  deadzone: number
): number {
  if (value <= deadzone) return 0;

  return clamp(
    (value - deadzone) /
    (1 - deadzone),
    0,
    1
  );
}
```

Throttle:

```ts
throttle =
  accelerateTrigger -
  reverseTrigger;
```

If both are fully held, result is `0`.

Ground brake/reverse interpretation remains physics-owned.

---

# 13. Dodge Deadzone

The dodge deadzone controls whether a second jump becomes:

- Neutral double jump
- Directional dodge

At second-jump press:

```ts
const directionalMagnitude =
  Math.hypot(
    currentPitchIntent,
    currentYawIntent
  );
```

```text
magnitude >= dodgeDeadzone -> directional dodge
magnitude < dodgeDeadzone -> neutral jump
```

Default:

```text
0.80
```

Keyboard direction values are digital magnitude `1`, so:

- Jump with no WASD direction -> neutral double jump
- Jump with any relevant direction -> directional dodge

The physics module applies the per-car `CarControlProfile`.

Do not apply the dodge deadzone continuously to ordinary aerial steering.

---

# 14. Air Roll Resolution

## 14.1 Normal Air Roll

When normal Air Roll is active:

```ts
roll = horizontalDirection;
yaw = 0;
```

Pitch remains available.

Keyboard:

```text
Shift + A -> roll left
Shift + D -> roll right
```

Controller:

```text
LT/L2 + left stick left/right -> roll
```

## 14.2 Directional Air Roll

Custom bindings:

```text
AIR_ROLL_LEFT
AIR_ROLL_RIGHT
```

Resolution:

```ts
directionalRoll =
  rightHeld ? 1 :
  leftHeld ? -1 :
  0;
```

Priority:

1. Directional Air Roll
2. Normal Air Roll modifier
3. Yaw

If both directional rolls are held:

```text
roll = 0
```

## 14.3 Ground behaviour

Air-roll actions do not rotate the car while grounded.

Powerslide is separate:

- Keyboard Shift can bind both because contexts are compatible.
- Controller LT Air Roll and X Powerslide remain different modern-default controls.

---

# 15. Binding Model

```ts
export interface InputBindingConfiguration {
  schemaVersion: number;
  presetId: BindingPresetId;

  keyboardMouse:
    Record<LogicalActionId, PhysicalBinding[]>;

  gamepad:
    Record<LogicalActionId, PhysicalBinding[]>;
}
```

Physical bindings:

```ts
export type PhysicalBinding =
  | KeyboardBinding
  | MouseButtonBinding
  | GamepadButtonBinding
  | GamepadAxisBinding
  | GamepadAxisDirectionBinding;
```

Examples:

```ts
{ type: "keyboard", code: "KeyW" }

{ type: "mouse-button", button: 2 }

{ type: "gamepad-button", index: 0 }

{
  type: "gamepad-axis-direction",
  axis: 0,
  direction: -1,
  threshold: 0.5
}
```

Use `KeyboardEvent.code`, not locale-dependent `key`, for gameplay bindings.

Display localised labels separately.

---

# 16. Binding Presets

```ts
export type BindingPresetId =
  | "ROCKET_DEFAULT"
  | "LEGACY_COMPATIBILITY"
  | "CUSTOM";
```

## 16.1 Rocket Default

This is the project default and follows the tables above.

## 16.2 Legacy Compatibility

Optional convenience preset:

- Controller Air Roll on X/Square
- Powerslide also on X/Square
- LT/L2 remains reverse only

Do not activate automatically for existing users unless they explicitly select it.

## 16.3 Custom

Any changed binding marks configuration `CUSTOM`.

Allow reset to Rocket Default.

---

# 17. Binding Conflicts

## 17.1 Conflict categories

```ts
type BindingConflict =
  | "NONE"
  | "HARD_CONFLICT"
  | "CONTEXT_COMPATIBLE"
  | "SYSTEM_RESERVED"
  | "UNSUPPORTED";
```

## 17.2 Compatible duplicates

Allow:

- W for accelerate and pitch nose down
- S for reverse and pitch nose up
- A/D for steer and aerial yaw
- Shift for powerslide and normal Air Roll
- LT/L2 for reverse and normal Air Roll
- Jump for optional skip presentation

These actions are contextually compatible.

## 17.3 Hard conflicts

Warn if one binding maps to incompatible simultaneous gameplay actions, such as:

- Jump and Boost
- Ball Camera and Jump
- Boost and Powerslide
- Air Roll Left and Air Roll Right
- Pause and continuous throttle

Offer:

```text
REPLACE
KEEP BOTH
CANCEL
```

`KEEP BOTH` may be disabled for unsafe conflicts.

## 17.4 Reserved browser inputs

Do not allow or warn for:

- F5
- Browser Back/Forward shortcuts
- Meta/Command system shortcuts
- Alt+Tab
- OS-reserved combinations

Single keys like Tab and Space are allowed in gameplay context.

---

# 18. Rebinding Flow

1. User selects action.
2. Enter `REBIND_CAPTURE`.
3. Ignore the input used to open capture until released.
4. Display `PRESS A KEY OR BUTTON`.
5. Capture next meaningful eligible input.
6. For axes, require threshold crossing from neutral.
7. Detect conflicts.
8. Confirm or cancel.
9. Persist on success.
10. Return to previous focus.

Timeout:

```text
10 seconds
```

Escape/cancel exits without change.

For analogue actions:

- Capture entire stick axis, not one accidental noisy direction, where appropriate.
- Trigger capture requires value above `0.6`.

---

# 19. Active Device Selection

```ts
export type ActiveInputDevice =
  | { family: "keyboard-mouse" }
  | {
      family: "gamepad";
      gamepadIndex: number;
      promptFamily: ControllerPromptFamily;
    };
```

## 19.1 Switching rules

Keyboard/mouse becomes active when:

- Gameplay key pressed
- Gameplay mouse button pressed
- Meaningful UI pointer click
- Meaningful menu key pressed

Gamepad becomes active when:

- Button pressed
- Trigger exceeds `0.25`
- Stick magnitude exceeds `0.35`
- D-pad pressed

Do not switch active device because of:

- Stick drift under threshold
- Mouse movement during gameplay
- Haptic output
- Controller enumeration

## 19.2 Hysteresis

After switching:

```text
Prompt-family lock: 250 ms
```

A direct button press from another device may override immediately.

## 19.3 Input merging

Keyboard and mouse merge into one family.

Do not sum keyboard/mouse and gamepad axes.

Gameplay uses the currently active device family.

Exception:

- Pause may be accepted from either family.
- Mouse clicks remain accepted in menus.
- Safety cancellation may be accepted from any device.

---

# 20. Gamepad Assignment

Only one human player exists.

The opponent is AI.

## 20.1 Assignment

Default:

- First meaningfully used connected gamepad becomes assigned.
- User can select another controller in Settings.
- Keyboard/mouse is always available.

## 20.2 Multiple controllers

Show:

```text
CONTROLLER 1 — Xbox Controller
CONTROLLER 2 — DualSense
```

Only assigned controller controls the car.

Unassigned controllers may:

- Navigate the main menu only if no assignment exists
- Press a join/assign action in settings
- Not affect gameplay

## 20.3 Reconnect

Store:

- Last gamepad ID string
- Prompt-family override
- Last assignment preference

Gamepad indices can change.

Attempt match by:

1. Exact prior ID
2. Prompt family plus mapping
3. First meaningful input

---

# 21. Gamepad Connection and Disconnection

Listen for:

```text
gamepadconnected
gamepaddisconnected
```

Also poll `navigator.getGamepads()` because event reliability varies.

On disconnect of assigned gamepad during gameplay:

1. Neutralise all gamepad gameplay actions immediately.
2. Stop haptics.
3. Preserve keyboard/mouse fallback.
4. Display a nonblocking `CONTROLLER DISCONNECTED` overlay.
5. Pause by default after 250 ms unless keyboard/mouse input takes control.
6. Allow reconnect or switch device.

Never leave throttle, boost, or steering stuck.

---

# 22. Keyboard Event Handling

Use:

```text
keydown
keyup
blur
visibilitychange
```

Store by `KeyboardEvent.code`.

Ignore auto-repeat for edge actions:

```ts
if (event.repeat) {
  updateHeldStateIfNeeded();
  doNotGeneratePressedEdge();
}
```

On keyup:

- Clear held state.
- Generate release edge once.

Do not use text character values for car control.

Editable fields:

```text
INPUT
TEXTAREA
SELECT
contenteditable
```

When focused, gameplay keys must not be intercepted unless explicit capture mode owns them.

---

# 23. Mouse Event Handling

Use:

```text
pointerdown
pointerup
pointermove
pointercancel
contextmenu
wheel
blur
```

Prefer Pointer Events.

Button indices:

```text
0 = primary / LMB
1 = middle / MMB
2 = secondary / RMB
```

On `pointercancel` or blur:

- Clear all mouse buttons.
- Release rear view.
- Release boost.
- Release jump held state.
- Do not fabricate another press edge.

Capture pointer on gameplay mousedown only if it improves reliable button release.

Do not request pointer lock by default.

---

# 24. Gamepad Polling

Gamepad state is polled.

Recommended:

1. Poll once before each browser-frame fixed-step loop.
2. Timestamp raw snapshot.
3. Resolve assigned gamepad.
4. Generate button edges.
5. Store a stable logical snapshot.
6. All physics catch-up ticks in that browser frame may consume the same held values.
7. Press edges are consumed only once.

For deterministic tests, bypass `navigator.getGamepads()` through the virtual adapter.

---

# 25. Edge Retention

Browser input may happen between 120 Hz ticks.

Maintain an edge queue.

```ts
interface ActionEdge {
  sequence: number;
  action: LogicalActionId;
  kind: "pressed" | "released";
  timestampMs: number;
  source: ActiveInputDevice;
  consumedByPhysicsTick: number | null;
}
```

Rules:

- A press edge persists until the next eligible physics tick consumes it.
- A held action remains true until release.
- One physical press creates one logical press edge.
- Catch-up ticks do not repeat the same press.
- Context-disabled actions may be discarded or retained according to explicit policy.

Jump:

- Never retain through countdown into GO.
- Never buffer from pause into resume.
- Clear at kickoff reset.

Ball-camera toggle:

- Consume once per press.

Pause:

- Consume once at application level.

---

# 26. Input Sampling and Latency

Target:

```text
Captured input affects the next available 120 Hz physics tick.
```

Do not intentionally add buffering in local mode.

Pipeline:

```text
Browser event / gamepad poll
-> raw state
-> binding resolver
-> logical state
-> context resolver
-> analogue processing
-> edge queue
-> fixed-tick sample
-> CarInput
```

Measure:

```text
event timestamp
to
physics tick where action first appears
```

Normal target:

```text
<= 1 physics tick plus browser scheduling
```

---

# 27. CarInput Resolution

Conceptual:

```ts
function buildCarInput(
  logical: LogicalGameplayState,
  context: CarContext
): CarInput {
  const grounded = context.grounded;

  const throttle =
    logical.accelerate -
    logical.reverse;

  let steer = 0;
  let pitch = 0;
  let yaw = 0;
  let roll = 0;

  if (grounded) {
    steer =
      logical.steerRight -
      logical.steerLeft;
  } else {
    pitch =
      logical.pitchNoseDown -
      logical.pitchNoseUp;

    const horizontal =
      logical.yawRight -
      logical.yawLeft;

    if (logical.airRollRight) {
      roll = 1;
    } else if (logical.airRollLeft) {
      roll = -1;
    } else if (logical.airRollModifier) {
      roll = horizontal;
    } else {
      yaw = horizontal;
    }
  }

  return {
    throttle,
    steer,
    pitch,
    yaw,
    roll,

    jump: logical.jumpHeld,
    boost: logical.boostHeld,
    powerslide:
      grounded &&
      logical.powerslideHeld
  };
}
```

Apply keyboard aerial safety before returning pitch.

Do not zero aerial yaw merely because the car is near the ground; use authoritative grounded/context state supplied by physics.

---

# 28. Ball Camera

Default:

```text
Toggle mode
```

Input module emits:

```ts
toggleBallCameraPressed
```

Camera module owns current ball-camera state.

Rules:

- Toggle on press edge.
- Holding does not retrigger.
- Kickoff reset preserves current ball-camera preference unless game design later specifies otherwise.
- Menus do not toggle it.
- Rebinding supported.

Optional setting:

```text
Ball Camera Behaviour:
Toggle / Hold
```

Default: Toggle.

Hold mode emits:

```ts
ballCameraHeld
```

Camera integration may extend `CameraInput` accordingly.

---

# 29. Rear View

Rear view is a hold action.

Keyboard/mouse default:

```text
Middle Mouse Button
```

Gamepad default:

```text
Right Stick Click
```

Camera module:

- Activates while held.
- Returns when released.
- Rear view may override ball-camera framing temporarily.
- Does not alter stored ball-camera toggle state.

---

# 30. Camera Swivel

Gamepad default:

```text
Right Stick
```

Mouse/keyboard default:

```text
Unbound
```

Apply:

- Radial deadzone
- Camera sensitivity
- Optional Y inversion

```ts
camera.swivelX = processedRightX;
camera.swivelY =
  invertCameraY
    ? processedRightY
    : -processedRightY;
```

When released:

- Camera module smoothly returns according to camera settings.

Input module does not control camera return dynamics.

---

# 31. Scoreboard and Pause

Scoreboard:

- Hold action.
- Tab on keyboard.
- LB/L1/L on controller.
- Does not pause physics.
- Hidden on release.

Pause:

- Escape on keyboard.
- Menu/Options/Plus on controller.
- Press edge only.
- Accepted during allowed match states.
- Game-flow decides whether pause is valid.

When paused:

- Clear gameplay edges.
- Held gameplay actions are neutral.
- UI controls become active.
- Resume requires a fresh input press.
- Do not resume into held boost or throttle.

---

# 32. UI Navigation

Keyboard:

- Arrow keys
- WASD
- Enter/Space confirm
- Escape back
- Q/E tab navigation

Gamepad:

- D-pad
- Left stick
- South button confirm
- East button back
- LB/RB tab navigation

Mouse:

- Pointer hover
- Primary click confirm
- Secondary click back where appropriate
- Wheel optional list scroll

## 32.1 Analogue menu repeat

Initial direction press:

```text
Immediate navigation
```

Held repeat:

```text
Initial delay: 350 ms
Repeat interval: 110 ms
```

D-pad uses digital repeat.

Stick requires:

```text
magnitude >= 0.55
```

Direction must return below `0.35` before a new immediate press, unless repeat timer fires.

---

# 33. Input Prompt System

```ts
export interface InputPromptProfile {
  activeDevice: ActiveInputDevice;

  labels:
    Record<LogicalActionId, string>;

  iconFamily:
    "keyboard-mouse" |
    ControllerPromptFamily;
}
```

Examples:

```text
Jump: RMB
Jump: A
Jump: Cross
Jump: B
```

Prompts update when active device changes.

Do not flicker prompts from stick drift.

All icon prompts must also include accessible text.

---

# 34. Control Settings

```ts
export interface ControlSettings {
  schemaVersion: number;

  controllerDeadzone: number;
  dodgeDeadzone: number;

  steeringSensitivity: number;
  aerialSensitivity: number;
  cameraSwivelSensitivity: number;

  triggerDeadzone: number;
  menuStickDeadzone: number;

  invertCameraY: boolean;

  keyboardAerialSafetyEnabled: boolean;

  ballCameraBehaviour: "toggle" | "hold";

  vibrationMode:
    | "disabled"
    | "default"
    | "all";

  vibrationIntensity: number;

  preferredPromptFamily:
    | "auto"
    | ControllerPromptFamily;

  preferredGamepadId: string | null;
}
```

Defaults:

```ts
export const DEFAULT_CONTROL_SETTINGS: ControlSettings = {
  schemaVersion: 1,

  controllerDeadzone: 0.20,
  dodgeDeadzone: 0.80,

  steeringSensitivity: 1.00,
  aerialSensitivity: 1.00,
  cameraSwivelSensitivity: 1.00,

  triggerDeadzone: 0.05,
  menuStickDeadzone: 0.55,

  invertCameraY: false,

  keyboardAerialSafetyEnabled: true,

  ballCameraBehaviour: "toggle",

  vibrationMode: "default",
  vibrationIntensity: 1.00,

  preferredPromptFamily: "auto",
  preferredGamepadId: null
};
```

---

# 35. Persistence

Storage keys:

```ts
controlsSettingsKey =
  "space-carball-controls-settings-v1";

controlsBindingsKey =
  "space-carball-control-bindings-v1";
```

Persist:

- Settings
- Custom keyboard/mouse bindings
- Custom gamepad bindings
- Prompt override
- Preferred controller ID
- Preset ID

Do not persist:

- Current held state
- Active press edges
- Assigned transient gamepad index
- Current ball-camera state unless a later camera setting requires it

Validate:

- Schema version
- Number ranges
- Known action IDs
- Known binding types
- Maximum binding count
- No malformed arrays

On corruption:

1. Log diagnostic warning.
2. Preserve unrelated valid settings where safe.
3. Fall back to Rocket Default bindings.
4. Never prevent game startup.

---

# 36. Haptics

Haptics are presentation feedback.

Use:

```ts
gamepad.vibrationActuator
```

or supported haptic actuator APIs.

Capability varies by browser/controller.

## 36.1 Modes

Disabled:

- No haptics.

Default:

- Impact
- Boost activation
- Goal explosion

All:

- Default events
- Continuous low boost vibration
- Jump/dodge feedback
- Boost-pad pickup feedback
- Additional strong collision detail

## 36.2 Default event clips

```ts
interface HapticClip {
  durationMs: number;
  strongMagnitude: number;
  weakMagnitude: number;
  priority: number;
}
```

Suggested:

| Event | Duration | Strong | Weak |
|---|---:|---:|---:|
| Boost activation | 45 ms | 0.15 | 0.30 |
| Gentle impact | 35 ms | 0.20 | 0.15 |
| Strong ball hit | 70 ms | 0.45 | 0.35 |
| Car-car impact | 80 ms | 0.55 | 0.35 |
| Goal explosion | 180 ms | 0.75 | 0.65 |

Scale by user intensity.

## 36.3 Haptic mixer

- Higher priority may replace lower priority.
- Avoid issuing effects every physics tick.
- Continuous boost in `all` mode is refreshed at bounded intervals.
- Stop on pause, disconnect, blur, or device switch.
- Never throw if actuator promise rejects.

---

# 37. Focus and Visibility Safety

Listen for:

```text
window.blur
document.visibilitychange
pointercancel
```

On focus loss:

1. Clear all held keyboard keys.
2. Clear mouse buttons.
3. Neutralise gamepad snapshot until next poll.
4. Clear unconsumed gameplay edges.
5. Stop haptics.
6. Request pause if a match is active.
7. Preserve settings and bindings.

On return:

- Require fresh input.
- Do not restore old held controls.
- Do not immediately activate boost from a physically held key until a new event/poll confirms state according to policy.

Recommended gamepad policy:

- Read current state on return.
- Treat currently held buttons as held but generate no press edge until released and pressed again.

---

# 38. Device Switching During Gameplay

Keyboard/mouse to controller:

- Meaningful controller action switches active source.
- Current keyboard-held gameplay values are ignored.
- Their held state remains tracked but cannot reassert until meaningful keyboard/mouse input switches back.
- Clear incompatible edge queues.

Controller to keyboard/mouse:

- Meaningful key or mouse button switches.
- Gamepad axes are ignored.
- Haptics stop or remain on assigned controller according to setting; default stop on switch.

Pause is accepted from both.

Do not blend throttle from controller with steering from keyboard by default.

Optional mixed-input mode is deferred.

---

# 39. Input Diagnostics

```ts
export interface InputDiagnostics {
  context: InputContext;

  activeDevice: ActiveInputDevice;
  assignedGamepad: AssignedGamepad | null;

  rawKeyboardHeld: string[];
  rawMouseButtonsHeld: number[];

  rawGamepad?: {
    id: string;
    mapping: string;
    axes: number[];
    buttons: Array<{
      pressed: boolean;
      touched: boolean;
      value: number;
    }>;
  };

  processed: {
    leftStick: { x: number; y: number };
    rightStick: { x: number; y: number };
    accelerateTrigger: number;
    reverseTrigger: number;
  };

  logicalActions:
    Record<LogicalActionId, LogicalActionState>;

  pendingEdges: ActionEdge[];

  output: HumanGameplayInputFrame;

  settings: ControlSettings;

  warnings: string[];
}
```

---

# 40. Input Debug Overlay

Display:

- Active device
- Assigned gamepad
- Prompt family
- Input context
- Raw left/right stick
- Deadzone circles
- Processed axes
- Trigger values
- Current logical actions
- Current `CarInput`
- Jump press/release edge
- Dodge-direction magnitude
- Dodge deadzone
- Air-roll resolution
- Keyboard aerial-safety state
- Edge queue
- Haptic capability
- Last device-switch reason

The debug overlay is not post-processed.

---

# 41. Browser Test API

Expose in development/test builds:

```ts
declare global {
  interface Window {
    __INPUT_TEST__?: BrowserInputTestApi;
  }
}
```

Required:

```ts
export interface BrowserInputTestApi {
  ready(): boolean;

  reset(): void;

  setContext(context: InputContext): void;

  injectKeyboardEvent(
    event: VirtualKeyboardEvent
  ): void;

  injectMouseEvent(
    event: VirtualMouseEvent
  ): void;

  connectVirtualGamepad(
    gamepad: VirtualGamepadDefinition
  ): number;

  disconnectVirtualGamepad(
    index: number
  ): void;

  setVirtualGamepadState(
    index: number,
    state: VirtualGamepadState
  ): void;

  assignGamepad(index: number | null): void;

  sampleTick(
    context: GameplayInputContext
  ): HumanGameplayInputFrame;

  getBindings(): InputBindingConfiguration;
  setBinding(request: SetBindingRequest): BindingUpdateResult;
  resetBindings(preset?: BindingPresetId): void;

  getSettings(): ControlSettings;
  setSettings(
    partial: DeepPartial<ControlSettings>
  ): void;

  simulateBlur(): void;
  simulateVisibilityHidden(): void;

  getDiagnostics(): InputDiagnostics;
  getHapticLog(): HapticLogEntry[];
  clearHapticLog(): void;
}
```

Virtual gamepad input must use the same processing pipeline as real gamepads after the raw-device adapter.

---

# 42. Virtual Gamepad

```ts
export interface VirtualGamepadDefinition {
  id: string;
  mapping: "standard" | "";
  promptFamily: ControllerPromptFamily;
  axesCount: number;
  buttonCount: number;
  hapticsSupported: boolean;
}
```

```ts
export interface VirtualGamepadState {
  connected: boolean;
  timestamp: number;

  axes: number[];

  buttons: Array<{
    pressed: boolean;
    touched: boolean;
    value: number;
  }>;
}
```

Do not monkeypatch browser internals inside each test.

Use a single dependency-injected `GamepadProvider`:

```ts
export interface GamepadProvider {
  getGamepads(): readonly GamepadLike[];
}
```

Production uses browser provider.

Tests use virtual provider.

---

# 43. Playwright Default-Binding Tests

## 43.1 Keyboard driving

Inject:

```text
W held
```

Assert:

```text
throttle = 1
steer = 0
```

Inject W+D:

```text
throttle = 1
steer = 1
```

Inject S:

```text
throttle = -1
```

## 43.2 Mouse actions

LMB:

```text
boost = true
```

RMB press:

```text
jump pressed once
jump held true
```

MMB:

```text
rearViewHeld = true
```

## 43.3 Keyboard aerial actions

Airborne:

```text
W -> pitch nose down after aerial safety unlock
S -> pitch nose up
A -> yaw left
D -> yaw right
```

Shift+A:

```text
roll left
yaw zero
```

Shift+D:

```text
roll right
yaw zero
```

## 43.4 Gamepad driving

Standard virtual gamepad:

```text
button 7 RT = 1 -> throttle 1
button 6 LT = 1 -> throttle -1 on ground
axis 0 = 1 -> steer right
```

## 43.5 Controller buttons

```text
button 0 -> jump
button 1 -> boost
button 2 -> powerslide
button 3 -> ball-camera edge
button 4 -> scoreboard
button 9 -> pause edge
button 11 -> rear view
```

## 43.6 Modern Air Roll

Airborne:

```text
LT held
left stick X = -1
```

Assert:

```text
roll = -1
yaw = 0
throttle includes reverse air throttle
```

Assert X/Square alone does not enable Air Roll in Rocket Default.

---

# 44. Playwright Analogue Tests

## 44.1 Controller deadzone

With deadzone 0.2:

```text
stick magnitude 0.19 -> output 0
stick magnitude 0.20 -> output 0
stick magnitude 0.60 -> scaled nonzero
stick magnitude 1.00 -> output 1
```

## 44.2 Radial direction

Use diagonal input.

Assert direction preserved after deadzone.

## 44.3 Sensitivity

At processed 0.5:

```text
sensitivity 1.0 -> 0.5
sensitivity 1.5 -> 0.75
sensitivity 3.0 -> clamp 1
```

## 44.4 Triggers

Assert:

- Deadzone
- Partial values
- Both-trigger subtraction
- Digital-only fallback

## 44.5 Dodge deadzone

At 0.79:

```text
neutral double jump intent
```

At 0.80:

```text
directional dodge intent
```

Use floating tolerance and exact project comparison rule.

---

# 45. Playwright Edge Tests

- A one-millisecond keyboard press between ticks is retained to next tick.
- One press creates one edge.
- Keyboard repeat does not create extra jump edges.
- Held jump remains true.
- Release creates one release edge.
- Multiple physics catch-up ticks consume press once.
- Ball-camera toggles once per press.
- Pause fires once.
- Countdown input does not leak into GO.
- Pause input does not leak into resume.
- Kickoff reset clears pending jump.

---

# 46. Playwright Device Tests

## Device switching

- Keyboard press activates KBM.
- Gamepad drift does not switch.
- Gamepad button switches to gamepad.
- Mouse movement during gameplay does not switch.
- Mouse click switches to KBM.
- Prompts update once.

## Multiple controllers

- Assigned pad controls car.
- Unassigned pad does not.
- Assignment changes safely.
- Indices changing on reconnect are handled.

## Disconnect

- Held throttle neutralised.
- Haptics stopped.
- Overlay event emitted.
- Pause requested.
- Keyboard remains usable.

## Nonstandard controller

- Unknown mapping does not silently control car.
- Rebind flow remains available.
- Generic labels shown.

---

# 47. Playwright Focus and Browser Tests

- Blur clears keyboard and mouse.
- Visibility hidden clears edges.
- Return requires fresh press edge.
- RMB context menu is prevented in gameplay.
- RMB works normally in settings text fields where appropriate.
- Space does not scroll gameplay page.
- Tab shows scoreboard without moving focus in gameplay.
- Tab navigates normally in accessible settings when scoreboard binding is inactive.
- MMB does not activate browser autoscroll in gameplay.
- Editable text fields receive ordinary typing.

---

# 48. Playwright Rebinding Tests

- Rebind Jump from RMB to Space.
- Old binding stops controlling Jump.
- New binding works.
- Configuration becomes Custom.
- Reset restores Rocket Default.
- Conflict warning appears.
- Compatible Shift Powerslide/Air Roll duplicate is allowed.
- Unsafe Jump/Boost duplicate is rejected or explicitly confirmed.
- Axis capture waits for neutral.
- Trigger capture requires threshold.
- Escape cancels capture.
- Timeout cancels capture.
- Persistence restores valid custom binding.
- Invalid persisted schema falls back safely.

---

# 49. Playwright UI Navigation Tests

Run every screen using:

- Keyboard only
- Mouse only
- Virtual Xbox controller
- Virtual PlayStation controller

Assert:

- Focus visible
- Navigation order stable
- Confirm works
- Cancel works
- Tabs work
- No inaccessible modal
- Rebind capture returns focus
- Pause menu can resume
- Results can replay or return
- Prompt family changes correctly

---

# 50. Haptic Tests

Using virtual actuator log:

Default mode:

- Boost activation emits one clip.
- Holding boost does not continuously emit.
- Strong impact emits scaled clip.
- Goal emits high-priority clip.
- Boost-pad collection does not emit unless design enables it under `all`.

All mode:

- Continuous boost refreshes at bounded interval.
- Jump/dodge may emit.
- Boost-pad pickup may emit.
- No effect exceeds intensity clamp.

Disabled:

- No effects logged.

Disconnect/blur/pause:

- Active effect stopped.

---

# 51. Input Performance Targets

Normal frame:

```text
Keyboard/mouse processing < 0.10 ms
Gamepad polling and processing < 0.20 ms
Binding resolution < 0.10 ms
```

Requirements:

- No large per-frame allocations
- Reuse snapshots
- Bound edge queue
- No DOM queries in hot gameplay path
- No JSON serialisation during normal play
- Diagnostics optional
- Haptic calls rate-limited

---

# 52. Input Telemetry

Development-only frame:

```ts
export interface InputTelemetryFrame {
  tick: number;
  timestampMs: number;

  context: InputContext;
  activeDevice: ActiveInputDevice;

  rawSummary: RawInputSummary;

  processed: {
    leftStick: Vec2Data;
    rightStick: Vec2Data;
    accelerate: number;
    reverse: number;
  };

  logical: LogicalGameplayState;

  carInput: CarInput;
  cameraInput: CameraInput;
  systemInput: SystemInputFrame;

  pendingEdgeCount: number;
  aerialSafetyActive: boolean;
}
```

Export JSON or CSV in debug lab.

Do not record raw keyboard text from editable inputs.

---

# 53. Calibration Workflow

Tune in this order:

1. Keyboard signs
2. Gamepad mapping
3. Trigger normalisation
4. Stick deadzone
5. Steering sensitivity
6. Aerial sensitivity
7. Dodge deadzone integration
8. Air Roll resolution
9. Keyboard aerial safety
10. Ball-camera and rear-view behaviour
11. Device switching
12. Menu repeat
13. Haptics

Loop:

```text
Run fixed input scenario
-> inspect raw and processed values
-> verify CarInput
-> drive/play manually
-> adjust one control setting
-> rerun Playwright regressions
-> record decision
```

Do not tune car physics to compensate for an input mapping bug.

---

# 54. Human Playtest Rubric

Rate 1–5.

Keyboard/mouse:

- Driving responds immediately.
- Jump and boost mouse buttons feel reliable.
- Shift Air Roll/Powerslide behaves predictably.
- Aerial safety prevents accidental nose-down input.
- Ball-camera toggle is reliable.
- Browser behaviour does not interfere.

Gamepad:

- Steering begins at expected stick movement.
- Partial trigger throttle feels useful.
- Jump/boost/powerslide are easy to reach.
- Modern LT/L2 Air Roll works correctly.
- Right-stick camera is smooth.
- No drift or prompt flicker.

Device handling:

- Switching devices is seamless.
- Disconnection is safe.
- Prompts are correct.
- Rebinding is understandable.
- Pause and menu controls are consistent.

Fairness/equivalence:

- KBM and gamepad can perform every required mechanic.
- Neither device receives hidden physics advantages.
- Differences arise only from digital versus analogue input.

---

# 55. Common Failure Modes

## Jump occasionally does not register

Check:

- No edge queue
- Edge consumed during render
- Key repeat handling
- Mouse pointer cancel
- Multiple catch-up ticks
- Context transition clearing too early

## Jump repeats unexpectedly

Check:

- `event.repeat`
- Press edge generated from held polling
- Edge not marked consumed
- Reconnect snapshot treated as new press

## Controller drifts

Check:

- Deadzone not radial
- Active-device threshold too low
- Browser mapping incorrect
- Controller needs user deadzone increase

## Gamepad prompts flicker

Check:

- Drift changes active device
- Mouse movement counts during gameplay
- No prompt hysteresis
- Multiple controllers competing

## Air Roll turns into yaw

Check:

- Modifier resolved after yaw
- Grounded state stale
- LT mapping missing
- Directional Air Roll priority incorrect

## Keyboard nose dives on every jump

Check:

- Aerial safety missing
- Ground-to-air transition not detected
- W suppression applied after pitch output
- Unlock condition always true

## Shift powerslide fails

Check:

- Shift captured by browser
- Input context wrong
- Powerslide suppressed while grounded
- Air Roll resolution incorrectly overrides ground action

## Right mouse opens context menu

Check:

- `contextmenu` not prevented on game surface
- Listener passive
- Event attached to wrong element

## Tab changes focus instead of showing scoreboard

Check:

- Gameplay ownership test
- Editable target exception
- Event prevention timing

## Controller reconnect leaves throttle held

Check:

- Old snapshot reused
- No release neutralisation
- Current held buttons generating press edges on reconnect

## Custom binding corrupts controls

Check:

- No schema validation
- Hard conflict accepted silently
- Physical binding duplicated incorrectly
- Preset ID not changed to Custom

---

# 56. Phased Implementation Plan

## Phase 0 — Contracts

Implement:

- Public types
- Input context
- Logical actions
- Module facade
- Test API
- Diagnostics

Exit:

- Module initialises and returns neutral input.

## Phase 1 — Keyboard and mouse defaults

Implement:

- Keyboard state
- Mouse buttons
- Rocket default mapping
- Browser-default suppression
- Edge queue
- Gameplay sampling

Tests:

- WASD
- LMB/RMB/MMB
- Space
- Shift
- Tab
- Escape

Exit:

- KBM can fully control the car.

## Phase 2 — Keyboard aerial behaviour

Implement:

- Air pitch/yaw
- Shift Air Roll
- Directional Air Roll custom bindings
- Keyboard aerial safety

Exit:

- Ground and air contexts resolve correctly.

## Phase 3 — Gamepad foundation

Implement:

- Gamepad provider
- Standard mapping
- Controller assignment
- Xbox/PlayStation/generic prompts
- Raw diagnostics

Exit:

- Standard virtual and physical gamepad produces correct raw states.

## Phase 4 — Gamepad controls

Implement:

- Triggers
- Left stick
- Right stick
- Buttons
- Modern LT/L2 Air Roll
- Ball camera
- Rear view
- Scoreboard
- Pause

Exit:

- Controller can perform full gameplay control set.

## Phase 5 — Analogue settings

Implement:

- Radial deadzone
- Sensitivities
- Trigger deadzone
- Dodge deadzone
- Per-car control profile integration

Exit:

- Analogue tests pass.
- Player settings do not alter AI controls.

## Phase 6 — Device management

Implement:

- Active-device selection
- Hysteresis
- Multiple controller selection
- Disconnect/reconnect
- Focus safety

Exit:

- No stuck inputs.
- Prompts remain stable.

## Phase 7 — UI navigation

Implement:

- Keyboard
- Mouse
- Controller
- Repeat timers
- Focus restoration
- Screen integration

Exit:

- Entire game navigable with each device family.

## Phase 8 — Rebinding

Implement:

- Capture mode
- Conflicts
- Presets
- Persistence
- Reset

Exit:

- Custom controls survive reload and fail safely on invalid data.

## Phase 9 — Haptics

Implement:

- Capability detection
- Modes
- Mixer
- Event bindings
- Intensity

Exit:

- Unsupported devices remain error-free.

## Phase 10 — Calibration and release testing

Run:

- Input latency tests
- Device matrix
- Focus tests
- Full match on KBM
- Full match on gamepad
- Rebinding regression
- Human playtest

Exit:

- Both primary device families average at least 4/5 for responsiveness and reliability.

---

# 57. Definition of Done

Architecture:

- [ ] Separate input module
- [ ] Logical action layer
- [ ] Input contexts
- [ ] Shared CarInput output
- [ ] Per-car control profile
- [ ] Virtual gamepad test adapter
- [ ] Diagnostics

Keyboard/mouse:

- [ ] WASD driving and aerial control
- [ ] RMB jump
- [ ] LMB boost
- [ ] Shift powerslide
- [ ] Shift Air Roll
- [ ] Space ball camera
- [ ] MMB rear view
- [ ] Tab scoreboard
- [ ] Escape pause
- [ ] Keyboard aerial safety
- [ ] Browser behaviour safely suppressed during gameplay

Gamepad:

- [ ] RT/R2 accelerate
- [ ] LT/L2 reverse
- [ ] Left-stick steer/pitch/yaw
- [ ] A/Cross jump
- [ ] B/Circle boost
- [ ] X/Square powerslide
- [ ] LT/L2 normal Air Roll
- [ ] Y/Triangle ball camera
- [ ] Right-stick camera
- [ ] R3 rear view
- [ ] LB/L1 scoreboard
- [ ] Menu/Options pause
- [ ] Prompt-family support

Analogue:

- [ ] Radial deadzone
- [ ] 0.20 default controller deadzone
- [ ] 0.80 default dodge deadzone
- [ ] Steering sensitivity
- [ ] Aerial sensitivity
- [ ] Camera sensitivity
- [ ] Trigger deadzone
- [ ] Correct dodge integration

Robustness:

- [ ] Edge retention
- [ ] No repeated auto-repeat presses
- [ ] Focus-loss neutralisation
- [ ] Controller disconnect neutralisation
- [ ] Device-switch hysteresis
- [ ] Multiple-controller assignment
- [ ] No stuck boost/throttle/jump

UI and settings:

- [ ] Keyboard navigation
- [ ] Mouse navigation
- [ ] Controller navigation
- [ ] Rebinding
- [ ] Conflict handling
- [ ] Presets
- [ ] Persistence
- [ ] Accessible text prompts

Haptics:

- [ ] Capability detection
- [ ] Disabled/default/all modes
- [ ] Intensity
- [ ] Impact/boost/goal effects
- [ ] Safe failure

Testing:

- [ ] Default-binding tests
- [ ] Analogue tests
- [ ] Edge tests
- [ ] Device-switch tests
- [ ] Disconnect tests
- [ ] Focus tests
- [ ] Rebinding tests
- [ ] UI navigation tests
- [ ] Haptic tests
- [ ] KBM full-match test
- [ ] Gamepad full-match test

---

# 58. Deferred Features

Do not block initial implementation on:

- Split-screen local multiplayer
- Two human-controlled cars
- Gyroscope steering
- Touch controls
- Mobile virtual controls
- Motion steering
- Racing wheels
- HOTAS devices
- Adaptive-trigger effects
- Steam Input-specific integration
- Controller speaker audio
- Per-device cloud profiles
- Input recording and replay
- Mixed gamepad-plus-keyboard gameplay mode
- Mouse gameplay camera swivel
- Advanced chorded bindings
- Macros
- Turbo input
- Rapid-fire accessibility features

---

# 59. Recommended Source Structure

```text
src/input/
├─ index.ts
├─ InputControlsModule.ts
├─ InputTypes.ts
├─ InputContext.ts
├─ LogicalActions.ts
├─ CarInputResolver.ts
├─ CameraInputResolver.ts
├─ UiInputResolver.ts
├─ InputEdgeQueue.ts
├─ ActiveDeviceController.ts
│
├─ keyboard/
│  ├─ KeyboardDevice.ts
│  ├─ KeyboardState.ts
│  └─ KeyboardAerialSafety.ts
│
├─ mouse/
│  ├─ MouseDevice.ts
│  └─ MouseState.ts
│
├─ gamepad/
│  ├─ GamepadDevice.ts
│  ├─ GamepadProvider.ts
│  ├─ BrowserGamepadProvider.ts
│  ├─ GamepadAssignment.ts
│  ├─ StandardGamepadMapping.ts
│  ├─ GamepadProfileRegistry.ts
│  ├─ ControllerFamilyDetection.ts
│  ├─ AnalogueProcessing.ts
│  └─ TriggerProcessing.ts
│
├─ bindings/
│  ├─ BindingTypes.ts
│  ├─ RocketDefaultBindings.ts
│  ├─ LegacyCompatibilityBindings.ts
│  ├─ BindingResolver.ts
│  ├─ BindingConflictDetector.ts
│  └─ RebindCapture.ts
│
├─ settings/
│  ├─ ControlSettings.ts
│  ├─ ControlSettingsStore.ts
│  ├─ BindingStore.ts
│  └─ InputSchemaMigration.ts
│
├─ prompts/
│  ├─ InputPromptProfile.ts
│  ├─ XboxPrompts.ts
│  ├─ PlayStationPrompts.ts
│  ├─ NintendoPrompts.ts
│  └─ GenericPrompts.ts
│
├─ haptics/
│  ├─ HapticController.ts
│  ├─ HapticMixer.ts
│  ├─ HapticEffects.ts
│  └─ HapticCapability.ts
│
├─ debug/
│  ├─ InputDiagnostics.ts
│  ├─ InputDebugOverlay.ts
│  └─ InputTelemetry.ts
│
└─ testing/
   ├─ BrowserInputTestApi.ts
   ├─ VirtualGamepadProvider.ts
   ├─ VirtualGamepad.ts
   └─ InputTestScenarios.ts
```

---

# 60. Reference Basis

The default bindings in this specification are based on Rocket League's documented/default control layout and modern Default preset behaviour:

- Keyboard/mouse defaults include W/S acceleration and reverse, A/D steering, right mouse jump, left mouse boost, Shift powerslide/air roll, Space ball camera, middle mouse rear view, and Tab scoreboard.
- Gamepad defaults include triggers for acceleration/reverse, left stick for steering and aerial direction, south face button for jump, east face button for boost, west face button for powerslide, north face button for ball camera, right stick for camera, right-stick click for rear view, and left bumper for scoreboard.
- Rocket League's modern Default preset moved normal Air Roll to L2/LT while the Legacy preset retained the older shared powerslide/air-roll face-button layout.
- Modern default controller deadzone is 0.2.
- Modern default dodge deadzone is 0.8.
- Default vibration behaviour is limited to impacts, boost activation, and explosions; an All mode may add continuous boost vibration.

This project implements those principles through browser APIs and its own original UI.

---

# 61. Final Architecture

```text
Keyboard events ───────┐
Mouse events ──────────┼─> Raw device adapters
Gamepad polling ───────┘
                              |
                              v
                    Active-device selection
                              |
                              v
                       Binding resolver
                              |
                              v
                     Logical action state
                              |
              +---------------+---------------+
              |               |               |
              v               v               v
       Gameplay context   Camera context   UI/system context
              |               |               |
              v               v               v
          CarInput        CameraInput      UiInputFrame
              |
              v
      Existing physics module
```

Rocket-style default control behaviour:

```text
Keyboard / Mouse:
WASD + RMB jump + LMB boost
+ Shift powerslide/air roll
+ Space ball camera
+ MMB rear view
+ Tab scoreboard

Controller:
Triggers drive/reverse
+ left stick movement
+ A/Cross jump
+ B/Circle boost
+ X/Square powerslide
+ LT/L2 air roll
+ Y/Triangle ball camera
+ right stick camera
```

The intended result is an immediate, reliable control system where:

- Keyboard/mouse and controllers are both complete.
- Device switching is safe.
- Browser behaviour does not interfere.
- Inputs are never lost between ticks.
- Analogue controls feel precise.
- The modern Rocket League Default layout is familiar.
- Rebinding remains flexible.
- Input code stays independent from physics, UI, and AI.
