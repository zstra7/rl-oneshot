import type { AppState } from "@/core/ApplicationState";

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
 * Extended incrementally as each module's phase lands (physics, match,
 * input, assets events per core architecture spec section 18). Only
 * runtime-owned events exist as of Phase 1 — do not invent event contracts
 * for modules that have not been implemented yet.
 */
export interface TypedEventMap {
  "runtime:app-state-changed": AppStateChangedEvent;
  "runtime:fixed-tick": FixedTickAdvancedEvent;
  "runtime:error": RuntimeErrorEvent;
}
