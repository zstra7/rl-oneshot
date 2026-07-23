export interface GamepadButtonLike {
  readonly pressed: boolean;
  readonly touched: boolean;
  readonly value: number;
}

export interface GamepadLike {
  readonly index: number;
  readonly id: string;
  readonly connected: boolean;
  readonly mapping: "standard" | "";
  readonly axes: readonly number[];
  readonly buttons: readonly GamepadButtonLike[];
}

/**
 * Dependency-injected gamepad source (input spec section 42): production
 * uses the browser provider, tests use the virtual provider — both
 * implement the same interface so virtual input flows through the exact
 * same processing pipeline as real gamepads.
 */
export interface GamepadProvider {
  getGamepads(): readonly GamepadLike[];
}
