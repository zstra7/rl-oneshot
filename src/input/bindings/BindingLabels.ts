import type { KeyOrMouseBinding } from "@/input/bindings/BindingsConfig";
import { STANDARD_GAMEPAD_BUTTONS } from "@/input/bindings/DefaultBindings";

/**
 * F11: device-aware binding-to-label formatting, extracted verbatim out of
 * `SettingsPanel.vue` (R10.4's rebindable-controls list) so both the
 * settings panel and the ball-cam HUD indicator (F11) share one
 * implementation. SettingsPanel imports these instead of defining its own
 * copies — no behaviour change there.
 */

const KEY_LABELS: Record<string, string> = {
  ShiftLeft: "LSHIFT",
  ShiftRight: "RSHIFT",
  ControlLeft: "LCTRL",
  ControlRight: "RCTRL",
  AltLeft: "LALT",
  AltRight: "RALT",
  Space: "SPACE",
  Escape: "ESC",
  Tab: "TAB",
  Enter: "ENTER",
  ArrowUp: "UP",
  ArrowDown: "DOWN",
  ArrowLeft: "LEFT",
  ArrowRight: "RIGHT"
};

/** `KeyW` -> `W`, `Digit1` -> `1`, known specials via `KEY_LABELS`, else the raw code uppercased. */
export function friendlyKeyLabel(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  return KEY_LABELS[code] ?? code.toUpperCase();
}

/** Mouse button index -> `LMB` / `MMB` / `RMB`, else `MOUSE n`. */
export function friendlyMouseLabel(button: number): string {
  const names: Record<number, string> = { 0: "LMB", 1: "MMB", 2: "RMB" };
  return names[button] ?? `MOUSE ${button}`;
}

const GAMEPAD_BUTTON_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(STANDARD_GAMEPAD_BUTTONS).map(([name, index]) => [index, name.toUpperCase()])
);

/** Gamepad button index -> `BTN n (NAME)` for standard-mapping buttons, else `BTN n`. */
export function friendlyGamepadLabel(button: number): string {
  return GAMEPAD_BUTTON_NAMES[button] ? `BTN ${button} (${GAMEPAD_BUTTON_NAMES[button]})` : `BTN ${button}`;
}

/** Union KB&M binding (jump/boost/rearView) -> key or mouse label depending on `kind`. */
export function friendlyKeyOrMouseLabel(binding: KeyOrMouseBinding): string {
  return binding.kind === "key" ? friendlyKeyLabel(binding.code) : friendlyMouseLabel(binding.button);
}
