import * as THREE from "three";

import type { ProceduralAssetContext } from "@/assets/procedural/ProceduralAssetContext";

export interface StarfieldLayerParameters {
  readonly key: string;
  readonly count: number;
  readonly innerRadius: number;
  readonly outerRadius: number;
  readonly sizeMin: number;
  readonly sizeMax: number;
  readonly color: THREE.ColorRepresentation;
}

/**
 * One Points object per layer, not one object per star (asset pipeline
 * spec section 43). Positions/sizes are deterministic given the context's
 * seeded random source.
 */
export function createStarfieldLayer(
  context: ProceduralAssetContext,
  parameters: StarfieldLayerParameters
): THREE.Points {
  const geometry = context.geometryRegistry.getOrCreate(
    `starfield-${parameters.key}`,
    () => {
      const positions = new Float32Array(parameters.count * 3);
      const sizes = new Float32Array(parameters.count);

      for (let i = 0; i < parameters.count; i += 1) {
        const radius = context.random.range(
          parameters.innerRadius,
          parameters.outerRadius
        );
        const theta = context.random.range(0, Math.PI * 2);
        const phi = Math.acos(context.random.range(-1, 1));

        positions[i * 3 + 0] = radius * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = radius * Math.cos(phi);
        positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);

        sizes[i] = context.random.range(parameters.sizeMin, parameters.sizeMax);
      }

      const bufferGeometry = new THREE.BufferGeometry();
      bufferGeometry.setAttribute(
        "position",
        new THREE.BufferAttribute(positions, 3)
      );
      bufferGeometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
      bufferGeometry.computeBoundingSphere();

      return bufferGeometry;
    }
  );

  const material = context.materialRegistry.getOrCreate(
    `starfield-material-${parameters.key}`,
    () =>
      new THREE.PointsMaterial({
        color: parameters.color,
        size: (parameters.sizeMin + parameters.sizeMax) / 2,
        sizeAttenuation: true,
        transparent: true,
        depthWrite: false
      })
  );

  const points = new THREE.Points(geometry, material);
  points.name = `StarfieldLayer_${parameters.key}`;

  return points;
}

export function createDefaultStarfield(context: ProceduralAssetContext): THREE.Group {
  const group = new THREE.Group();
  group.name = "Starfield";

  group.add(
    createStarfieldLayer(context, {
      key: "near",
      count: 400,
      innerRadius: 80,
      outerRadius: 140,
      sizeMin: 0.4,
      sizeMax: 1.2,
      color: 0xffffff
    })
  );

  group.add(
    createStarfieldLayer(context, {
      key: "mid",
      count: 600,
      innerRadius: 140,
      outerRadius: 220,
      sizeMin: 0.3,
      sizeMax: 0.8,
      color: 0x9fb8ff
    })
  );

  group.add(
    createStarfieldLayer(context, {
      key: "far",
      count: 800,
      innerRadius: 220,
      outerRadius: 340,
      sizeMin: 0.2,
      sizeMax: 0.5,
      color: 0x6672a8
    })
  );

  return group;
}
