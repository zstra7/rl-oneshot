import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * G9 (plan/GAME_ENHANCEMENTS_PLAN.md): the settings panel used to
 * `justify-content: center` its whole column, so switching tabs (each with
 * a different content height) re-centred the heading/tabs vertically —
 * visible "jump" every time the tab content height changed. This is a
 * source-level gate (no DOM/rendering harness for .vue SFCs in this test
 * environment) asserting the anchoring fix is actually present: the panel
 * anchors to the top instead of centering, and the content area reserves
 * enough height that switching tabs doesn't grow/shrink the space below it
 * either.
 */
const settingsPanelPath = fileURLToPath(new URL("../../src/components/menu/SettingsPanel.vue", import.meta.url));
const source = readFileSync(settingsPanelPath, "utf-8");

function styleBlock(selector: string): string {
  const marker = `${selector} {`;
  const start = source.indexOf(marker);
  expect(start, `expected to find a "${marker}" style block`).toBeGreaterThanOrEqual(0);
  const end = source.indexOf("}", start);
  return source.slice(start, end);
}

describe("G9 settings panel layout anchoring", () => {
  it(".menu-panel anchors to the top instead of centering the column", () => {
    const block = styleBlock(".menu-panel");
    expect(block).toContain("justify-content: flex-start");
    expect(block).not.toContain("justify-content: center");
  });

  it(".category-content reserves a stable minimum height across tabs", () => {
    const block = styleBlock(".category-content");
    expect(block).toMatch(/min-height:\s*\S+/);
  });
});
