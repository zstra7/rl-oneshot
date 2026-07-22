import { describe, expect, it } from "vitest";

import {
  DEFAULT_CONTROL_BINDINGS,
  type GamepadBindings,
  type KeyboardMouseBindings
} from "@/input/bindings/BindingsConfig";
import { STANDARD_GAMEPAD_BUTTONS } from "@/input/bindings/DefaultBindings";
import { DEFAULT_SETTINGS, validateSettings } from "@/stores/settingsStore";

const KBM_ACTION_KEYS: readonly (keyof KeyboardMouseBindings)[] = [
  "accelerate",
  "reverse",
  "steerLeft",
  "steerRight",
  "pitchNoseDown",
  "pitchNoseUp",
  "yawLeft",
  "yawRight",
  "airRollModifierPrimary",
  "airRollModifierSecondary",
  "powerslide",
  "ballCamera",
  "scoreboard",
  "pause",
  "jump",
  "boost",
  "rearView"
];

const GAMEPAD_ACTION_KEYS: readonly (keyof GamepadBindings)[] = [
  "accelerateButton",
  "reverseButton",
  "airRollModifierButton",
  "jumpButton",
  "boostButton",
  "powerslideButton",
  "ballCameraButton",
  "scoreboardButton",
  "pauseButton",
  "rearViewButton"
];

describe("DEFAULT_CONTROL_BINDINGS (R10.1)", () => {
  it("covers every keyboardMouse and gamepad action key", () => {
    for (const key of KBM_ACTION_KEYS) {
      expect(DEFAULT_CONTROL_BINDINGS.keyboardMouse[key]).toBeDefined();
    }
    for (const key of GAMEPAD_ACTION_KEYS) {
      expect(typeof DEFAULT_CONTROL_BINDINGS.gamepad[key]).toBe("number");
    }
    // Runtime snapshot: no extra/missing keys on either sub-object.
    expect(Object.keys(DEFAULT_CONTROL_BINDINGS.keyboardMouse).sort()).toEqual(
      [...KBM_ACTION_KEYS].sort()
    );
    expect(Object.keys(DEFAULT_CONTROL_BINDINGS.gamepad).sort()).toEqual([...GAMEPAD_ACTION_KEYS].sort());
  });

  it("gamepad air-roll semantic-trap fix: airRollModifierButton defaults to west, matching powerslideButton (the value actually consumed)", () => {
    expect(DEFAULT_CONTROL_BINDINGS.gamepad.airRollModifierButton).toBe(STANDARD_GAMEPAD_BUTTONS.west);
    expect(DEFAULT_CONTROL_BINDINGS.gamepad.airRollModifierButton).toBe(
      DEFAULT_CONTROL_BINDINGS.gamepad.powerslideButton
    );
  });

  it("jump/boost/rearView default to their historical mouse buttons (2/0/1)", () => {
    expect(DEFAULT_CONTROL_BINDINGS.keyboardMouse.jump).toEqual({ kind: "mouse", button: 2 });
    expect(DEFAULT_CONTROL_BINDINGS.keyboardMouse.boost).toEqual({ kind: "mouse", button: 0 });
    expect(DEFAULT_CONTROL_BINDINGS.keyboardMouse.rearView).toEqual({ kind: "mouse", button: 1 });
  });
});

describe("settingsStore controls validation (R10.4)", () => {
  it("defaults the whole controls section when missing", () => {
    const result = validateSettings({});
    expect(result.controls).toEqual(DEFAULT_SETTINGS.controls);
  });

  it("falls back field-by-field on bad keyboard codes", () => {
    const result = validateSettings({
      controls: {
        keyboardMouse: { accelerate: "", reverse: 42, steerLeft: "KeyP" }
      }
    });
    expect(result.controls.keyboardMouse.accelerate).toBe(DEFAULT_SETTINGS.controls.keyboardMouse.accelerate);
    expect(result.controls.keyboardMouse.reverse).toBe(DEFAULT_SETTINGS.controls.keyboardMouse.reverse);
    expect(result.controls.keyboardMouse.steerLeft).toBe("KeyP");
  });

  it("falls back on out-of-range gamepad button indices", () => {
    const result = validateSettings({
      controls: {
        gamepad: { jumpButton: 999, boostButton: -1, pauseButton: 5.5, accelerateButton: 7 }
      }
    });
    expect(result.controls.gamepad.jumpButton).toBe(DEFAULT_SETTINGS.controls.gamepad.jumpButton);
    expect(result.controls.gamepad.boostButton).toBe(DEFAULT_SETTINGS.controls.gamepad.boostButton);
    expect(result.controls.gamepad.pauseButton).toBe(DEFAULT_SETTINGS.controls.gamepad.pauseButton);
    expect(result.controls.gamepad.accelerateButton).toBe(7);
  });

  it("rejects a malformed KeyOrMouseBinding union (bad kind, missing fields, out-of-range mouse button)", () => {
    const result = validateSettings({
      controls: {
        keyboardMouse: {
          jump: { kind: "gamepad", button: 0 },
          boost: { kind: "mouse" },
          rearView: { kind: "mouse", button: 99 }
        }
      }
    });
    expect(result.controls.keyboardMouse.jump).toEqual(DEFAULT_SETTINGS.controls.keyboardMouse.jump);
    expect(result.controls.keyboardMouse.boost).toEqual(DEFAULT_SETTINGS.controls.keyboardMouse.boost);
    expect(result.controls.keyboardMouse.rearView).toEqual(DEFAULT_SETTINGS.controls.keyboardMouse.rearView);
  });

  it("accepts a valid rebound KeyOrMouseBinding (key-kind for a normally-mouse action)", () => {
    const result = validateSettings({
      controls: { keyboardMouse: { jump: { kind: "key", code: "Space" } } }
    });
    expect(result.controls.keyboardMouse.jump).toEqual({ kind: "key", code: "Space" });
  });

  it("clamps airRollSensitivity to [0.5, 2.0]", () => {
    expect(validateSettings({ controls: { airRollSensitivity: 10 } }).controls.airRollSensitivity).toBe(2.0);
    expect(validateSettings({ controls: { airRollSensitivity: -3 } }).controls.airRollSensitivity).toBe(0.5);
    expect(validateSettings({ controls: { airRollSensitivity: "nope" } }).controls.airRollSensitivity).toBe(
      DEFAULT_SETTINGS.controls.airRollSensitivity
    );
  });

  it("round-trips a fully custom bindings set unchanged", () => {
    const custom = {
      controls: {
        keyboardMouse: {
          ...DEFAULT_SETTINGS.controls.keyboardMouse,
          accelerate: "KeyI",
          reverse: "KeyK",
          steerLeft: "KeyJ",
          steerRight: "KeyL",
          jump: { kind: "key" as const, code: "Space" }
        },
        gamepad: {
          ...DEFAULT_SETTINGS.controls.gamepad,
          jumpButton: 5,
          boostButton: 4
        },
        airRollSensitivity: 1.75
      }
    };
    const result = validateSettings(custom);
    expect(result.controls).toEqual(custom.controls);
  });
});
