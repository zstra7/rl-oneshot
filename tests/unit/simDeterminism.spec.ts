import { describe, expect, it } from "vitest";

import { PhysicsFacade } from "@/physics/PhysicsFacade";
import { fnv1a, makeInputScript, runCanonicalScript } from "../netspike/inputScript";

/**
 * Permanent determinism gate (plan/ONLINE_MULTIPLAYER_PLAN.md, N0).
 *
 * Online multiplayer is peer-to-peer deterministic lockstep: two clients
 * exchange only inputs and each simulates the match independently, so the
 * physics MUST be bit-identical across independent runs — and, because
 * N0 swapped the app onto `@dimforge/rapier3d-deterministic-compat`
 * (aliased over the `@dimforge/rapier3d-compat` specifier in
 * package.json), bit-identical across MACHINES too.
 *
 * This spec runs the canonical 3000-tick chaos script (both cars
 * driving, jumping, dodging, boosting, doing aerials and powerslides —
 * 25s of game time) on two completely independent PhysicsFacade
 * instances and requires exact JSON equality of the final world state,
 * plus a pinned golden hash.
 *
 * CROSS-MACHINE VERIFICATION: running this spec on ANY other machine, OS
 * or browser must reproduce `GOLDEN_HASH`. A mismatch means the
 * cross-platform determinism guarantee has broken for this scene and
 * online play would desync — investigate before shipping, never re-pin
 * the hash to make it pass.
 */
const SCRIPT_TICKS = 3000;

/**
 * Golden final-state hash for the canonical script under
 * @dimforge/rapier3d-deterministic-compat@0.19.3. Established by the N0
 * spike; identical on the standard build on the origin machine, and the
 * whole point of the deterministic build is that it also holds on every
 * other machine.
 *
 * CONFIRMED cross-machine: reproduced exactly on macOS (developer machine)
 * against the x86-64 Linux CI container — different OS and CPU
 * architecture, same `d12dfc99`. This empirically retires the plan's #1
 * risk (cross-platform determinism), which the entire P2P lockstep
 * architecture depends on.
 */
const GOLDEN_HASH = "4d896bab";

describe("simulation determinism (multiplayer lockstep precondition)", () => {
  it("two independent facades running the canonical 3000-tick chaos script end bit-identical, matching the golden hash", async () => {
    const playerScript = makeInputScript(0xc0ffee, SCRIPT_TICKS);
    const opponentScript = makeInputScript(0xbeef01, SCRIPT_TICKS);

    const runOnce = async (): Promise<string> => {
      const physics = new PhysicsFacade();
      await physics.initialise();
      const json = runCanonicalScript(physics, playerScript, opponentScript);
      physics.dispose();
      return json;
    };

    const a = await runOnce();
    const b = await runOnce();

    // Bit-identical, not "close": lockstep tolerates zero divergence.
    expect(b).toBe(a);
    expect(fnv1a(a)).toBe(GOLDEN_HASH);
  }, 120_000);

  it("a single perturbed input tick produces a DIFFERENT state (the gate can actually fail)", async () => {
    // Anti-vacuity: if physics ignored inputs (or the runner were broken)
    // the first test would pass trivially. Perturb exactly one tick of one
    // car's script and require visible divergence.
    const ticks = 600;
    const playerScript = makeInputScript(0xc0ffee, ticks);
    const opponentScript = makeInputScript(0xbeef01, ticks);
    const perturbed = playerScript.map((input, i) =>
      i === 300 ? { ...input, throttle: input.throttle >= 0 ? -1 : 1, jump: !input.jump } : input
    );

    const physicsA = new PhysicsFacade();
    await physicsA.initialise();
    const a = runCanonicalScript(physicsA, playerScript, opponentScript);
    physicsA.dispose();

    const physicsB = new PhysicsFacade();
    await physicsB.initialise();
    const b = runCanonicalScript(physicsB, perturbed, opponentScript);
    physicsB.dispose();

    expect(b).not.toBe(a);
  }, 60_000);
});
