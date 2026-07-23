import type { QuatLike, Vec3Like } from "@/physics/PhysicsTypes";
import * as V from "@/physics/Vec3Math";

/**
 * R1 (plan/RAMPS_AND_FEATURES_PLAN.md): a single parametric generator for
 * the arena's floor->wall fillets and curved wall-wall corners, consumed
 * identically by the Rapier colliders (`TestArenaPresets.ts`) and the
 * rendered meshes (`StadiumGeometryFactory.ts`). Replaces the old
 * divergent `fillet()`/`createWallFillets()` pair, whose mismatch was the
 * root cause of every ramp bug reported (drive-through ghost ramp,
 * invisible/backwards ramps, broken end-wall physics, square corners) —
 * see docs/physics-deviations.md's "Arena ramps v2" section for the full
 * root-cause writeup.
 */
export interface RampSegmentSpec {
  readonly kind: "floor-fillet" | "corner-wall";
  readonly halfExtents: Vec3Like;
  readonly translation: Vec3Like;
  readonly rotation: QuatLike;
}

export interface ArenaRampDimensions {
  readonly halfWidth: number;
  readonly halfLength: number;
  readonly height: number;
  readonly goalHalfWidth: number;
}

export const RAMP_FILLET_RADIUS = 2.0;
export const RAMP_FILLET_SEGMENTS = 5;
export const RAMP_SEG_HALF_THICK = 0.12;
export const CORNER_RADIUS = 6.0;
export const CORNER_PANELS = 6;
export const CORNER_PANEL_HALF_THICK = 0.5;

const Y_AXIS: Vec3Like = { x: 0, y: 1, z: 0 };

/**
 * A yaw-only quaternion mapping local `(0,0,1)` to `direction` (unit,
 * horizontal). Derived the same way as `Vec3Math.yawFacing`: rotating
 * `(0,0,1)` by a yaw of `angle` about +Y yields `(sin(angle), 0,
 * cos(angle))` under `applyQuaternion`'s convention, so solving
 * `(dx, dz) = (sin(angle), cos(angle))` gives `angle = atan2(dx, dz)`.
 */
function yawToDirection(direction: Vec3Like): QuatLike {
  const angle = Math.atan2(direction.x, direction.z);
  return V.quatFromAxisAngle(Y_AXIS, angle);
}

/**
 * One quarter-round floor->wall fillet run, `RAMP_FILLET_SEGMENTS` flat
 * boxes approximating the arc.
 *
 * `wallBase`: centre of the run, ON the wall plane, at floor level (y=0).
 * `inward`: unit horizontal vector from the wall INTO the field.
 *
 * Template box local axes (before rotation): X = arc-chord (tangential)
 * direction, Y = surface normal, Z = run (length) direction. The run
 * direction is derived as `inward` rotated +90 degrees about Y
 * (`runDir = (inward.z, 0, -inward.x)`) — a fixed perpendicular, so the
 * subsequent tilt (rotation about `runDir` itself) always tips the
 * surface normal toward `inward`, for every wall and every corner panel,
 * with no per-wall sign case to get wrong (the bug class R1 fixes).
 */
function filletRun(wallBase: Vec3Like, inward: Vec3Like, runHalfLength: number): RampSegmentSpec[] {
  const R = RAMP_FILLET_RADIUS;
  const t = RAMP_SEG_HALF_THICK;
  const runDir: Vec3Like = { x: inward.z, y: 0, z: -inward.x };
  const qYaw = yawToDirection(runDir);
  const chordHalf = ((R * (Math.PI / 2)) / RAMP_FILLET_SEGMENTS) * 0.6;

  const specs: RampSegmentSpec[] = [];
  for (let i = 0; i < RAMP_FILLET_SEGMENTS; i += 1) {
    const theta = (i + 0.5) * (Math.PI / 2 / RAMP_FILLET_SEGMENTS);
    // F1 (plan/ARENA_FLUSH_AND_REFINEMENTS_PLAN.md): centres sit on radius
    // R+t (not R-t) so the segment's INNER (drivable) face lands exactly on
    // the tangent circle of radius R — flush with the floor at theta=0 and
    // flush with the wall plane at theta=90 degrees. The old R-t placement
    // floated the drivable surface 2t (0.24m) inside the ideal quarter-pipe,
    // producing a visible step/lip at both the floor and wall seams. See
    // docs/physics-deviations.md's F1 section for the full derivation.
    const inset = R - (R + t) * Math.sin(theta);
    const y = R - (R + t) * Math.cos(theta);
    const qTilt = V.quatFromAxisAngle(runDir, theta);

    specs.push({
      kind: "floor-fillet",
      halfExtents: { x: chordHalf, y: t, z: runHalfLength },
      translation: {
        x: wallBase.x + inward.x * inset,
        y,
        z: wallBase.z + inward.z * inset
      },
      rotation: V.quatMultiply(qTilt, qYaw)
    });
  }
  return specs;
}

