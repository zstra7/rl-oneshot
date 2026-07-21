import { ContractMismatchError } from "@/core/ContractRegistry";
import type { UiError } from "@/core/ApplicationState";

export function classifyStartupFailure(error: unknown): UiError {
  if (error instanceof ContractMismatchError) {
    return {
      kind: "CONTRACT_MISMATCH",
      summary: "A module contract version mismatch was detected at boot.",
      detail: error.message,
      failedModule: error.moduleName
    };
  }

  if (
    typeof window !== "undefined" &&
    typeof WebGLRenderingContext === "undefined"
  ) {
    return {
      kind: "WEBGL_UNAVAILABLE",
      summary: "WebGL is not available in this browser."
    };
  }

  const detail = error instanceof Error ? error.stack : undefined;

  return {
    kind: "UNKNOWN",
    summary: error instanceof Error ? error.message : String(error),
    ...(detail !== undefined ? { detail } : {})
  };
}
