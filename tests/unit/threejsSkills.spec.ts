import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  findMissingThreeJsSkills,
  REQUIRED_THREEJS_SKILLS
} from "../../scripts/lib/threejsSkills.mjs";

describe("threejs skill validation", () => {
  it("fails correctly when a required skill file is missing", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "threejs-skills-"));

    try {
      for (const skill of REQUIRED_THREEJS_SKILLS.slice(0, -1)) {
        const dir = join(tempRoot, ".claude", "skills", skill);
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, "SKILL.md"), "# stub");
      }

      const missing = findMissingThreeJsSkills(tempRoot);

      expect(missing).toHaveLength(1);
      expect(missing[0]).toContain(
        REQUIRED_THREEJS_SKILLS[REQUIRED_THREEJS_SKILLS.length - 1]
      );
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("passes when all ten required skill files exist", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "threejs-skills-"));

    try {
      for (const skill of REQUIRED_THREEJS_SKILLS) {
        const dir = join(tempRoot, ".claude", "skills", skill);
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, "SKILL.md"), "# stub");
      }

      expect(findMissingThreeJsSkills(tempRoot)).toHaveLength(0);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("the real repository has all ten required skill files", () => {
    const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

    expect(findMissingThreeJsSkills(repoRoot)).toHaveLength(0);
  });
});
