import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { GAME_ASSET_MANIFEST, validateAssetManifest } from "@/assets/AssetManifest";
import { CarAssetLoader } from "@/assets/cars/CarAssetLoader";
import {
  OPPONENT_CAR_DESCRIPTOR,
  PLAYER_CAR_DESCRIPTOR,
  getTeamVisualProfile
} from "@/assets/cars/CarDescriptors";
import type {
  CarAssetDescriptor,
  CarAssetInspectionReport,
  LoadedCarSource
} from "@/assets/cars/CarModelTypes";
import { matchTargetInReport, validateCarAsset } from "@/assets/cars/CarValidation";

function buildReport(overrides: Partial<CarAssetInspectionReport> = {}): CarAssetInspectionReport {
  return {
    url: "/assets/cars/car.glb",
    nodeCount: 7,
    meshCount: 2,
    skinnedMeshCount: 0,
    materialCount: 2,
    textureCount: 2,
    triangleCount: 388,
    vertexCount: 1134,
    sourceBounds: {
      min: { x: -1.95, y: -0.03, z: -4.67 },
      max: { x: 1.88, y: 2.4, z: 4.41 },
      size: { x: 3.83, y: 2.43, z: 9.08 },
      centre: { x: -0.04, y: 1.18, z: -0.13 }
    },
    animationClips: [],
    nodeNames: ["car", "car_M_car_0", "car_M_Wheels_0"],
    materialNames: ["M_car", "M_Wheels"],
    extensionUsage: ["KHR_materials_unlit"],
    warnings: [],
    errors: [],
    ...overrides
  };
}

describe("CarDescriptors", () => {
  it("player and opponent descriptors share the GLB url but have distinct ids", () => {
    expect(PLAYER_CAR_DESCRIPTOR.id).toBe("player-car");
    expect(OPPONENT_CAR_DESCRIPTOR.id).toBe("opponent-car");
    expect(PLAYER_CAR_DESCRIPTOR.url).toBe(OPPONENT_CAR_DESCRIPTOR.url);
  });

  it("declares exactly one required team-tint target", () => {
    const required = PLAYER_CAR_DESCRIPTOR.teamTintTargets.filter((target) => target.required);
    expect(required).toHaveLength(1);
    expect(required[0]?.role).toBe("team-primary");
  });

  it("team visual profiles use distinct colours per team", () => {
    const player = getTeamVisualProfile("player");
    const opponent = getTeamVisualProfile("opponent");
    expect(player.teamId).toBe("player");
    expect(opponent.teamId).toBe("opponent");
    expect(player.primary).not.toBe(opponent.primary);
  });
});

describe("validateAssetManifest (car descriptors)", () => {
  it("passes for the real GAME_ASSET_MANIFEST", () => {
    expect(validateAssetManifest(GAME_ASSET_MANIFEST)).toEqual([]);
  });

  it("flags duplicate car descriptor ids", () => {
    const manifest = {
      ...GAME_ASSET_MANIFEST,
      cars: { player: PLAYER_CAR_DESCRIPTOR, opponent: { ...PLAYER_CAR_DESCRIPTOR } }
    };
    const errors = validateAssetManifest(manifest);
    expect(errors.some((e) => e.includes("Duplicate car descriptor id"))).toBe(true);
  });
});

