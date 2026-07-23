import type { AppState } from "@/core/ApplicationState";
import type { ModuleStatus } from "@/core/GameModule";
import type { RuntimeErrorRecord } from "@/core/EventTypes";

export interface RendererDiagnostics {
  readonly drawCalls: number;
  readonly triangles: number;
  readonly textures: number;
  readonly geometries: number;
}

export interface AssetReportSummary {
  readonly loaded: number;
  readonly pending: number;
  readonly failed: number;
}

/**
 * Populated field-by-field as the modules that own each figure land
 * (renderer stats in Phase 8+/13+, asset stats in Phase 2+). Zeroed
 * defaults are reported until then rather than omitting the fields, so
 * the shape matches core architecture spec section 47 from Phase 1
 * onward.
 */
export interface RuntimeDiagnostics {
  readonly appState: AppState;

  readonly running: boolean;
  readonly fixedTick: number;

  readonly accumulatorSeconds: number;
  readonly droppedFixedTimeSeconds: number;

  readonly frameTimeMs: number;
  readonly fixedStepsLastFrame: number;

  readonly moduleStatus: Record<string, ModuleStatus>;

  readonly renderer: RendererDiagnostics;
  readonly assets: AssetReportSummary;

  readonly subscriptions: Record<string, number>;

  readonly errors: readonly RuntimeErrorRecord[];
}
