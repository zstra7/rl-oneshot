import { fileURLToPath } from "node:url";

import { findMissingThreeJsSkills } from "./lib/threejsSkills.mjs";

const rootDir = fileURLToPath(new URL("..", import.meta.url));

const missing = findMissingThreeJsSkills(rootDir);

if (missing.length > 0) {
  console.error("Missing required Three.js Claude skill(s):\n");
  for (const path of missing) {
    console.error(` - ${path}`);
  }
  console.error(
    "\nInstall the project-approved threejs-skills files before asking " +
      "Claude Code to implement procedural geometry, materials, shaders, " +
      "or post-processing."
  );
  process.exit(1);
}

console.log("Three.js skill validation passed (10/10 present).");
