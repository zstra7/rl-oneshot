import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { PLACEHOLDER_PHYSICS_METADATA, DEFAULT_STADIUM_DIMENSIONS } from "@/assets/AssetTypes";
import { GeometryRegistry } from "@/assets/procedural/GeometryRegistry";
import { MaterialRegistry } from "@/assets/procedural/MaterialRegistry";
import { SeededRandom } from "@/assets/procedural/SeededRandom";
import { createStadiumBlockout, HEX_TILE_WORLD_SIZE } from "@/assets/procedural/StadiumGeometryFactory";
import { CORNER_PANELS } from "@/physics/arena/ArenaRampGeometry";

/**
 * G3 (plan/GAME_ENHANCEMENTS_PLAN.md): the 24 curved corner panels used to
 * share ONE geometry (identical halfExtents on every panel) whose UVs
 * always started at u=0 — so the hex pattern restarted at every panel
 * boundary along a corner's arc, reading as clipped/discontinuous hexes.
 * The fix gives each of the 6 arc positions within a corner its own
 * geometry with an advancing U offset, shared across all 4 corners (every
 * panel is the same size). This proves the pattern is now continuous:
 * exactly 6 distinct geometries, their U ranges form an arithmetic
 * progression, and adjacent panels' shared edges match exactly.
 */
function buildStadium() {
  const context = {
    three: THREE,
    geometryRegistry: new GeometryRegistry(),
    materialRegistry: new MaterialRegistry(),
    random: new SeededRandom(1),
    visualPreset: "clean" as const,
    stadiumDimensions: DEFAULT_STADIUM_DIMENSIONS,
    physicsMetadata: PLACEHOLDER_PHYSICS_METADATA
  };
  return createStadiumBlockout(context);
}

function uRange(geometry: THREE.BufferGeometry): { min: number; max: number } {
  const uv = geometry.attributes["uv"]!;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < uv.count; i += 1) {
    min = Math.min(min, uv.getX(i));
    max = Math.max(max, uv.getX(i));
  }
  return { min, max };
}

describe("G3 corner hex pattern continuity", () => {
  it("all 24 corner panels resolve to exactly 6 distinct geometries (one per arc position, shared across the 4 corners)", () => {
    const stadium = buildStadium();
    const geometries = new Set<THREE.BufferGeometry>();
    stadium.traverse((object) => {
      if (object instanceof THREE.Mesh && object.name === "CornerWallPanel") {
        geometries.add(object.geometry);
      }
    });
    expect(geometries.size).toBe(CORNER_PANELS);
  });

  it("the 6 geometries' U ranges form an arithmetic progression (the pattern advances around the arc)", () => {
    const stadium = buildStadium();
    const geometries = new Set<THREE.BufferGeometry>();
    stadium.traverse((object) => {
      if (object instanceof THREE.Mesh && object.name === "CornerWallPanel") {
        geometries.add(object.geometry);
      }
    });

    const ranges = Array.from(geometries)
      .map((geometry) => uRange(geometry))
      .sort((a, b) => a.min - b.min);

    expect(ranges).toHaveLength(CORNER_PANELS);

    const panelUSpan = ranges[0]!.max - ranges[0]!.min;
    expect(panelUSpan).toBeGreaterThan(0);

    for (let i = 0; i < ranges.length; i += 1) {
      const expectedMin = i * panelUSpan;
      expect(ranges[i]!.min).toBeCloseTo(expectedMin, 5);
      expect(ranges[i]!.max).toBeCloseTo(expectedMin + panelUSpan, 5);
    }
  });

  it("adjacent panels' shared edge U values match exactly — no seam, no restart", () => {
    const stadium = buildStadium();
    const geometries = new Set<THREE.BufferGeometry>();
    stadium.traverse((object) => {
      if (object instanceof THREE.Mesh && object.name === "CornerWallPanel") {
        geometries.add(object.geometry);
      }
    });

    const ranges = Array.from(geometries)
      .map((geometry) => uRange(geometry))
      .sort((a, b) => a.min - b.min);

    for (let i = 0; i < ranges.length - 1; i += 1) {
      expect(ranges[i]!.max).toBeCloseTo(ranges[i + 1]!.min, 5);
    }
  });

  it("the panel U span matches the panel's own world width, scaled by HEX_TILE_WORLD_SIZE", () => {
    const stadium = buildStadium();
    let firstPanel: THREE.Mesh | null = null;
    stadium.traverse((object) => {
      if (!firstPanel && object instanceof THREE.Mesh && object.name === "CornerWallPanel") {
        firstPanel = object;
      }
    });
    expect(firstPanel).toBeTruthy();
    const geometry = firstPanel!.geometry as THREE.PlaneGeometry;
    const worldW = geometry.parameters.width;
    const { min, max } = uRange(geometry);
    expect(max - min).toBeCloseTo(worldW / HEX_TILE_WORLD_SIZE, 5);
  });
});
