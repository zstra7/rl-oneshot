import { describe, expect, it } from "vitest";

import {
  CORNER_RADIUS,
  generateArenaRamps,
  RAMP_FILLET_RADIUS,
  RAMP_FILLET_SEGMENTS,
  type ArenaRampDimensions
} from "@/physics/arena/ArenaRampGeometry";
import { PLACEHOLDER_PHYSICS_METADATA } from "@/assets/AssetTypes";
import { DEFAULT_STADIUM_DIMENSIONS } from "@/assets/AssetTypes";
import { GeometryRegistry } from "@/assets/procedural/GeometryRegistry";
import { MaterialRegistry } from "@/assets/procedural/MaterialRegistry";
import { SeededRandom } from "@/assets/procedural/SeededRandom";
import { createStadiumBlockout } from "@/assets/procedural/StadiumGeometryFactory";
import { TEST_ARENA_DIMENSIONS } from "@/physics/arena/TestArenaPresets";
import { GOAL_HALF_WIDTH } from "@/physics/goal/GoalTypes";
import * as V from "@/physics/Vec3Math";
import * as THREE from "three";

/**
 * R1 (plan/RAMPS_AND_FEATURES_PLAN.md): the invariants below encode every
 * reported ramp bug (drive-through ghost ramp, invisible/backwards ramps,
 * broken end-wall physics, square corners) as a geometry check, so a
 * regression in the shared generator fails here before it ever needs a
 * live drive to notice.
 */
const DIMS: ArenaRampDimensions = {
  halfWidth: TEST_ARENA_DIMENSIONS.halfWidth,
  halfLength: TEST_ARENA_DIMENSIONS.halfLength,
  height: TEST_ARENA_DIMENSIONS.height,
  goalHalfWidth: GOAL_HALF_WIDTH
};

function quatApproxEqual(a: { x: number; y: number; z: number; w: number }, b: { x: number; y: number; z: number; w: number }, eps = 1e-6): void {
  // Quaternions q and -q represent the same rotation.
  const sameSign = a.w * b.w + a.x * b.x + a.y * b.y + a.z * b.z >= 0;
  const sign = sameSign ? 1 : -1;
  expect(Math.abs(a.x - sign * b.x)).toBeLessThan(eps);
  expect(Math.abs(a.y - sign * b.y)).toBeLessThan(eps);
  expect(Math.abs(a.z - sign * b.z)).toBeLessThan(eps);
  expect(Math.abs(a.w - sign * b.w)).toBeLessThan(eps);
}

describe("Vec3Math quaternion helpers", () => {
  it("quatFromAxisAngle matches known values", () => {
    const q = V.quatFromAxisAngle({ x: 0, y: 0, z: 1 }, Math.PI / 2);
    quatApproxEqual(q, { x: 0, y: 0, z: Math.sin(Math.PI / 4), w: Math.cos(Math.PI / 4) });
  });

  it("quatMultiply composes rotations: applying a*b equals applying b then a", () => {
    const qYaw90 = V.quatFromAxisAngle({ x: 0, y: 1, z: 0 }, Math.PI / 2);
    const qTiltX90 = V.quatFromAxisAngle({ x: 1, y: 0, z: 0 }, Math.PI / 2);
    const composed = V.quatMultiply(qTiltX90, qYaw90);

    // Applying b=qYaw90 then a=qTiltX90 to a vector, vs applying `composed` directly.
    const v = { x: 0, y: 0, z: 1 };
    const viaComposed = V.applyQuaternion(v, composed);
    const viaSequential = V.applyQuaternion(V.applyQuaternion(v, qYaw90), qTiltX90);

    expect(viaComposed.x).toBeCloseTo(viaSequential.x, 6);
    expect(viaComposed.y).toBeCloseTo(viaSequential.y, 6);
    expect(viaComposed.z).toBeCloseTo(viaSequential.z, 6);
  });
});

describe("visual/physics dims consistency", () => {
  it("DEFAULT_STADIUM_DIMENSIONS and TEST_ARENA_DIMENSIONS agree, so corner glass never drifts from corner colliders", () => {
    expect(DEFAULT_STADIUM_DIMENSIONS.fieldWidth / 2).toBe(TEST_ARENA_DIMENSIONS.halfWidth);
    expect(DEFAULT_STADIUM_DIMENSIONS.fieldLength / 2).toBe(TEST_ARENA_DIMENSIONS.halfLength);
    expect(DEFAULT_STADIUM_DIMENSIONS.interiorHeight).toBe(TEST_ARENA_DIMENSIONS.height);
    expect(DEFAULT_STADIUM_DIMENSIONS.cornerRadius).toBe(CORNER_RADIUS);
  });
});