/** Unit horizontal direction at arc angle `alpha` around a corner whose side/end signs are `sx`/`sz`. */
function cornerOutward(alpha: number, sx: -1 | 1, sz: -1 | 1): Vec3Like {
  return { x: sx * Math.cos(alpha), y: 0, z: sz * Math.sin(alpha) };
}

function generateCorner(
  sx: -1 | 1,
  sz: -1 | 1,
  dims: ArenaRampDimensions
): RampSegmentSpec[] {
  const Rc = CORNER_RADIUS;
  const t = CORNER_PANEL_HALF_THICK;
  const arcCentre: Vec3Like = { x: sx * (dims.halfWidth - Rc), y: 0, z: sz * (dims.halfLength - Rc) };
  const delta = Math.PI / 2 / CORNER_PANELS;
  // F2 (plan/ARENA_FLUSH_AND_REFINEMENTS_PLAN.md): circumscribed (tangent)
  // placement instead of inscribed (chord) placement. The old chord
  // placement (`Rc * cos(delta/2)` centre distance, panel half-thickness t)
  // put each panel's INNER (field-facing) face at radius
  // `Rc*cos(delta/2) - t` (~5.45 for Rc=6, 6 panels) — ~0.55m inside the
  // ideal arc of radius Rc where the straight walls are tangent, so a car
  // sliding along a straight wall hit a ~0.5m step at every corner
  // junction. Circumscribing instead (centre at `Rc + t`) puts the inner
  // face's MIDPOINT exactly on the tangent circle of radius Rc; at panel
  // edges it recedes slightly outward (radius `Rc/cos(delta/2)`, ~5cm) —
  // shallow, harmless grooves rather than a protrusion into the field. The
  // wider `chordHalf` (tangent-to-tangent, not chord-to-chord) makes
  // adjacent panels' faces meet/slightly overlap instead of gapping. See
  // docs/physics-deviations.md's F2 section for the full derivation.
  const panelCentreDistance = Rc + t;
  const chordHalf = Rc * Math.tan(delta / 2) + 0.05;

  const specs: RampSegmentSpec[] = [];
  for (let i = 0; i < CORNER_PANELS; i += 1) {
    const alphaMid = (i + 0.5) * delta;
    const outward = cornerOutward(alphaMid, sx, sz);
    const panelCentre: Vec3Like = {
      x: arcCentre.x + outward.x * panelCentreDistance,
      y: 0,
      z: arcCentre.z + outward.z * panelCentreDistance
    };

    specs.push({
      kind: "corner-wall",
      halfExtents: { x: chordHalf, y: dims.height / 2, z: t },
      translation: { x: panelCentre.x, y: dims.height / 2, z: panelCentre.z },
      rotation: yawToDirection(outward)
    });

    const inward: Vec3Like = { x: -outward.x, y: 0, z: -outward.z };
    // The corner's floor->wall fillet run is based on the WALL'S INNER
    // FACE (tangent point, radius Rc from the arc centre), not the panel
    // centre — panelCentre now sits further out (at Rc+t) than the
    // drivable surface it's blending into.
    const wallBase: Vec3Like = {
      x: arcCentre.x + outward.x * Rc,
      y: 0,
      z: arcCentre.z + outward.z * Rc
    };
    specs.push(...filletRun(wallBase, inward, chordHalf + 0.1));
  }
  return specs;
}

/**
 * Full arena ramp/corner segment set: 10 side-wall + 20 end-wall +
 * 120 corner floor-fillet segments (150 total), plus 24 curved corner
 * wall panels. Goal mouths (end runs stop short of the goal half-width)
 * and the mid-field (all segments hug the walls/corners) stay clear.
 */
export function generateArenaRamps(dims: ArenaRampDimensions): RampSegmentSpec[] {
  const { halfWidth, halfLength, goalHalfWidth } = dims;
  const Rc = CORNER_RADIUS;

  const specs: RampSegmentSpec[] = [];

  // Side walls: z in [-(halfLength-Rc), halfLength-Rc].
  const sideRunHalfLength = halfLength - Rc;
  specs.push(...filletRun({ x: halfWidth, y: 0, z: 0 }, { x: -1, y: 0, z: 0 }, sideRunHalfLength));
  specs.push(...filletRun({ x: -halfWidth, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, sideRunHalfLength));

  // End walls: two shorter runs either side of the goal mouth, stopping
  // short of each corner.
  const endRunHalfLength = (halfWidth - Rc - goalHalfWidth) / 2;
  const endRunCentreX = goalHalfWidth + endRunHalfLength;
  for (const zSign of [-1, 1] as const) {
    for (const xSign of [-1, 1] as const) {
      const wallBase: Vec3Like = { x: xSign * endRunCentreX, y: 0, z: zSign * halfLength };
      const inward: Vec3Like = { x: 0, y: 0, z: -zSign };
      specs.push(...filletRun(wallBase, inward, endRunHalfLength));
    }
  }

  // Corners.
  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      specs.push(...generateCorner(sx, sz, dims));
    }
  }

  return specs;
}
