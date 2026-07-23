import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const srcDir = `${rootDir}/src`;

const IMPORT_PATTERN =
  /import\s+(?:[^'"]*?from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

const RULES = [
  {
    sourceDir: "src/physics",
    forbidden: [/^vue$/, /^pinia$/, /@\/ui\//, /@\/ai\//, /@\/game-flow\//],
    reason: "Physics may not depend on Vue, Pinia, UI, AI, or game-flow."
  },
  {
    sourceDir: "src/ai",
    forbidden: [/^vue$/, /^pinia$/, /@dimforge\/rapier3d-compat/],
    reason: "AI may only read public physics observations, not Vue/Pinia/raw Rapier."
  },
  {
    sourceDir: "src/input",
    forbidden: [/\.vue$/, /@\/physics\//],
    reason: "Input may not import Vue components or physics controllers directly."
  },
  {
    sourceDir: "src/assets",
    forbidden: [/@\/stores\//],
    reason: "Assets may not import Vue stores."
  },
  {
    sourceDir: "src/stadium",
    forbidden: [/@\/ai\//],
    reason: "Stadium visual code may not import AI."
  },
  {
    sourceDir: "src/ui",
    forbidden: [/@dimforge\/rapier3d-compat/],
    reason: "UI may not import Rapier."
  }
];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const fullPath = `${dir}/${entry}`;
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      walk(fullPath, out);
    } else if (entry.endsWith(".ts") || entry.endsWith(".vue")) {
      out.push(fullPath);
    }
  }
}

const files = [];
walk(srcDir, files);

const violations = [];

for (const rule of RULES) {
  const ruleDirAbsolute = `${rootDir}/${rule.sourceDir}`;

  const matchingFiles = files.filter((f) =>
    f.startsWith(`${ruleDirAbsolute}/`)
  );

  for (const file of matchingFiles) {
    const source = readFileSync(file, "utf-8");
    let match;

    IMPORT_PATTERN.lastIndex = 0;
    while ((match = IMPORT_PATTERN.exec(source)) !== null) {
      const specifier = match[1] ?? match[2];

      for (const forbiddenPattern of rule.forbidden) {
        if (forbiddenPattern.test(specifier)) {
          violations.push(
            `${file.replace(`${rootDir}/`, "")} imports "${specifier}" ` +
              `which violates rule for ${rule.sourceDir}: ${rule.reason}`
          );
        }
      }
    }
  }
}

if (violations.length > 0) {
  console.error("Architecture validation failed:\n");
  for (const violation of violations) {
    console.error(` - ${violation}`);
  }
  process.exit(1);
}

console.log("Architecture validation passed.");