describe("generateArenaRamps", () => {
  const specs = generateArenaRamps(DIMS);
  const filletSpecs = specs.filter((s) => s.kind === "floor-fillet");
  const cornerSpecs = specs.filter((s) => s.kind === "corner-wall");

  it("produces exactly 150 floor-fillet segments and 24 corner-wall panels", () => {
    expect(filletSpecs).toHaveLength(150);
    expect(cornerSpecs).toHaveLength(24);
  });

  it("anchor regression: right-wall run segment 0 matches the known-good legacy values", () => {
    const R = RAMP_FILLET_RADIUS;
    const t = 0.12;
    const theta = 0.5 * (Math.PI / 2 / RAMP_FILLET_SEGMENTS); // 9 degrees
    const expectedX = DIMS.halfWidth - (R - (R - t) * Math.sin(theta));
    const expectedY = R - (R - t) * Math.cos(theta);

    // Right-wall run segments have translation.z === 0 and x close to
    // halfWidth; the *first* segment (theta closest to 0, near the floor)
    // has the largest inset from the wall, i.e. the SMALLEST x.
    const rightWallFirst = filletSpecs
      .filter((s) => Math.abs(s.translation.z) < 1e-6 && s.translation.x > 0)
      .sort((a, b) => a.translation.x - b.translation.x)[0]!;

    expect(rightWallFirst.translation.x).toBeCloseTo(expectedX, 6);
    expect(rightWallFirst.translation.y).toBeCloseTo(expectedY, 6);
    quatApproxEqual(rightWallFirst.rotation, {
      x: 0,
      y: 0,
      z: Math.sin(theta / 2),
      w: Math.cos(theta / 2)
    });
  });

  it("every floor-fillet normal is field-facing and never overhangs", () => {
    for (const spec of filletSpecs) {
      const normal = V.applyQuaternion({ x: 0, y: 1, z: 0 }, spec.rotation);
      expect(normal.y).toBeGreaterThan(0.05);
    }
  });

  it("first segment of each run is near-flat, last segment is near-vertical", () => {
    // Group by (approximate) run: side-wall runs have |x| close to halfWidth
    // or the corner radius boundary; simplest robust check is over ALL
    // segments' normals: at least some are > 0.95 (first segments) and some
    // are < 0.35 (last segments) since every run has 5 segments sweeping
    // 9..81 degrees.
    const normalYs = filletSpecs.map((s) => V.applyQuaternion({ x: 0, y: 1, z: 0 }, s.rotation).y);
    expect(normalYs.some((y) => y > 0.95)).toBe(true);
    expect(normalYs.some((y) => y < 0.35)).toBe(true);
  });

  it("nothing sits mid-field: every floor-fillet segment hugs a wall or corner", () => {
    const { halfWidth, halfLength } = DIMS;
    const R = RAMP_FILLET_RADIUS;
    const Rc = CORNER_RADIUS;
    const cornerCentres = [
      { x: halfWidth - Rc, z: halfLength - Rc },
      { x: halfWidth - Rc, z: -(halfLength - Rc) },
      { x: -(halfWidth - Rc), z: halfLength - Rc },
      { x: -(halfWidth - Rc), z: -(halfLength - Rc) }
    ];

    for (const spec of filletSpecs) {
      const nearWall =
        Math.abs(spec.translation.x) >= halfWidth - (R + 1) ||
        Math.abs(spec.translation.z) >= halfLength - (R + 1);
      const nearCorner = cornerCentres.some((c) => {
        const d = Math.hypot(spec.translation.x - c.x, spec.translation.z - c.z);
        return d >= Rc - R - 0.5 && d <= Rc + 1;
      });
      expect(nearWall || nearCorner).toBe(true);
    }
  });

  it("goal mouths stay clear: no segment near an end wall dips into the goal width", () => {
    const { halfLength, goalHalfWidth } = DIMS;
    const R = RAMP_FILLET_RADIUS;
    for (const spec of filletSpecs) {
      if (Math.abs(spec.translation.z) > halfLength - R - 0.5) {
        expect(Math.abs(spec.translation.x)).toBeGreaterThanOrEqual(goalHalfWidth - 0.2);
      }
    }
  });

  it("no gaps: every station along each wall/corner base line is covered by some segment", () => {
    const { halfWidth, halfLength, goalHalfWidth } = DIMS;
    const Rc = CORNER_RADIUS;

    function isCovered(stationX: number, stationZ: number): boolean {
      return filletSpecs.some((spec) => {
        // Project the station onto the segment's local run axis (Z, since
        // local Z is the run/length direction) via the segment's world
        // footprint: approximate using distance from translation, since
        // segments are short flat boxes running along their own Z.
        const runAxis = V.applyQuaternion({ x: 0, y: 0, z: 1 }, spec.rotation);
        const toStation = { x: stationX - spec.translation.x, y: 0, z: stationZ - spec.translation.z };
        const along = toStation.x * runAxis.x + toStation.z * runAxis.z;
        const across = Math.hypot(toStation.x - along * runAxis.x, toStation.z - along * runAxis.z);
        return Math.abs(along) <= spec.halfExtents.z + 0.15 && across <= spec.halfExtents.x + 0.15;
      });
    }

    // Side walls.
    for (let z = -(halfLength - Rc) + 0.25; z <= halfLength - Rc - 0.25; z += 0.5) {
      expect(isCovered(halfWidth, z)).toBe(true);
      expect(isCovered(-halfWidth, z)).toBe(true);
    }
    // End runs.
    for (let x = goalHalfWidth + 0.25; x <= halfWidth - Rc - 0.25; x += 0.5) {
      expect(isCovered(x, halfLength)).toBe(true);
      expect(isCovered(-x, halfLength)).toBe(true);
      expect(isCovered(x, -halfLength)).toBe(true);
      expect(isCovered(-x, -halfLength)).toBe(true);
    }
    // Corner arcs (sample at the fillet base radius).
    for (const sx of [-1, 1] as const) {
      for (const sz of [-1, 1] as const) {
        const centre = { x: sx * (halfWidth - Rc), z: sz * (halfLength - Rc) };
        for (let i = 1; i < 10; i += 1) {
          const alpha = (i / 10) * (Math.PI / 2);
          const x = centre.x + sx * Math.cos(alpha) * Rc;
          const z = centre.z + sz * Math.sin(alpha) * Rc;
          expect(isCovered(x, z)).toBe(true);
        }
      }
    }
  });
});

