import * as THREE from "three";

const TEXTURE_SIZE = 512;
const HEX_CIRCUMRADIUS = 48;
const LINE_WIDTH = 2.5;
const PRIMARY_RGBA: readonly [number, number, number, number] = [150, 225, 255, 140]; // ~0.55 alpha
const SECONDARY_RGBA: readonly [number, number, number, number] = [150, 225, 255, 31]; // ~0.12 alpha

/**
 * WS5.A (plan/POLISH_OVERHAUL_PLAN.md): a deterministic (no randomness)
 * flat-top hexagon grid on a transparent background, for the arena's
 * glass shell material. Two overlaid passes — a crisp primary grid and a
 * half-cell-offset secondary grid at low opacity — give the shell some
 * depth without needing an actual second geometry layer.
 *
 * Built as a raw `DataTexture` (a software line rasteriser into a pixel
 * buffer) rather than via `document.createElement("canvas")` /
 * `CanvasTexture`, because this factory runs under both the browser and
 * Vitest's DOM-less Node test environment (`vitest.config.ts` sets
 * `environment: "node"`) — see the identical reasoning in
 * `TextureAssetLoader.ts`'s `createCheckerTexture`.
 */
export function createHexShellTexture(): THREE.DataTexture {
  const data = new Uint8Array(TEXTURE_SIZE * TEXTURE_SIZE * 4);

  drawHexGrid(data, 0, 0, SECONDARY_RGBA, true);
  drawHexGrid(data, 0, 0, PRIMARY_RGBA, false);

  const texture = new THREE.DataTexture(data, TEXTURE_SIZE, TEXTURE_SIZE, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/** Flat-top hexagon grid outline, rasterised as a set of thick line segments. */
function drawHexGrid(
  data: Uint8Array,
  offsetX: number,
  offsetY: number,
  rgba: readonly [number, number, number, number],
  halfCellOffset: boolean
): void {
  const R = HEX_CIRCUMRADIUS;
  const hexWidth = R * 2;
  const hexHeight = Math.sqrt(3) * R;
  const colStep = hexWidth * 0.75;
  const rowStep = hexHeight;
  const cellShift = halfCellOffset ? colStep * 0.5 : 0;

  const margin = hexWidth;
  for (let cx = -margin + offsetX + cellShift; cx < TEXTURE_SIZE + margin; cx += colStep) {
    const col = Math.round((cx - offsetX - cellShift) / colStep);
    const rowOffset = col % 2 !== 0 ? rowStep / 2 : 0;
    for (let cy = -margin + offsetY + rowOffset; cy < TEXTURE_SIZE + margin; cy += rowStep) {
      strokeFlatTopHexagon(data, cx, cy, R, rgba);
    }
  }
}

function strokeFlatTopHexagon(
  data: Uint8Array,
  cx: number,
  cy: number,
  radius: number,
  rgba: readonly [number, number, number, number]
): void {
  const vertices: Array<[number, number]> = [];
  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI / 3) * i;
    vertices.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
  }
  for (let i = 0; i < 6; i += 1) {
    const [x1, y1] = vertices[i]!;
    const [x2, y2] = vertices[(i + 1) % 6]!;
    plotThickLine(data, x1, y1, x2, y2, rgba);
  }
}

function plotThickLine(
  data: Uint8Array,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rgba: readonly [number, number, number, number]
): void {
  const half = LINE_WIDTH / 2;
  const minX = Math.max(0, Math.floor(Math.min(x1, x2) - half));
  const maxX = Math.min(TEXTURE_SIZE - 1, Math.ceil(Math.max(x1, x2) + half));
  const minY = Math.max(0, Math.floor(Math.min(y1, y2) - half));
  const maxY = Math.min(TEXTURE_SIZE - 1, Math.ceil(Math.max(y1, y2) + half));
  if (minX > maxX || minY > maxY) {
    return;
  }

  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;

  for (let py = minY; py <= maxY; py += 1) {
    for (let px = minX; px <= maxX; px += 1) {
      const t = lengthSq > 0 ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSq)) : 0;
      const nx = x1 + t * dx;
      const ny = y1 + t * dy;
      const distance = Math.hypot(px - nx, py - ny);
      if (distance <= half) {
        blendPixel(data, px, py, rgba);
      }
    }
  }
}

function blendPixel(data: Uint8Array, x: number, y: number, [r, g, b, a]: readonly [number, number, number, number]): void {
  const index = (y * TEXTURE_SIZE + x) * 4;
  const existingAlpha = data[index + 3]!;
  if (a <= existingAlpha) {
    return;
  }
  data[index] = r;
  data[index + 1] = g;
  data[index + 2] = b;
  data[index + 3] = a;
}
