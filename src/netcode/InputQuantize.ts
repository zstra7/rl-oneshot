import type { CarInput } from "@/physics/PhysicsTypes";

/**
 * N1 (plan/ONLINE_MULTIPLAYER_PLAN.md, §4.3): analog input axes are
 * quantized to a fixed grid at the *sampling* seam, and the quantized
 * value is what BOTH the local simulation consumes AND the wire carries.
 *
 * This is a determinism requirement, not a bandwidth one: if the local
 * client simulated a raw float while the remote client decoded a
 * quantized int8, the two peers' simulations would disagree about the
 * exact input on every tick and desync. Quantizing before simulation
 * (single-player included) guarantees the value that gets simulated is
 * exactly the value that would survive a round trip over the wire.
 *
 * Grid: signed int8 magnitude, i.e. 255 distinct levels across [-1, 1]
 * in steps of 1/127 — well below human perceptibility for a driving
 * analog stick, and full deflection (±1) and neutral (0) are represented
 * exactly.
 */
export const INPUT_AXIS_LEVELS = 127;

function clampUnit(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }
  return value < -1 ? -1 : value > 1 ? 1 : value;
}

/** Quantize an analog axis in [-1, 1] to the shared int8 grid, as a float. */
export function quantizeAxis(value: number): number {
  return Math.round(clampUnit(value) * INPUT_AXIS_LEVELS) / INPUT_AXIS_LEVELS;
}

/** Encode an analog axis to its signed int8 wire value in [-127, 127]. */
export function axisToInt8(value: number): number {
  return Math.round(clampUnit(value) * INPUT_AXIS_LEVELS);
}

/** Decode a signed int8 wire value back to a float axis in [-1, 1]. */
export function int8ToAxis(encoded: number): number {
  const clamped = encoded < -INPUT_AXIS_LEVELS ? -INPUT_AXIS_LEVELS : encoded > INPUT_AXIS_LEVELS ? INPUT_AXIS_LEVELS : encoded;
  return clamped / INPUT_AXIS_LEVELS;
}

/**
 * Quantize every analog axis of a `CarInput` to the shared grid, leaving
 * the boolean buttons untouched. `quantizeCarInput(quantizeCarInput(x))`
 * is a fixed point, and `int8ToAxis(axisToInt8(q))` recovers `q` exactly
 * for any already-quantized axis `q` — the round-trip identity the N2
 * codec relies on.
 */
export function quantizeCarInput(input: CarInput): CarInput {
  return {
    throttle: quantizeAxis(input.throttle),
    steer: quantizeAxis(input.steer),
    pitch: quantizeAxis(input.pitch),
    yaw: quantizeAxis(input.yaw),
    roll: quantizeAxis(input.roll),
    jump: input.jump,
    boost: input.boost,
    powerslide: input.powerslide
  };
}
