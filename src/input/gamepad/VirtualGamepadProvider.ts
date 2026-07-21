import type { GamepadButtonLike, GamepadLike, GamepadProvider } from "@/input/gamepad/GamepadProvider";

export interface VirtualGamepadDefinition {
  readonly id: string;
  readonly mapping: "standard" | "";
  readonly axesCount: number;
  readonly buttonCount: number;
}

export interface VirtualGamepadState {
  readonly connected: boolean;
  readonly axes: readonly number[];
  readonly buttons: readonly GamepadButtonLike[];
}

/** Deterministic test gamepad source (input spec section 42). */
export class VirtualGamepadProvider implements GamepadProvider {
  private readonly gamepads = new Map<number, GamepadLike>();
  private nextIndex = 0;

  public connect(definition: VirtualGamepadDefinition): number {
    const index = this.nextIndex;
    this.nextIndex += 1;

    this.gamepads.set(index, {
      index,
      id: definition.id,
      connected: true,
      mapping: definition.mapping,
      axes: new Array(definition.axesCount).fill(0),
      buttons: new Array(definition.buttonCount).fill({
        pressed: false,
        touched: false,
        value: 0
      })
    });

    return index;
  }

  public disconnect(index: number): void {
    const gamepad = this.gamepads.get(index);
    if (gamepad) {
      this.gamepads.set(index, { ...gamepad, connected: false });
    }
  }

  public setState(index: number, state: VirtualGamepadState): void {
    const gamepad = this.gamepads.get(index);
    if (!gamepad) {
      throw new Error(`Unknown virtual gamepad index ${index}.`);
    }

    this.gamepads.set(index, {
      ...gamepad,
      connected: state.connected,
      axes: state.axes,
      buttons: state.buttons
    });
  }

  public getGamepads(): readonly GamepadLike[] {
    return [...this.gamepads.values()];
  }

  public reset(): void {
    this.gamepads.clear();
    this.nextIndex = 0;
  }
}
