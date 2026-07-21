export type AppState =
  | "BOOT"
  | "LOADING"
  | "MENU"
  | "MATCH"
  | "FATAL_ERROR"
  | "DISPOSED";

export type StartupFailureKind =
  | "CONTRACT_MISMATCH"
  | "ASSET_FAILURE"
  | "RAPIER_FAILURE"
  | "WEBGL_UNAVAILABLE"
  | "SHADER_COMPILE_FAILURE"
  | "UNKNOWN";

export interface UiError {
  readonly kind: StartupFailureKind;
  readonly summary: string;
  readonly detail?: string;
  readonly failedModule?: string;
}
