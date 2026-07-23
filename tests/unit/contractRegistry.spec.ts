import { describe, expect, it } from "vitest";

import {
  ContractMismatchError,
  REQUIRED_MODULE_CONTRACTS,
  validateModuleContracts
} from "@/core/ContractRegistry";

describe("ContractRegistry", () => {
  it("exposes the expected required module contract versions", () => {
    expect(REQUIRED_MODULE_CONTRACTS).toEqual({
      physics: "2.1",
      visualGameFlow: "1.1",
      opponentAi: "1.1",
      inputControls: "1.0",
      assetPipeline: "1.0"
    });
  });

  it("accepts matching contract versions", () => {
    expect(() =>
      validateModuleContracts([{ moduleName: "physics", version: "2.1" }])
    ).not.toThrow();
  });

  it("throws an actionable ContractMismatchError on version mismatch", () => {
    expect(() =>
      validateModuleContracts([{ moduleName: "physics", version: "1.0" }])
    ).toThrow(ContractMismatchError);
  });
});
