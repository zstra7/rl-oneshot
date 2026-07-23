import type { InputControlsModule } from "@/input/InputControlsModule";
import type {
  ActiveInputDevice,
  GameplayInputContext,
  HumanGameplayInputFrame,
  InputContext,
  InputDiagnostics
} from "@/input/InputTypes";
import type {
  VirtualGamepadDefinition,
  VirtualGamepadState
} from "@/input/gamepad/VirtualGamepadProvider";
import { VirtualGamepadProvider } from "@/input/gamepad/VirtualGamepadProvider";

export interface VirtualKeyboardEvent {
  readonly code: string;
  readonly kind: "down" | "up";
}

export interface VirtualMouseEvent {
  readonly button: number;
  readonly kind: "down" | "up";
}

/**
 * Trimmed to what Phase 4 implements. The full input spec section 41
 * interface also specifies rebinding (`setBinding`/`resetBindings`),
 * settings persistence, and haptic-log methods, deferred to Phase 15.
 */
export interface BrowserInputTestApi {
  ready(): boolean;
  reset(): void;

  setContext(context: InputContext): void;
  getContext(): InputContext;

  injectKeyboardEvent(event: VirtualKeyboardEvent): void;
  injectMouseEvent(event: VirtualMouseEvent): void;

  connectVirtualGamepad(gamepad: VirtualGamepadDefinition): number;
  disconnectVirtualGamepad(index: number): void;
  setVirtualGamepadState(index: number, state: VirtualGamepadState): void;

  assignGamepad(index: number | null): void;
  getActiveDevice(): ActiveInputDevice;

  sampleTick(context: GameplayInputContext): HumanGameplayInputFrame;

  simulateBlur(): void;

  getDiagnostics(): InputDiagnostics;
}

/**
 * Real DOM events are dispatched on the same target the production
 * listeners are attached to, so virtual/test input exercises the exact
 * same code path as physical input (input spec section 41: "Virtual
 * gamepad input must use the same processing pipeline as real gamepads"
 * — extended here to keyboard/mouse for the same reason).
 */
export function installInputTestApi(
  input: InputControlsModule,
  gameplayElement: HTMLElement
): void {
  if (!(__DEV__ || __TEST_BUILD__)) {
    return;
  }

  const virtualGamepadProvider = new VirtualGamepadProvider();
  // Only swap InputControlsModule onto the virtual provider once a test
  // actually connects a virtual gamepad — swapping unconditionally at
  // install time (which runs in every __DEV__ build, i.e. every `npm run
  // dev` session) permanently stops navigator.getGamepads() from being
  // polled, so real physical controllers go dead even outside of tests.
  let virtualProviderActive = false;

  const api: BrowserInputTestApi = {
    ready: () => true,
    reset: () => {
      virtualGamepadProvider.reset();
      if (virtualProviderActive) {
        input.useBrowserGamepadProvider();
        virtualProviderActive = false;
      }
    },
    setContext: (context) => input.setInputContext(context),
    getContext: () => input.getInputContext(),
    injectKeyboardEvent: (event) => {
      const type = event.kind === "down" ? "keydown" : "keyup";
      window.dispatchEvent(new KeyboardEvent(type, { code: event.code }));
    },
    injectMouseEvent: (event) => {
      const type = event.kind === "down" ? "mousedown" : "mouseup";
      gameplayElement.dispatchEvent(new MouseEvent(type, { button: event.button }));
    },
    connectVirtualGamepad: (gamepad) => {
      if (!virtualProviderActive) {
        input.useVirtualGamepadProvider(virtualGamepadProvider);
        virtualProviderActive = true;
      }
      return virtualGamepadProvider.connect(gamepad);
    },
    disconnectVirtualGamepad: (index) => virtualGamepadProvider.disconnect(index),
    setVirtualGamepadState: (index, state) => virtualGamepadProvider.setState(index, state),
    assignGamepad: (index) => input.assignGamepad(index),
    getActiveDevice: () => input.getActiveDevice(),
    sampleTick: (context) => {
      // Polls the gamepad provider so virtual-gamepad state set via
      // setVirtualGamepadState() is reflected even while the runtime's
      // RAF loop (which normally drives updateBrowserFrame) is paused.
      input.updateBrowserFrame(performance.now());
      return input.sampleGameplayInputForTick(0, context);
    },
    simulateBlur: () => window.dispatchEvent(new Event("blur")),
    getDiagnostics: () => input.getDiagnostics()
  };

  window.__INPUT_TEST__ = api;
}

declare global {
  interface Window {
    __INPUT_TEST__?: BrowserInputTestApi;
  }
}
