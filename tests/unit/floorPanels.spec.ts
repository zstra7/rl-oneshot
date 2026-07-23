import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { PLACEHOLDER_PHYSICS_METADATA, DEFAULT_STADIUM_DIMENSIONS } from "@/assets/AssetTypes";
import { GeometryRegistry } from "@/assets/procedural/GeometryRegistry";
import { MaterialRegistry } from "@/assets/procedural/MaterialRegistry";
import { SeededRandom } from "@/assets/procedural/SeededRandom";
import { createStadiumBlockout } from "@/assets/procedural/StadiumGeometryFactory";

const FLOOR_PANEL_COLUMNS = 4;
const FLOOR_PANEL_ROWS = 6;

function fakeTexture(): THREE.Texture {
  return new THREE.Texture();
}

/**
 * F7 (plan/ARENA_FLUSH_AND_REFINEMENTS_PLAN.md): floor panel texture/
 * rotation picks used to be pure `context.random` draws with no
 * symmetry. They're now a deterministic function of each panel's
 * distance-to-nearer-edge on each axis, so panels mirror across both
 * the column and row axes.
 */
function buildStadium(floorPanelSet: readonly THREE.Texture[] = [fakeTexture(), fakeTexture(), fakeTexture()]) {
  const context = {
    three: THREE,
    geometryRegistry: new GeometryRegistry(),
    materialRegistry: new MaterialRegistry(),
    random: new SeededRandom(1),
    visualPreset: "clean" as const,
    stadiumDimensions: DEFAULT_STADIUM_DIMENSIONS,
    physicsMetadata: PLACEHOLDER_PHYSICS_METADATA,
    stadiumTextures: { floorPanelSet }
  };
  return createStadiumBlockout(context);
}

function collectPanelGrid(stadium: THREE.Group): Map<string, THREE.Mesh> {
  const { fieldWidth, fieldLength } = DEFAULT_STADIUM_DIMENSIONS;
  const panelWidth = fieldWidth / FLOOR_PANEL_COLUMNS;
  const panelDepth = fieldLength / FLOOR_PANEL_ROWS;

  const grid = new Map<string, THREE.Mesh>();
  stadium.traverse((object) => {
    if (object.name !== "FloorPanel") {
      return;
    }
    const mesh = object as THREE.Mesh;
    const column = Math.round((mesh.position.x + fieldWidth / 2) / panelWidth - 0.5);
    const row = Math.round((mesh.position.z + fieldLength / 2) / panelDepth - 0.5);
    grid.set(`${column},${row}`, mesh);
  });
  return grid;
}

describe("F7: floor panel pattern is symmetrical across both field axes", () => {
  it("mirrors material and rotation across the column axis", () => {
    const stadium = buildStadium();
    const grid = collectPanelGrid(stadium);
    expect(grid.size).toBe(FLOOR_PANEL_COLUMNS * FLOOR_PANEL_ROWS);

    for (let column = 0; column < FLOOR_PANEL_COLUMNS; column += 1) {
      for (let row = 0; row < FLOOR_PANEL_ROWS; row += 1) {
        const panel = grid.get(`${column},${row}`)!;
        const mirror = grid.get(`${FLOOR_PANEL_COLUMNS - 1 - column},${row}`)!;
        expect(panel.material).toBe(mirror.material);
        expect(panel.rotation.z).toBeCloseTo(mirror.rotation.z, 6);
      }
    }
  });

  it("mirrors material and rotation across the row axis", () => {
    const stadium = buildStadium();
    const grid = collectPanelGrid(stadium);

    for (let column = 0; column < FLOOR_PANEL_COLUMNS; column += 1) {
      for (let row = 0; row < FLOOR_PANEL_ROWS; row += 1) {
        const panel = grid.get(`${column},${row}`)!;
        const mirror = grid.get(`${column},${FLOOR_PANEL_ROWS - 1 - row}`)!;
        // Panels within FLOOR_ACCENT_DISTANCE of a goal line get a
        // one-sided player/opponent accent override that is
        // intentionally NOT row-symmetric (the two ends are different
        // teams' colours by design) -- only compare the plain-material
        // interior rows where no accent applies.
        const distanceToPlayerGoal = panel.position.z - -DEFAULT_STADIUM_DIMENSIONS.fieldLength / 2;
        const distanceToOpponentGoal = DEFAULT_STADIUM_DIMENSIONS.fieldLength / 2 - panel.position.z;
        const nearGoal = distanceToPlayerGoal < 10 || distanceToOpponentGoal < 10;
        if (nearGoal) {
          continue;
        }
        expect(panel.material).toBe(mirror.material);
        expect(panel.rotation.z).toBeCloseTo(mirror.rotation.z, 6);
      }
    }
  });

  it("is deterministic across two builds sharing the same textures (not random noise)", () => {
    // Same texture instances passed into two independent builds (separate
    // registries/contexts, as two different game sessions would produce):
    // if panel choice were still `context.random`-driven, the chosen
    // texture per position would vary session to session even though the
    // input textures are identical. It must not.
    const sharedTextures = [fakeTexture(), fakeTexture(), fakeTexture()];
    const gridA = collectPanelGrid(buildStadium(sharedTextures));
    const gridB = collectPanelGrid(buildStadium(sharedTextures));

    for (const [key, panelA] of gridA) {
      const panelB = gridB.get(key)!;
      expect(panelA.rotation.z).toBeCloseTo(panelB.rotation.z, 6);
      const mapA = (panelA.material as THREE.MeshStandardMaterial).map;
      const mapB = (panelB.material as THREE.MeshStandardMaterial).map;
      expect(mapA).toBe(mapB);
    }
  });
});
