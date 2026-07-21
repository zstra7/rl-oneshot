import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync
} from "node:fs";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const artifactsDir = `${rootDir}/artifacts`;
const distDir = `${rootDir}/dist`;

if (!existsSync(artifactsDir)) {
  mkdirSync(artifactsDir);
}

const packageJson = JSON.parse(
  existsSync(`${rootDir}/package.json`)
    ? readFileSync(`${rootDir}/package.json`, "utf-8")
    : "{}"
);

function walkFiles(dir, base = dir, out = []) {
  if (!existsSync(dir)) {
    return out;
  }

  for (const entry of readdirSync(dir)) {
    const fullPath = `${dir}/${entry}`;
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      walkFiles(fullPath, base, out);
    } else {
      out.push({
        path: fullPath.replace(`${base}/`, ""),
        bytes: stats.size
      });
    }
  }

  return out;
}

const files = walkFiles(distDir);

const totals = files.reduce(
  (acc, file) => {
    if (file.path.endsWith(".js")) acc.javascriptBytes += file.bytes;
    else if (file.path.endsWith(".css")) acc.cssBytes += file.bytes;
    else acc.assetBytes += file.bytes;
    return acc;
  },
  { javascriptBytes: 0, cssBytes: 0, assetBytes: 0 }
);

const report = {
  generatedAt: new Date().toISOString(),
  versions: {
    app: packageJson.version ?? "0.0.0",
    node: process.version,
    vue: packageJson.dependencies?.vue ?? "unknown",
    vite: packageJson.devDependencies?.vite ?? "unknown",
    three: packageJson.dependencies?.three ?? "unknown",
    rapier: packageJson.dependencies?.["@dimforge/rapier3d-compat"] ?? "unknown",
    playwright: packageJson.devDependencies?.["@playwright/test"] ?? "unknown"
  },
  contracts: {
    physics: "2.1",
    visualGameFlow: "1.1",
    opponentAi: "1.1",
    inputControls: "1.0",
    assetPipeline: "1.0"
  },
  files,
  totals,
  warnings: existsSync(distDir) ? [] : ["dist directory not found; run vite build first"],
  errors: []
};

writeFileSync(
  `${artifactsDir}/build-report.json`,
  JSON.stringify(report, null, 2)
);

console.log(`Build report written to artifacts/build-report.json`);
