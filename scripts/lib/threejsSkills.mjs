import { existsSync } from "node:fs";

export const REQUIRED_THREEJS_SKILLS = [
  "threejs-fundamentals",
  "threejs-geometry",
  "threejs-materials",
  "threejs-lighting",
  "threejs-textures",
  "threejs-animation",
  "threejs-loaders",
  "threejs-shaders",
  "threejs-postprocessing",
  "threejs-interaction"
];

export function findMissingThreeJsSkills(rootDir) {
  const missing = [];

  for (const skill of REQUIRED_THREEJS_SKILLS) {
    const skillPath = `${rootDir}/.claude/skills/${skill}/SKILL.md`;

    if (!existsSync(skillPath)) {
      missing.push(`.claude/skills/${skill}/SKILL.md`);
    }
  }

  return missing;
}
