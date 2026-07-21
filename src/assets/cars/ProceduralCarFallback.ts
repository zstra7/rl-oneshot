import * as THREE from "three";

import type { ProceduralAssetContext } from "@/assets/procedural/ProceduralAssetContext";

export type CarTeam = "player" | "opponent";

const TEAM_COLORS: Record<CarTeam, THREE.ColorRepresentation> = {
  player: 0x3fa9ff,
  opponent: 0xff5a3f
};

const WHEEL_RADIUS = 0.32;
const WHEEL_WIDTH = 0.22;

/**
 * Procedural placeholder car built from boxes, wedges, and cylinders
 * (asset pipeline spec section 20). Used whenever no supplied car GLB is
 * bound yet (Phase 11 replaces this per-car once real GLBs are wired in).
 * Approximates the placeholder physics hitbox from AssetTypes — Phase 3
 * physics is the authoritative source once it exists.
 */
export function createProceduralCarFallback(
  context: ProceduralAssetContext,
  team: CarTeam
): THREE.Group {
  const { x: hitboxWidth, y: hitboxHeight, z: hitboxLength } =
    context.physicsMetadata.carHitboxSize;

  const root = new THREE.Group();
  root.name = `ProceduralCarFallback_${team}`;
  root.userData["isFallbackVisual"] = true;

  const bodyMaterial = context.materialRegistry.getOrCreate(
    `car-fallback-body-${team}`,
    () =>
      new THREE.MeshStandardMaterial({
        color: TEAM_COLORS[team],
        roughness: 0.5,
        metalness: 0.2
      })
  );

  const bodyGeometry = context.geometryRegistry.getOrCreate(
    "car-fallback-body-v1",
    () => new THREE.BoxGeometry(hitboxWidth, hitboxHeight * 0.6, hitboxLength)
  );
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.name = "CarBody";
  body.position.y = hitboxHeight * 0.3;
  root.add(body);

  // Wedge-shaped cabin, tapering toward the front (+Z is forward).
  const cabinGeometry = context.geometryRegistry.getOrCreate(
    "car-fallback-cabin-v1",
    () => {
      const geometry = new THREE.BoxGeometry(
        hitboxWidth * 0.7,
        hitboxHeight * 0.4,
        hitboxLength * 0.45
      );
      const position = geometry.attributes["position"] as THREE.BufferAttribute;
      for (let i = 0; i < position.count; i += 1) {
        const z = position.getZ(i);
        if (z > 0) {
          position.setY(i, position.getY(i) * 0.3);
        }
      }
      geometry.computeVertexNormals();
      return geometry;
    }
  );
  const cabin = new THREE.Mesh(cabinGeometry, bodyMaterial);
  cabin.name = "CarCabin";
  cabin.position.set(0, hitboxHeight * 0.62, -hitboxLength * 0.05);
  root.add(cabin);

  const forwardMarkerMaterial = context.materialRegistry.getOrCreate(
    "car-fallback-forward-marker",
    () => new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  const forwardMarkerGeometry = context.geometryRegistry.getOrCreate(
    "car-fallback-forward-marker-v1",
    () => new THREE.ConeGeometry(0.12, 0.3, 8)
  );
  const forwardMarker = new THREE.Mesh(forwardMarkerGeometry, forwardMarkerMaterial);
  forwardMarker.name = "ForwardMarker";
  forwardMarker.rotation.x = Math.PI / 2;
  forwardMarker.position.set(0, hitboxHeight * 0.3, hitboxLength / 2 + 0.15);
  root.add(forwardMarker);

  const wheelMaterial = context.materialRegistry.getOrCreate(
    "car-fallback-wheel",
    () => new THREE.MeshStandardMaterial({ color: 0x101014, roughness: 0.9 })
  );
  const wheelGeometry = context.geometryRegistry.getOrCreate(
    "car-fallback-wheel-v1",
    () => {
      const geometry = new THREE.CylinderGeometry(
        WHEEL_RADIUS,
        WHEEL_RADIUS,
        WHEEL_WIDTH,
        12
      );
      geometry.rotateZ(Math.PI / 2);
      return geometry;
    }
  );

  const wheelOffsetX = hitboxWidth / 2 + WHEEL_WIDTH / 2;
  const wheelOffsetZ = hitboxLength * 0.32;
  const wheelOffsetY = 0;

  const wheelPositions: ReadonlyArray<readonly [number, number, number]> = [
    [-wheelOffsetX, wheelOffsetY, wheelOffsetZ],
    [wheelOffsetX, wheelOffsetY, wheelOffsetZ],
    [-wheelOffsetX, wheelOffsetY, -wheelOffsetZ],
    [wheelOffsetX, wheelOffsetY, -wheelOffsetZ]
  ];

  const wheels: THREE.Mesh[] = [];
  for (const [x, y, z] of wheelPositions) {
    const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
    wheel.name = "Wheel";
    wheel.position.set(x, y, z);
    root.add(wheel);
    wheels.push(wheel);
  }
  root.userData["wheels"] = wheels;

  const boostSocketMaterial = context.materialRegistry.getOrCreate(
    "car-fallback-boost-socket",
    () =>
      new THREE.MeshBasicMaterial({
        color: 0xffcf4d,
        transparent: true,
        opacity: 0.9
      })
  );
  const boostSocketGeometry = context.geometryRegistry.getOrCreate(
    "car-fallback-boost-socket-v1",
    () => new THREE.CircleGeometry(0.18, 8)
  );
  const boostSocket = new THREE.Mesh(boostSocketGeometry, boostSocketMaterial);
  boostSocket.name = "BoostSocket";
  boostSocket.rotation.y = Math.PI;
  boostSocket.position.set(0, hitboxHeight * 0.3, -hitboxLength / 2 - 0.01);
  root.add(boostSocket);
  root.userData["boostSocket"] = boostSocket;

  return root;
}
