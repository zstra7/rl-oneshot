import type { AppState } from "@/core/ApplicationState";
import type { GameSessionState } from "@/game-flow/MatchFlowTypes";
import type { MenuNavigationFrame } from "@/input/InputControlsModule";

export interface RuntimeErrorRecord {
  readonly message: string;
  readonly stack?: string;
  readonly timestampMs: number;
  readonly fatal: boolean;
}

export interface AppStateChangedEvent {
  readonly previous: AppState;
  readonly next: AppState;
}

export interface FixedTickAdvancedEvent {
  readonly tick: number;
  readonly fixedDeltaSeconds: number;
}

export interface RuntimeErrorEvent {
  readonly record: RuntimeErrorRecord;
}

/**
 * Emitted once per fixed tick (whether driven by the real rAF loop or by
 * `stepFixedTicksForTesting`), so the Vue UI layer observes match-flow
 * session state without ever running a rAF loop of its own (core
 * architecture spec: "there must be one requestAnimationFrame loop").
 * `playerBoostAmount` rides along for the HUD boost meter rather than
 * adding a second event.
 */
export interface SessionStateChangedEvent {
  readonly session: GameSessionState;
  readonly playerBoostAmount: number;
  /** WS9.C: HUD supersonic feedback on the boost ring. */
  readonly playerSupersonic: boolean;
}

/**
 * R11: emitted once per rendered frame while `matchState` is menu-navigable
 * (`MENU_NAVIGABLE_STATES`), carrying the sampled gamepad menu-navigation
 * frame for `useMenuGamepadNavigation` to consume.
 */
export interface MenuNavigationEvent {
  readonly frame: MenuNavigationFrame;
}

/**
 * Extended incrementally as each module's phase lands (physics, match,
 * input, assets events per core architecture spec section 18). Only
 * runtime-owned events exist as of Phase 1 — do not invent event contracts
 * for modules that have not been implemented yet.
 */
export interface TypedEventMap {
  "runtime:app-state-changed": AppStateChangedEvent;
  "runtime:fixed-tick": FixedTickAdvancedEvent;
  "runtime:error": RuntimeErrorEvent;
  "runtime:session-state-changed": SessionStateChangedEvent;
  "runtime:menu-navigation": MenuNavigationEvent;
}
