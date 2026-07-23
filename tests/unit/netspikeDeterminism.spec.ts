import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { PhysicsFacade } from "@/physics/PhysicsFacade";
import { fnv1a, makeInputScript, runCanonicalScript } from "../netspike/inputScript";

/**
 * Netcode spike gate 1 (plan/ONLINE_MULTIPLAYER_PLAN.md): deterministic
 * lockstep is only viable if two independent simulations fed identical
 * inputs stay BIT-IDENTICAL. This runs the full canonical chaos script
 * (driving, jumps, dodges, boost, aerials, powerslides — 3000 ticks =
 * 25s of game time) on two completely independent PhysicsFacade
 * instances and requires exact JSON equality of the final world state.
 *
 * Runs under two configs:
 * - default `vitest.config.ts` — the standard `@dimforge/rapier3d-compat`
 *   build (vendor guarantee: deterministic on the same machine only);
 * - `vitest.netspike.config.ts` — aliases the physics dependency to
 *   `@dimforge/rapier3d-deterministic-compat` (vendor guarantee:
 *   deterministic across machines/browsers/OSes), sets
 *   NETSPIKE_DETERMINISTIC_BUILD=1, and additionally pins the golden
 *   cross-machine hash below.
 */
const SCRIPT_TICKS = 3000;

/**
 * Golden final-state hash under the DETERMINISTIC build only. Any
 * machine, any OS, any browser running this exact script on
 * @dimforge/rapier3d-deterministic-compat@0.19.3 must reproduce it —
 * running this spec on a second machine IS the cross-machine
 * determinism test. (The standard build makes no cross-machine
 * guarantee, so no hash is pinned for it.)
 */
const GOLDEN_DETERMINISTIC_HASH = "d12dfc99";

describe("netcode spike: cross-instance physics determinism", () => {
  it("two independent facades running the canonical 3000-tick chaos script end bit-identical", async () => {
    const playerScript = makeInputScript(0xc0ffee, SCRIPT_TICKS);
    const opponentScript = makeInputScript(0xbeef01, SCRIPT_TICKS);

    const runOnce = async (): Promise<string> => {
      const physics = new PhysicsFacade();
      await physics.initialise();
      const json = runCanonicalScript(physics, playerScript, opponentScript);
      physics.dispose();
      return json;
    };

    const started = performance.now();
    const a = await runOnce();
    const perRunMs = (performance.now() - started);
    const b = await runOnce();

    // Bit-identical, not "close": lockstep tolerates zero divergence.
    expect(b).toBe(a);

    const hash = fnv1a(a);
    const stepMs = perRunMs / SCRIPT_TICKS;
    const build = process.env["NETSPIKE_DETERMINISTIC_BUILD"] === "1" ? "deterministic" : "standard";
    // The default reporter suppresses passing-test stdout, so persist
    // the measurements where the spike operator can read them.
    writeFileSync(
      join(tmpdir(), `netspike-report-${build}.json`),
      JSON.stringify(
        {
          build,
          hash,
          stepCostMs: Number(stepMs.toFixed(4)),
          rollbackTicksPer8ms: Math.floor(8 / stepMs),
          scriptTicks: SCRIPT_TICKS
        },
        null,
        2
      )
    );

    if (process.env["NETSPIKE_DETERMINISTIC_BUILD"] === "1") {
      expect(hash).toBe(GOLDEN_DETERMINISTIC_HASH);
    }
  }, 120_000);

  it("a single dropped-then-recovered input tick produces a DIFFERENT state (the test can actually fail)", async () => {
    // Anti-vacuity check: if the physics ignored inputs (or the runner
    // was broken), the first test would pass trivially. Perturb exactly
    // one tick of one car's script and require visible divergence.
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
