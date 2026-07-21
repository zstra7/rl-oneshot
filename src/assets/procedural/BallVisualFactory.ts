import * as THREE from "three";

import type { ProceduralAssetContext } from "@/assets/procedural/ProceduralAssetContext";

const BALL_DETAIL = 2;

/**
 * Procedural faceted ball (asset pipeline spec section 41). Seams use the
 * "duplicate slightly enlarged edge layer" approach — a wireframe overlay
 * mesh — since it is the simplest readable option of the four listed.
 */
export function createBallVisual(context: ProceduralAssetContext): THREE.Group {
  const radius = context.physicsMetadata.ballRadius;

  const bodyGeometry = context.geometryRegistry.getOrCreate(
    "ball-faceted-v1",
    () => new THREE.IcosahedronGeometry(radius, BALL_DETAIL)
  );

  const seamGeometry = context.geometryRegistry.getOrCreate(
    "ball-seam-v1",
    () => new THREE.IcosahedronGeometry(radius * 1.015, BALL_DETAIL)
  );

  const bodyMaterial = context.materialRegistry.getOrCreate(
    "ball-body-v1",
    () =>
      new THREE.MeshStandardMaterial({
        color: 0x1a1a22,
        roughness: 0.55,
        metalness: 0.1
      })
  );

  const seamMaterial = context.materialRegistry.getOrCreate(
    "ball-seam-v1",
    () =>
      new THREE.MeshBasicMaterial({
        color: 0x66e0ff,
        wireframe: true,
        transparent: true,
        opacity: 0.65
      })
  );

  const group = new THREE.Group();
  group.name = "BallVisual";

  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.name = "BallBody";
  group.add(body);

  const seams = new THREE.Mesh(seamGeometry, seamMaterial);
  seams.name = "BallSeams";
  group.add(seams);

  return group;
}
