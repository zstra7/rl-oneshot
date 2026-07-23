import type { GamepadLike, GamepadProvider } from "@/input/gamepad/GamepadProvider";

export class BrowserGamepadProvider implements GamepadProvider {
  public getGamepads(): readonly GamepadLike[] {
    if (typeof navigator === "undefined" || !navigator.getGamepads) {
      return [];
    }

    const result: GamepadLike[] = [];

    for (const gamepad of navigator.getGamepads()) {
      if (!gamepad) {
        continue;
      }

      result.push({
        index: gamepad.index,
        id: gamepad.id,
        connected: gamepad.connected,
        mapping: gamepad.mapping === "standard" ? "standard" : "",
        axes: gamepad.axes,
        buttons: gamepad.buttons.map((button) => ({
          pressed: button.pressed,
          touched: button.touched,
          value: button.value
        }))
      });
    }

    return result;
  }
}
