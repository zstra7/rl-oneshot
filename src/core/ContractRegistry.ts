export const CORE_APPLICATION_CONTRACT_VERSION = "1.0";

export const REQUIRED_MODULE_CONTRACTS = {
  physics: "2.1",
  visualGameFlow: "1.1",
  opponentAi: "1.1",
  inputControls: "1.0",
  assetPipeline: "1.0"
} as const;

export type ModuleContractName =
  keyof typeof REQUIRED_MODULE_CONTRACTS;

export interface ModuleContractSource {
  readonly moduleName: ModuleContractName;
  readonly version: string;
}

export class ContractMismatchError extends Error {
  public readonly moduleName: ModuleContractName;
  public readonly expected: string;
  public readonly actual: string;

  constructor(
    moduleName: ModuleContractName,
    expected: string,
    actual: string
  ) {
    super(
      `Module contract mismatch for "${moduleName}": ` +
        `expected version "${expected}" but received "${actual}". ` +
        `Update the module implementation or REQUIRED_MODULE_CONTRACTS ` +
        `to restore compatibility.`
    );

    this.name = "ContractMismatchError";
    this.moduleName = moduleName;
    this.expected = expected;
    this.actual = actual;
  }
}

export function validateModuleContracts(
  sources: readonly ModuleContractSource[]
): void {
  for (const source of sources) {
    const expected =
      REQUIRED_MODULE_CONTRACTS[source.moduleName];

    if (expected !== source.version) {
      throw new ContractMismatchError(
        source.moduleName,
        expected,
        source.version
      );
    }
  }
}
