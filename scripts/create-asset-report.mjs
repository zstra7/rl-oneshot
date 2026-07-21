import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const artifactsDir = `${rootDir}/artifacts`;

if (!existsSync(artifactsDir)) {
  mkdirSync(artifactsDir);
}

function listFiles(dir) {
  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir).map((name) => {
    const fullPath = `${dir}/${name}`;
    return { name, bytes: statSync(fullPath).size };
  });
}

const report = {
  generatedAt: new Date().toISOString(),
  models: listFiles(`${rootDir}/assets/models`),
  textures: listFiles(`${rootDir}/assets/textures`)
};

writeFileSync(
  `${artifactsDir}/asset-report.json`,
  JSON.stringify(report, null, 2)
);

console.log(`Asset report written to artifacts/asset-report.json`);
