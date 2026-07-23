# Module Contracts

| Module | Contract constant | Version |
|---|---|---|
| Core application | `CORE_APPLICATION_CONTRACT_VERSION` | 1.0 |
| Physics | `PHYSICS_MODULE_CONTRACT_VERSION` | 2.1 |
| Visual / game flow | `VISUAL_GAMEFLOW_CONTRACT_VERSION` | 1.1 |
| Opponent AI | `OPPONENT_AI_CONTRACT_VERSION` | 1.1 |
| Input controls | `INPUT_CONTROLS_CONTRACT_VERSION` | 1.0 |
| Asset pipeline | `ASSET_PIPELINE_CONTRACT_VERSION` | 1.0 |

Source of truth: `src/core/ContractRegistry.ts`. Validated by
`scripts/validate-contracts.mjs` and, at runtime, by
`validateModuleContracts()` during application boot.
