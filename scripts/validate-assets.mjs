import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));

const errors = [];

const modelsDir = `${rootDir}/assets/models`;
const texturesDir = `${rootDir}/assets/textures`;

if (!existsSync(modelsDir)) {
  errors.push(`Missing required directory: assets/models`);
} else if (readdirSync(modelsDir).filter((f) => f.endsWith(".glb")).length === 0) {
  console.warn(
    "Warning: no .glb files found in assets/models. " +
      "The procedural fallback car will be used until a car is supplied."
  );
}

if (!existsSync(texturesDir)) {
  errors.push(`Missing required directory: assets/textures`);
}

if (errors.length > 0) {
  console.error("Asset validation failed:\n");
  for (const error of errors) {
    console.error(` - ${error}`);
  }
  process.exit(1);
}

console.log("Asset validation passed.");
