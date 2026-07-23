import { describe, expect, it } from "vitest";

import {
  CORNER_PANEL_HALF_THICK,
  CORNER_RADIUS,
  generateArenaRamps,
  RAMP_FILLET_RADIUS,
  RAMP_FILLET_SEGMENTS,
  RAMP_SEG_HALF_THICK,
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

  it("anchor regression: right-wall run segment 0 matches the flush (F1) placement", () => {
    const R = RAMP_FILLET_RADIUS;
    const t = 0.12;
    const theta = 0.5 * (Math.PI / 2 / RAMP_FILLET_SEGMENTS); // 9 degrees
    // F1 (plan/ARENA_FLUSH_AND_REFINEMENTS_PLAN.md): centres sit on radius
    // R+t (not the pre-F1 R-t) so the drivable inner face lands exactly on
    // the tangent circle of radius R. The pre-F1 anchor pinned the R-t
    // placement, which enshrined a 0.24m floor/wall seam gap — this anchor
    // is intentionally different from that older value.
    const expectedX = DIMS.halfWidth - (R - (R + t) * Math.sin(theta));
    const expectedY = R - (R + t) * Math.cos(theta);

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

  it("F1: floor-fillet drivable surface is flush at both the floor and wall seams for every straight run", () => {
    // The drivable surface's outward normal is `rotate(rotation, (0,1,0))`
    // (this is exactly what "every floor-fillet normal is field-facing"
    // above already asserts .y > 0 on) — so the drivable FACE point is the
    // box centre offset by +t along that normal (not -t). Reconstruct it
    // for the first (near-floor) and last (near-wall) segment of each of
    // the six straight runs and assert flushness directly, mirroring the
    // production formulas exactly (same approach as the anchor test).
    const R = RAMP_FILLET_RADIUS;
    const t = RAMP_SEG_HALF_THICK;
    const { halfWidth, halfLength, goalHalfWidth } = DIMS;
    const Rc = CORNER_RADIUS;
    const endRunHalfLength = (halfWidth - Rc - goalHalfWidth) / 2;
    const endRunCentreX = goalHalfWidth + endRunHalfLength;

    const runs: Array<{ wallBase: V.Vec3Like; inward: V.Vec3Like }> = [
      { wallBase: { x: halfWidth, y: 0, z: 0 }, inward: { x: -1, y: 0, z: 0 } },
      { wallBase: { x: -halfWidth, y: 0, z: 0 }, inward: { x: 1, y: 0, z: 0 } },
      ...([-1, 1] as const).flatMap((zSign) =>
        ([-1, 1] as const).map((xSign) => ({
          wallBase: { x: xSign * endRunCentreX, y: 0, z: zSign * halfLength },
          inward: { x: 0, y: 0, z: -zSign }
        }))
      )
    ];

    function drivableFace(theta: number, wallBase: V.Vec3Like, inward: V.Vec3Like) {
      const runDir: V.Vec3Like = { x: inward.z, y: 0, z: -inward.x };
      const qYaw = V.quatFromAxisAngle({ x: 0, y: 1, z: 0 }, Math.atan2(runDir.x, runDir.z));
      const qTilt = V.quatFromAxisAngle(runDir, theta);
      const rotation = V.quatMultiply(qTilt, qYaw);
      const inset = R - (R + t) * Math.sin(theta);
      const y = R - (R + t) * Math.cos(theta);
      const centre: V.Vec3Like = {
        x: wallBase.x + inward.x * inset,
        y,
        z: wallBase.z + inward.z * inset
      };
      const normal = V.applyQuaternion({ x: 0, y: 1, z: 0 }, rotation);
      return { x: centre.x + normal.x * t, y: centre.y + normal.y * t, z: centre.z + normal.z * t };
    }

    const firstTheta = 0.5 * (Math.PI / 2 / RAMP_FILLET_SEGMENTS); // 9 degrees
    const lastTheta = (RAMP_FILLET_SEGMENTS - 0.5) * (Math.PI / 2 / RAMP_FILLET_SEGMENTS); // 81 degrees

    for (const { wallBase, inward } of runs) {
      const bottomFace = drivableFace(firstTheta, wallBase, inward);
      // Flush with the floor (y=0): slightly buried by design, never
      // floating above it.
      expect(bottomFace.y).toBeLessThan(0.05);
      expect(bottomFace.y).toBeGreaterThan(-0.15);

      const topFace = drivableFace(lastTheta, wallBase, inward);
      // Flush with the wall plane: the component of (topFace - wallBase)
      // along `inward` must be near zero (neither a gap nor a large
      // embed) — the old R-t placement left a ~0.24m gap here.
      const alongInward =
        (topFace.x - wallBase.x) * inward.x + (topFace.z - wallBase.z) * inward.z;
      expect(Math.abs(alongInward)).toBeLessThan(0.06);
    }
  });

  it("F2: corner-wall panels never protrude past the tangent circle of radius Rc into the field", () => {
    // The pre-F2 (chord/inscribed) placement put each panel's inner face
    // ~0.55m inside the arc — a step a car sliding along a straight wall
    // would crash into. The fixed (tangent/circumscribed) placement must
    // never let the inner face's distance from its corner's arc centre
    // fall below Rc (a tiny numerical epsilon is allowed).
    const { halfWidth, halfLength } = DIMS;
    const Rc = CORNER_RADIUS;
    const t = CORNER_PANEL_HALF_THICK;
    const cornerCentres = [
      { sx: 1, sz: 1, x: halfWidth - Rc, z: halfLength - Rc },
      { sx: 1, sz: -1, x: halfWidth - Rc, z: -(halfLength - Rc) },
      { sx: -1, sz: 1, x: -(halfWidth - Rc), z: halfLength - Rc },
      { sx: -1, sz: -1, x: -(halfWidth - Rc), z: -(halfLength - Rc) }
    ];

    for (const spec of cornerSpecs) {
      const centre = cornerCentres.reduce((closest, c) => {
        const d = Math.hypot(spec.translation.x - c.x, spec.translation.z - c.z);
        const dClosest = Math.hypot(spec.translation.x - closest.x, spec.translation.z - closest.z);
        return d < dClosest ? c : closest;
      });

      // Inner-face bottom corners: translation offset by -halfExtents.z
      // along the panel's local +Z (the outward normal, per
      // `yawToDirection(outward)`) and ±halfExtents.x along local X.
      const outwardNormal = V.applyQuaternion({ x: 0, y: 0, z: 1 }, spec.rotation);
      const tangentDir = V.applyQuaternion({ x: 1, y: 0, z: 0 }, spec.rotation);
      for (const sign of [-1, 1] as const) {
        const innerFaceCorner = {
          x: spec.translation.x - outwardNormal.x * t + tangentDir.x * sign * spec.halfExtents.x,
          z: spec.translation.z - outwardNormal.z * t + tangentDir.z * sign * spec.halfExtents.x
        };
        const distanceFromArcCentre = Math.hypot(innerFaceCorner.x - centre.x, innerFaceCorner.z - centre.z);
        expect(distanceFromArcCentre).toBeGreaterThanOrEqual(Rc - 1e-6);
      }
    }
  });

  it("F2: corner panels meet the adjacent straight wall flush (no junction step)", () => {
    // The first/last panel of every corner (alpha nearest 0 or 90 degrees)
    // must present an inner face very close to the straight wall's plane
    // (|x| == halfWidth or |z| == halfLength) at its wall-adjacent edge.
    const { halfWidth, halfLength } = DIMS;
    const Rc = CORNER_RADIUS;
    const CORNER_PANELS_COUNT = cornerSpecs.length / 4; // 24 / 4 corners = 6

    for (const sx of [-1, 1] as const) {
      for (const sz of [-1, 1] as const) {
        const arcCentre = { x: sx * (halfWidth - Rc), z: sz * (halfLength - Rc) };
        const cornerPanels = cornerSpecs.filter((spec) => {
          const d = Math.hypot(spec.translation.x - arcCentre.x, spec.translation.z - arcCentre.z);
          return d > Rc - 1 && d < Rc + 2 * CORNER_PANEL_HALF_THICK + 1;
        });
        expect(cornerPanels).toHaveLength(CORNER_PANELS_COUNT);

        // Panel nearest alpha=0 (adjoins the side wall, constant-x plane)
        // and nearest alpha=90 deg (adjoins the end wall, constant-z plane).
        const byAlpha = cornerPanels
          .map((spec) => ({
            spec,
            alpha: Math.atan2(sz * (spec.translation.z - arcCentre.z), sx * (spec.translation.x - arcCentre.x))
          }))
          .sort((a, b) => a.alpha - b.alpha);

        const nearSideWall = byAlpha[0]!.spec;
        const nearEndWall = byAlpha[byAlpha.length - 1]!.spec;

        const t = CORNER_PANEL_HALF_THICK;
        const outwardSide = V.applyQuaternion({ x: 0, y: 0, z: 1 }, nearSideWall.rotation);
        const innerXSide = nearSideWall.translation.x - outwardSide.x * t;
        expect(Math.abs(Math.abs(innerXSide) - halfWidth)).toBeLessThan(0.15);

        const outwardEnd = V.applyQuaternion({ x: 0, y: 0, z: 1 }, nearEndWall.rotation);
        const innerZEnd = nearEndWall.translation.z - outwardEnd.z * t;
        expect(Math.abs(Math.abs(innerZEnd) - halfLength)).toBeLessThan(0.15);
      }
    }
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
      // F3 (plan/ARENA_FLUSH_AND_REFINEMENTS_PLAN.md): `CornerWallPanel`
      // meshes are now single-sided planes positioned on the collider's
      // inner (field-facing) face, not boxes at the spec's translation
      // (the box CENTRE) — offset by `-CORNER_PANEL_HALF_THICK` along the
      // panel's own local +Z (the OUTWARD normal per
      // `yawToDirection(outward)` in `ArenaRampGeometry.ts`'s
      // `generateCorner`). `RampSegment` fillet boxes are unchanged by F3
      // and still sit exactly at `spec.translation`. Reconstruct the same
      // expected position `StadiumGeometryFactory.ts` computes, rather
      // than weakening the match to "close enough" — this keeps the test's
      // actual guarantee ("the visual surface is exactly where the physics
      // surface is") intact.
      const isCornerWall = spec.kind === "corner-wall";
      const expectedName = isCornerWall ? "CornerWallPanel" : "RampSegment";
      let expectedPos: V.Vec3Like = spec.translation;
      if (isCornerWall) {
        const outward = V.applyQuaternion({ x: 0, y: 0, z: 1 }, spec.rotation);
        expectedPos = {
          x: spec.translation.x - outward.x * CORNER_PANEL_HALF_THICK,
          y: spec.translation.y - outward.y * CORNER_PANEL_HALF_THICK,
          z: spec.translation.z - outward.z * CORNER_PANEL_HALF_THICK
        };
      }

      const matchIndex = remaining.findIndex((mesh) => {
        if (mesh.name !== expectedName) {
          return false;
        }

        const worldPos = new THREE.Vector3();
        mesh.getWorldPosition(worldPos);
        const worldQuat = new THREE.Quaternion();
        mesh.getWorldQuaternion(worldQuat);

        const posClose =
          Math.abs(worldPos.x - expectedPos.x) < 1e-3 &&
          Math.abs(worldPos.y - expectedPos.y) < 1e-3 &&
          Math.abs(worldPos.z - expectedPos.z) < 1e-3;

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
