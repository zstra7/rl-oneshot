import type { QuatLike, Vec3Like } from "@/physics/PhysicsTypes";

export type { Vec3Like };

/** Plain-number vector math for the physics module — no THREE.js dependency. */

export function add(a: Vec3Like, b: Vec3Like): Vec3Like {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function sub(a: Vec3Like, b: Vec3Like): Vec3Like {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function scale(a: Vec3Like, s: number): Vec3Like {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

export function dot(a: Vec3Like, b: Vec3Like): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross(a: Vec3Like, b: Vec3Like): Vec3Like {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  };
}

export function length(a: Vec3Like): number {
  return Math.sqrt(dot(a, a));
}

export function normalize(a: Vec3Like): Vec3Like {
  const len = length(a);
  if (len < 1e-9) {
    return { x: 0, y: 0, z: 0 };
  }
  return scale(a, 1 / len);
}

export function clampMagnitude(a: Vec3Like, max: number): Vec3Like {
  const len = length(a);
  if (len <= max || len < 1e-9) {
    return a;
  }
  return scale(a, max / len);
}

export function applyQuaternion(v: Vec3Like, q: { x: number; y: number; z: number; w: number }): Vec3Like {
  // Standard quaternion-vector rotation (v' = q * v * q^-1), expanded.
  const { x: qx, y: qy, z: qz, w: qw } = q;
  const { x, y, z } = v;

  const ix = qw * x + qy * z - qz * y;
  const iy = qw * y + qz * x - qx * z;
  const iz = qw * z + qx * y - qy * x;
  const iw = -qx * x - qy * y - qz * z;

  return {
    x: ix * qw + iw * -qx + iy * -qz - iz * -qy,
    y: iy * qw + iw * -qy + iz * -qx - ix * -qz,
    z: iz * qw + iw * -qz + ix * -qy - iy * -qx
  };
}

export function moveToward(current: number, target: number, maxDelta: number): number {
  if (Math.abs(target - current) <= maxDelta) {
    return target;
  }
  return current + Math.sign(target - current) * maxDelta;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function signOrOne(value: number): number {
  return value >= 0 ? 1 : -1;
}

export const ZERO: Vec3Like = { x: 0, y: 0, z: 0 };
export const UP: Vec3Like = { x: 0, y: 1, z: 0 };
export const LOCAL_FORWARD: Vec3Like = { x: 0, y: 0, z: -1 };
export const LOCAL_RIGHT: Vec3Like = { x: 1, y: 0, z: 0 };

/**
 * WS7.A-2 (plan/POLISH_OVERHAUL_PLAN.md): a yaw-only quaternion that
 * points `LOCAL_FORWARD` (0,0,-1) from `from` toward `to` (flattened,
 * y ignored). Derived from `applyQuaternion`'s rotate-about-Y convention:
 * a yaw of `theta` maps local forward to `(-sin(theta), 0, -cos(theta))`
 * (verified against the two known reference poses — yaw 0 keeps facing
 * -Z, yaw pi flips to face +Z), so solving `(dx,dz) = (-sin(theta),
 * -cos(theta))` gives `theta = atan2(-dx, -dz)`.
 */
export function yawFacing(from: Vec3Like, to: Vec3Like): QuatLike {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const theta = Math.atan2(-dx, -dz);
  return { x: 0, y: Math.sin(theta / 2), z: 0, w: Math.cos(theta / 2) };
}