describe("validateCarAsset (asset pipeline spec section 14.1)", () => {
  it("passes for the real car.glb intake report with no errors or warnings", () => {
    const result = validateCarAsset(buildReport(), PLAYER_CAR_DESCRIPTOR);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it("fails when the GLB has no mesh", () => {
    const result = validateCarAsset(buildReport({ meshCount: 0 }), PLAYER_CAR_DESCRIPTOR);
    expect(result.errors.some((e) => e.includes("no mesh"))).toBe(true);
  });

  it("fails on non-finite source bounds", () => {
    const report = buildReport({
      sourceBounds: {
        min: { x: Number.NaN, y: 0, z: 0 },
        max: { x: 1, y: 1, z: 1 },
        size: { x: 1, y: 1, z: 1 },
        centre: { x: 0, y: 0, z: 0 }
      }
    });
    const result = validateCarAsset(report, PLAYER_CAR_DESCRIPTOR);
    expect(result.errors.some((e) => e.includes("non-finite"))).toBe(true);
  });

  it("fails on zero-size source bounds", () => {
    const report = buildReport({
      sourceBounds: {
        min: { x: 0, y: 0, z: 0 },
        max: { x: 0, y: 1, z: 1 },
        size: { x: 0, y: 1, z: 1 },
        centre: { x: 0, y: 0.5, z: 0.5 }
      }
    });
    const result = validateCarAsset(report, PLAYER_CAR_DESCRIPTOR);
    expect(result.errors.some((e) => e.includes("zero-size"))).toBe(true);
  });

  it("fails when a required team-tint target's material is missing", () => {
    const report = buildReport({ materialNames: ["SomeOtherMaterial"] });
    const result = validateCarAsset(report, PLAYER_CAR_DESCRIPTOR);
    expect(result.errors.some((e) => e.includes("team-tint target"))).toBe(true);
  });

  it("fails when a declared required wheel node is missing", () => {
    const descriptor: CarAssetDescriptor = {
      ...PLAYER_CAR_DESCRIPTOR,
      wheelNodes: { frontLeft: "Wheel_FL_not_present" }
    };
    const result = validateCarAsset(buildReport(), descriptor);
    expect(result.errors.some((e) => e.includes("wheel node"))).toBe(true);
  });

  it("fails when a declared required boost socket is missing", () => {
    const descriptor: CarAssetDescriptor = {
      ...PLAYER_CAR_DESCRIPTOR,
      boostSockets: [{ id: "main", nodeName: "BoostSocket_missing", required: true }]
    };
    const result = validateCarAsset(buildReport(), descriptor);
    expect(result.errors.some((e) => e.includes("boost socket"))).toBe(true);
  });

  it("warns (does not error) above the recommended triangle/material/texture thresholds", () => {
    const result = validateCarAsset(
      buildReport({ triangleCount: 60_000, materialCount: 40, textureCount: 20 }),
      PLAYER_CAR_DESCRIPTOR
    );
    expect(result.errors).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThanOrEqual(3);
  });
});

describe("matchTargetInReport", () => {
  const report = { materialNames: ["M_car", "M_Wheels"], nodeNames: ["car_M_car_0"] };

  it("matches by exact material name", () => {
    expect(matchTargetInReport({ materialName: "M_car" }, report)).toBe(true);
    expect(matchTargetInReport({ materialName: "M_missing" }, report)).toBe(false);
  });

  it("matches by material name pattern", () => {
    expect(matchTargetInReport({ materialNamePattern: "^M_" }, report)).toBe(true);
    expect(matchTargetInReport({ materialNamePattern: "^X_" }, report)).toBe(false);
  });

  it("matches by node name", () => {
    expect(matchTargetInReport({ nodeName: "car_M_car_0" }, report)).toBe(true);
    expect(matchTargetInReport({ nodeName: "not_a_node" }, report)).toBe(false);
  });
});

function buildFakeSource(descriptor: CarAssetDescriptor): LoadedCarSource {
  const bodyMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
  bodyMaterial.name = "M_car";
  const wheelMaterial = new THREE.MeshBasicMaterial({ color: 0x101014 });
  wheelMaterial.name = "M_Wheels";

  const body = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), bodyMaterial);
  body.name = "car_M_car_0";
  const wheels = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), wheelMaterial);
  wheels.name = "car_M_Wheels_0";

  const scene = new THREE.Group();
  scene.add(body, wheels);

  return { descriptor, scene, animations: [], report: buildReport() };
}