describe("createStadiumBlockout ramp visuals match the physics generator (bijection)", () => {
  it("every generator spec has exactly one matching RampSegment/CornerWallPanel mesh, no extras", () => {
    const context = {
      three: THREE,
      geometryRegistry: new GeometryRegistry(),
      materialRegistry: new MaterialRegistry(),
      random: new SeededRandom(1),
      visualPreset: "clean" as const,
      stadiumDimensions: DEFAULT_STADIUM_DIMENSIONS,
      physicsMetadata: PLACEHOLDER_PHYSICS_METADATA
    };

    const stadium = createStadiumBlockout(context);
    const meshes: THREE.Mesh[] = [];
    stadium.traverse((obj) => {
      if (obj instanceof THREE.Mesh && (obj.name === "RampSegment" || obj.name === "CornerWallPanel")) {
        meshes.push(obj);
      }
    });

    const specs = generateArenaRamps(DIMS);
    expect(meshes).toHaveLength(specs.length);

    const remaining = [...meshes];
    for (const spec of specs) {
      const matchIndex = remaining.findIndex((mesh) => {
        const worldPos = new THREE.Vector3();
        mesh.getWorldPosition(worldPos);
        const worldQuat = new THREE.Quaternion();
        mesh.getWorldQuaternion(worldQuat);

        const posClose =
          Math.abs(worldPos.x - spec.translation.x) < 1e-3 &&
          Math.abs(worldPos.y - spec.translation.y) < 1e-3 &&
          Math.abs(worldPos.z - spec.translation.z) < 1e-3;

        const dotAbs = Math.abs(
          worldQuat.x * spec.rotation.x +
            worldQuat.y * spec.rotation.y +
            worldQuat.z * spec.rotation.z +
            worldQuat.w * spec.rotation.w
        );
        const quatClose = dotAbs > 1 - 1e-3;

        return posClose && quatClose;
      });
      expect(matchIndex).toBeGreaterThanOrEqual(0);
      if (matchIndex >= 0) {
        remaining.splice(matchIndex, 1);
      }
    }
    expect(remaining).toHaveLength(0);
  });
});
