import { nextTick, onBeforeUnmount, watch } from "vue";

import { useGameRuntime } from "@/core/useGameRuntime";
import type { MenuNavigationFrame } from "@/input/InputControlsModule";
import { useMatchFlowStore } from "@/stores/matchFlowStore";

/** R11: first move is immediate, then a 380ms delay, then repeats every 140ms. */
const REPEAT_INITIAL_DELAY_MS = 380;
const REPEAT_INTERVAL_MS = 140;

type Direction = "up" | "down" | "left" | "right";

interface DirectionRepeatState {
  held: boolean;
  nextFireAtMs: number;
}

function createRepeatState(): Record<Direction, DirectionRepeatState> {
  return {
    up: { held: false, nextFireAtMs: 0 },
    down: { held: false, nextFireAtMs: 0 },
    left: { held: false, nextFireAtMs: 0 },
    right: { held: false, nextFireAtMs: 0 }
  };
}

function isVisible(el: HTMLElement): boolean {
  return el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0;
}

/** DOM order, live query — App.vue's v-if chain guarantees only one `[data-menu-root]` is ever mounted. */
function queryFocusTargets(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      "[data-menu-root] :is(button, input[type=range], input[type=color]):not(:disabled)"
    )
  ).filter(isVisible);
}

function queryBackTarget(): HTMLElement | null {
  return (
    Array.from(document.querySelectorAll<HTMLElement>("[data-menu-back]")).find(isVisible) ?? null
  );
}

function groupContainer(el: HTMLElement): HTMLElement | null {
  return el.closest<HTMLElement>(".duration-row, .button-group, [role=group]");
}

/** Mirrors the `setRangeSlider` pattern used by existing Playwright specs (tests/camera/camera-settings.spec.ts). */
function stepRangeInput(input: HTMLInputElement, direction: 1 | -1): void {
  const step = Number(input.step) || 1;
  const min = input.min !== "" ? Number(input.min) : -Infinity;
  const max = input.max !== "" ? Number(input.max) : Infinity;
  const current = Number(input.value);
  const next = Math.min(max, Math.max(min, current + direction * step));
  input.value = String(next);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * R11: fixed (non-rebindable) console-convention gamepad menu navigation —
 * d-pad/left-stick moves focus through the visible `[data-menu-root]`
 * screen, South activates, East triggers the screen's `[data-menu-back]`.
 * Instantiate exactly once (in App.vue); this composable owns its own
 * lifecycle (subscribes on setup, unsubscribes on unmount).
 */
export function useMenuGamepadNavigation(): void {
  const runtime = useGameRuntime();
  const matchFlowStore = useMatchFlowStore();
  const repeatState = createRepeatState();

  function moveWithin(targets: HTMLElement[], delta: 1 | -1): void {
    if (targets.length === 0) {
      return;
    }
    const active = document.activeElement as HTMLElement | null;
    const currentIndex = active ? targets.indexOf(active) : -1;
    const nextIndex =
      currentIndex === -1
        ? delta > 0
          ? 0
          : targets.length - 1
        : (currentIndex + delta + targets.length) % targets.length;
    targets[nextIndex]!.focus();
  }

  function focusFirstTarget(): void {
    const targets = queryFocusTargets();
    if (targets.length === 0) {
      return;
    }
    const autofocusTarget = targets.find((el) => el.hasAttribute("autofocus"));
    (autofocusTarget ?? targets[0])!.focus();
  }

  function handleDirection(direction: Direction): void {
    const active = document.activeElement as HTMLElement | null;

    if (direction === "left" || direction === "right") {
      const delta = direction === "right" ? 1 : -1;

      if (active instanceof HTMLInputElement && active.type === "range") {
        stepRangeInput(active, delta);
        return;
      }

      const container = active ? groupContainer(active) : null;
      if (container) {
        const targets = queryFocusTargets().filter((el) => container.contains(el));
        moveWithin(targets, delta);
        return;
      }

      moveWithin(queryFocusTargets(), delta);
      return;
    }

    moveWithin(queryFocusTargets(), direction === "down" ? 1 : -1);
  }

  function processHeld(direction: Direction, held: boolean, nowMs: number): void {
    const state = repeatState[direction];

    if (!held) {
      state.held = false;
      return;
    }

    if (!state.held) {
      // Fresh press: fire immediately, then wait the initial repeat delay.
      state.held = true;
      state.nextFireAtMs = nowMs + REPEAT_INITIAL_DELAY_MS;
      handleDirection(direction);
      return;
    }

    if (nowMs >= state.nextFireAtMs) {
      state.nextFireAtMs = nowMs + REPEAT_INTERVAL_MS;
      handleDirection(direction);
    }
  }

  function handleFrame(frame: MenuNavigationFrame): void {
    const nowMs = performance.now();
    processHeld("up", frame.up, nowMs);
    processHeld("down", frame.down, nowMs);
    processHeld("left", frame.left, nowMs);
    processHeld("right", frame.right, nowMs);

    if (frame.confirmPressed) {
      (document.activeElement as HTMLElement | null)?.click();
    }
    if (frame.backPressed) {
      queryBackTarget()?.click();
    }
  }

  const unsubscribe = runtime.onEvent("runtime:menu-navigation", (event) => handleFrame(event.frame));

  // A new menu root just mounted (or the app booted straight into one) —
  // auto-focus its first target (or the element with `autofocus`) once Vue
  // has patched the DOM.
  const stopWatch = watch(
    () => matchFlowStore.matchState,
    () => {
      void nextTick(() => focusFirstTarget());
    },
    { immediate: true }
  );

  onBeforeUnmount(() => {
    unsubscribe();
    stopWatch();
  });
}
