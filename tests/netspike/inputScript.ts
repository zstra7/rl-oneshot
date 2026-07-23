/**
 * Netcode spike (plan/ONLINE_MULTIPLAYER_PLAN.md): canonical scripted
 * input generation + simulation runner shared by every determinism/
 * lockstep spike test.
 *
 * DELIBERATELY SELF-CONTAINED: `makeInputScript` and
 * `runCanonicalScript` reference nothing outside their own bodies, so
 * the Playwright spike can ship them into the page verbatim via
 * `fn.toString()` and the vitest spikes can import them normally — one
 * canonical definition, guaranteed identical in every environment,
 * which is the whole point of a determinism test.
 */

export interface ScriptedCarInput {
  throttle: number;
  steer: number;
  pitch: number;
  yaw: number;
  roll: number;
  jump: boolean;
  boost: boolean;
  powerslide: boolean;
}

/** The narrow sim surface the runner needs — satisfied by both `PhysicsFacade` (vitest) and `window.__PHYSICS_TEST__` (browser). */
export interface NetspikeSimApi {
  resetWorld(options?: { carCreationOrder?: readonly string[]; kickoffVariantIndex?: number }): void;
  setCarInput(carId: string, input: ScriptedCarInput): void;
  clearAllInputs(): void;
  stepTicks(count: number): void;
  getWorldState(): {
    tick: number;
    simulationTime: number;
    cars: readonly unknown[];
    ball: unknown;
    boostPads: readonly unknown[];
  };
}

/**
 * Deterministic chaotic input script for one car: ground driving with
 * steering, periodic jumps/double-jump dodges (jump edge + deflection),
 * boost windows, aerial pitch/yaw/roll stretches, powerslide bursts.
 * Mulberry32-seeded; analog values quantised to 1/64 so the exact same
 * doubles are produced (and would survive a realistic quantised wire
 * encoding) in every environment.
 */
export function makeInputScript(seed: number, ticks: number): ScriptedCarInput[] {
  let s = seed >>> 0;
  const rand = (): number => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const q = (v: number): number => Math.round(v * 64) / 64;

  const out: ScriptedCarInput[] = [];
  let throttle = 1;
  let steer = 0;
  let pitch = 0;
  let yaw = 0;
  let roll = 0;
  let boostUntil = -1;
  let slideUntil = -1;
  let jumpAt = 30 + Math.floor(rand() * 60);

  for (let tick = 0; tick < ticks; tick += 1) {
    // Re-roll analog steering/aerial axes every 9 ticks (75ms) — twitchy
    // enough to explore the state space, slow enough to look like play.
    if (tick % 9 === 0) {
      throttle = q(rand() * 2 - 0.6);
      steer = q(rand() * 2 - 1);
      pitch = q(rand() * 2 - 1);
      yaw = q(rand() * 2 - 1);
      roll = q(rand() * 2 - 1);
    }
    if (tick % 37 === 0 && rand() < 0.5) {
      boostUntil = tick + 12 + Math.floor(rand() * 20);
    }
    if (tick % 53 === 0 && rand() < 0.35) {
      slideUntil = tick + 8 + Math.floor(rand() * 10);
    }
    // Jump press held 3 ticks; roughly every second, sometimes followed
    // 20 ticks later by a second press (dodge) while deflected.
    const jumping = tick >= jumpAt && tick < jumpAt + 3;
    const dodging = tick >= jumpAt + 20 && tick < jumpAt + 22 && rand() < 2; // rand() consumed for stream parity
    if (tick === jumpAt + 25) {
      jumpAt = tick + 60 + Math.floor(rand() * 90);
    }

    out.push({
      throttle,
      steer,
      pitch,
      yaw,
      roll,
      jump: jumping || dodging,
      boost: tick < boostUntil,
      powerslide: tick < slideUntil
    });
  }
  return out;
}

/**
 * Resets the world to the canonical kickoff (variant 0 — the exact
 * deterministic reset real kickoffs use, which also restores boost/jump/
 * dodge runtime state that `setCarState` cannot), then applies the two
 * scripts tick by tick and returns the final world state as a JSON
 * string with the bookkeeping fields (`tick`, `simulationTime`) stripped
 * — those legitimately differ across environments that have already
 * simulated menu time, while `cars`/`ball`/`boostPads` must not.
 */
export function runCanonicalScript(
  api: NetspikeSimApi,
  playerScript: ScriptedCarInput[],
  opponentScript: ScriptedCarInput[]
): string {
  api.resetWorld({ carCreationOrder: ["car-player", "car-opponent"], kickoffVariantIndex: 0 });
  api.clearAllInputs();

  const ticks = Math.min(playerScript.length, opponentScript.length);
  for (let tick = 0; tick < ticks; tick += 1) {
    api.setCarInput("car-player", playerScript[tick]!);
    api.setCarInput("car-opponent", opponentScript[tick]!);
    api.stepTicks(1);
  }

  const world = api.getWorldState();
  return JSON.stringify({ cars: world.cars, ball: world.ball, boostPads: world.boostPads });
}

/** FNV-1a 32-bit, hex — compact fingerprint of a canonical-run JSON string. */
export function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
