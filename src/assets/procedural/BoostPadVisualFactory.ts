import * as THREE from "three";

import type { ProceduralAssetContext } from "@/assets/procedural/ProceduralAssetContext";
import { applyVertexJitter } from "@/visual-language/VertexJitter";

export type BoostPadVisualType = "small" | "full";
export type BoostPadVisualState = "active" | "inactive" | "respawning" | "collected-pulse";

const SMALL_RING_RADIUS = 0.95;
const FULL_RING_RADIUS = 1.35;

/**
 * Procedural boost pad visual (asset pipeline spec section 42): a small
 * pad gets a low-poly inset plate + angular ring + glyph; a full pad gets
 * a larger ring + layered diamond geometry. Plate/glyph geometry and
 * material are shared across every pad of the same type; the ring
 * material is a per-pad instance clone (via MaterialRegistry) so each
 * pad's active/inactive/respawning state can change independently.
 */
export function createBoostPadVisual(
  context: ProceduralAssetContext,
  padId: string,
  type: BoostPadVisualType
): THREE.Group {
  const ringRadius = type === "small" ? SMALL_RING_RADIUS : FULL_RING_RADIUS;

  const group = new THREE.Group();
  group.name = `BoostPadVisual_${type}_${padId}`;

  const plateGeometry = context.geometryRegistry.getOrCreate(
    `boost-pad-plate-${type}-v1`,
    () => new THREE.CylinderGeometry(ringRadius * 0.55, ringRadius * 0.6, 0.06, type === "small" ? 8 : 12)
  );
  const plateMaterial = context.materialRegistry.getOrCreate(
    "boost-pad-plate-v1",
    () => new THREE.MeshStandardMaterial({ color: 0x14161f, roughness: 0.6, metalness: 0.3 })
  );
  applyVertexJitter(plateMaterial, "arenaMetal");
  const plate = new THREE.Mesh(plateGeometry, plateMaterial);
  plate.name = "PadPlate";
  plate.position.y = 0.03;
  group.add(plate);

  const ringGeometry = context.geometryRegistry.getOrCreate(
    `boost-pad-ring-${type}-v1`,
    () => new THREE.TorusGeometry(ringRadius, ringRadius * 0.06, 6, type === "small" ? 8 : 12)
  );

  context.materialRegistry.getOrCreate(
    "boost-pad-ring-source-v1",
    () => new THREE.MeshBasicMaterial({ color: 0xffcf4d, transparent: true, opacity: 0.95 })
  );
  const ringMaterial = context.materialRegistry.createInstanceMaterial<THREE.MeshBasicMaterial>(
    "boost-pad-ring-source-v1",
    `boost-pad-ring-instance-${padId}`,
    () => {
      // No per-instance colour deviation at creation time; state applies later.
    }
  );

  applyVertexJitter(ringMaterial, "goalOutlines");
  const ring = new THREE.Mesh(ringGeometry, ringMaterial);
  ring.name = "PadRing";
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.07;
  group.add(ring);

  if (type === "small") {
    const glyphGeometry = context.geometryRegistry.getOrCreate(
      "boost-pad-glyph-small-v1",
      () => new THREE.OctahedronGeometry(ringRadius * 0.25, 0)
    );
    const glyphMaterial = context.materialRegistry.getOrCreate(
      "boost-pad-glyph-v1",
      () => new THREE.MeshBasicMaterial({ color: 0xffe9a8 })
    );
    applyVertexJitter(glyphMaterial, "goalOutlines");
    const glyph = new THREE.Mesh(glyphGeometry, glyphMaterial);
    glyph.name = "PadGlyph";
    glyph.position.y = 0.35;
    group.add(glyph);
  } else {
    const clusterGeometry = context.geometryRegistry.getOrCreate(
      "boost-pad-cluster-full-v1",
      () => new THREE.ConeGeometry(ringRadius * 0.3, ringRadius * 1.4, 4)
    );
    const clusterMaterial = context.materialRegistry.getOrCreate(
      "boost-pad-cluster-v1",
      () => new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.85 })
    );
    applyVertexJitter(clusterMaterial, "goalOutlines");
    const cluster = new THREE.Mesh(clusterGeometry, clusterMaterial);
    cluster.name = "PadEnergyCluster";
    cluster.position.y = ringRadius * 0.7;
    group.add(cluster);
  }

  return group;
}

/** Mutates the pad's own per-instance ring material — never a shared one. */
export function applyBoostPadVisualState(pad: THREE.Group, state: BoostPadVisualState): void {
  pad.visible = state !== "inactive";

  const ring = pad.getObjectByName("PadRing") as THREE.Mesh | undefined;
  const material = ring?.material as THREE.MeshBasicMaterial | undefined;

  if (!material) {
    return;
  }

  switch (state) {
    case "active":
      material.opacity = 0.95;
      material.color.setHex(0xffcf4d);
      break;
    case "respawning":
      material.opacity = 0.35;
      material.color.setHex(0x556270);
      break;
    case "collected-pulse":
      material.opacity = 1;
      material.color.setHex(0xffffff);
      break;
    case "inactive":
      material.opacity = 0.2;
      break;
  }
}
