import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));

const packageJson = JSON.parse(
  readFileSync(`${rootDir}/package.json`, "utf-8")
);

const EXPECTED_PINNED_VERSIONS = {
  three: "0.160.0",
  vue: "3.5.40",
  pinia: "4.0.2",
  "@dimforge/rapier3d-compat": "0.19.3"
};

const errors = [];

for (const [name, expected] of Object.entries(EXPECTED_PINNED_VERSIONS)) {
  const actual = packageJson.dependencies?.[name];

  if (actual !== expected) {
    errors.push(
      `Dependency "${name}" must be pinned to exactly "${expected}" ` +
        `(found "${actual ?? "missing"}"). Floating ranges are forbidden.`
    );
  }
}

const contractRegistrySource = readFileSync(
  `${rootDir}/src/core/ContractRegistry.ts`,
  "utf-8"
);

const REQUIRED_CONTRACT_VALUES = {
  physics: "2.1",
  visualGameFlow: "1.1",
  opponentAi: "1.1",
  inputControls: "1.0",
  assetPipeline: "1.0"
};

for (const [key, expected] of Object.entries(REQUIRED_CONTRACT_VALUES)) {
  const pattern = new RegExp(`${key}:\\s*"${expected}"`);

  if (!pattern.test(contractRegistrySource)) {
    errors.push(
      `src/core/ContractRegistry.ts must declare REQUIRED_MODULE_CONTRACTS.${key} = "${expected}".`
    );
  }
}

if (errors.length > 0) {
  console.error("Contract validation failed:\n");
  for (const error of errors) {
    console.error(` - ${error}`);
  }
  process.exit(1);
}

console.log("Contract validation passed.");