describe("CarAssetLoader.createInstance (asset pipeline spec section 15/17)", () => {
  it("builds the CarPhysicsRoot -> CarVisualOffset -> CarTeamVisualRoot -> LoadedGlbScene hierarchy", () => {
    const loader = new CarAssetLoader();
    const source = buildFakeSource(PLAYER_CAR_DESCRIPTOR);
    const instance = loader.createInstance(source, getTeamVisualProfile("player"));

    expect(instance.name).toBe(`CarPhysicsRoot_${PLAYER_CAR_DESCRIPTOR.id}`);
    const visualOffset = instance.children[0] as THREE.Object3D;
    expect(visualOffset.name).toBe("CarVisualOffset");
    expect(visualOffset.scale.x).toBeCloseTo(PLAYER_CAR_DESCRIPTOR.visualScale, 6);
    expect(visualOffset.position.x).toBeCloseTo(PLAYER_CAR_DESCRIPTOR.visualOffset.x, 6);
    expect(visualOffset.rotation.y).toBeCloseTo(PLAYER_CAR_DESCRIPTOR.visualRotationEuler.y, 6);

    const teamRoot = visualOffset.children[0] as THREE.Object3D;
    expect(teamRoot.name).toBe("CarTeamVisualRoot_player");

    const loadedScene = teamRoot.children[0] as THREE.Object3D;
    expect(loadedScene.name).toBe("LoadedGlbScene");
  });

  it("does not scale/rotate the CarPhysicsRoot itself (spec: 'do not scale CarPhysicsRoot')", () => {
    const loader = new CarAssetLoader();
    const source = buildFakeSource(PLAYER_CAR_DESCRIPTOR);
    const instance = loader.createInstance(source, getTeamVisualProfile("player"));

    expect(instance.scale.x).toBe(1);
    expect(instance.scale.y).toBe(1);
    expect(instance.scale.z).toBe(1);
    expect(instance.rotation.x).toBe(0);
    expect(instance.rotation.y).toBe(0);
    expect(instance.rotation.z).toBe(0);
  });

  it("clones and tints only the team-primary material, leaving the wheel material untouched and shared", () => {
    const loader = new CarAssetLoader();
    const source = buildFakeSource(PLAYER_CAR_DESCRIPTOR);

    const playerInstance = loader.createInstance(source, getTeamVisualProfile("player"));
    const opponentInstance = loader.createInstance(source, getTeamVisualProfile("opponent"));

    const findMesh = (root: THREE.Object3D, name: string): THREE.Mesh => {
      let found: THREE.Mesh | undefined;
      root.traverse((node) => {
        if (node.name === name) {
          found = node as THREE.Mesh;
        }
      });
      if (!found) {
        throw new Error(`mesh "${name}" not found`);
      }
      return found;
    };

    const playerBody = findMesh(playerInstance, "car_M_car_0");
    const opponentBody = findMesh(opponentInstance, "car_M_car_0");
    const playerWheels = findMesh(playerInstance, "car_M_Wheels_0");
    const opponentWheels = findMesh(opponentInstance, "car_M_Wheels_0");

    const playerColor = (playerBody.material as THREE.MeshBasicMaterial).color;
    const opponentColor = (opponentBody.material as THREE.MeshBasicMaterial).color;
    expect(playerColor.getHex()).toBe(new THREE.Color(getTeamVisualProfile("player").primary).getHex());
    expect(opponentColor.getHex()).toBe(new THREE.Color(getTeamVisualProfile("opponent").primary).getHex());
    expect(playerBody.material).not.toBe(opponentBody.material);

    // Wheel material has no team-tint role -> stays the exact same shared
    // instance for both teams (spec 17.1: "continue sharing... neutral
    // immutable materials where safe").
    expect(playerWheels.material).toBe(opponentWheels.material);

    // The original cached source material itself must never be mutated.
    const sourceBodyMaterial = source.scene.children[0] as THREE.Mesh;
    expect((sourceBodyMaterial.material as THREE.MeshBasicMaterial).color.getHex()).toBe(0xffffff);
  });
});
