import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { computeRecoveryInput } from "@/ai/GroundManeuverController";
import { PhysicsFacade } from "@/physics/PhysicsFacade";
import * as V from "@/physics/Vec3Math";

/**
 * F5 (plan/ARENA_FLUSH_AND_REFINEMENTS_PLAN.md), mandatory recovery-
 * controller re-audit (Appendix C addendum #2): `computeRecoveryInput` is
 * a P-D controller whose gains AND signs were tuned against the pre-F5
 * aerial physics (inverted, ~23x weaker). Replayed unmodified against the
 * new velocity-space AerialController, both proportional terms drove the
 * car's up vector AWAY from upright (verified via an ad hoc probe this
 * session: holding roll = -localUpTarget.x * gain constant made
 * localUpTarget.x grow instead of shrink) — so both the roll and pitch
 * proportional terms needed their sign flipped. The damping terms needed
 * flipping too (a fixed-sign damping term alone caused wide oscillation
 * that never settled, per another probe this session); with both terms
 * flipped and the ORIGINAL gain/damping magnitudes (3.0 / 0.35) the
 * controller converges cleanly with no retune needed.
 */
describe("AI recovery controller (F5 re-audit)", () => {
  let physics: PhysicsFacade;

  beforeEach(async () => {
    physics = new PhysicsFacade();
    await physics.initialise();
  });

  afterEach(() => {
    physics.dispose();
  });

  /**
   * Drop height: the plan's sketch used y=8, but an 8m free-fall was
   * probed this session to produce a violently bouncy landing (Rapier's
   * suspension/contact resolution imparts angular speed spikes upward of
   * 12 rad/s on touchdown -- well past `carMaxAngularSpeed`, which is
   * only clamped during airborne `applyAerialRotation`, not on ground
   * contact) *regardless* of `recoveryGain`/`recoveryDamping` -- this
   * reproduces with every gain/damping combination tried, so it's an
   * orthogonal suspension characteristic, not a recovery-controller bug.
   * y=3 keeps the drop unambiguously airborne (spawn-on-ground tests
   * elsewhere in this suite rest at y=1) with room to fully self-right
   * before touchdown, and lands cleanly and repeatably within the
   * plan's 240-tick (2s) budget.
   */
  const DROP_HEIGHT = 3;

  function runRecovery(initialRotation: V.Vec3Like & { w: number }, maxTicks: number) {
    physics.spawnCar({ id: "car-a", transform: { x: 0, y: DROP_HEIGHT, z: 0 } });
    physics.setCarState("car-a", {
      rotation: initialRotation,
      linearVelocity: { x: 0, y: 0, z: 0 },
      angularVelocity: { x: 0, y: 0, z: 0 }
    });

    const angularSpeedHistory: number[] = [];
    for (let i = 0; i < maxTicks; i += 1) {
      const state = physics.getCarState("car-a");
      const input = computeRecoveryInput(state);
      physics.setCarInput("car-a", input);
      physics.stepTicks(1);
      angularSpeedHistory.push(V.length(physics.getCarState("car-a").angularVelocity));
    }

    const finalState = physics.getCarState("car-a");
    const up = V.applyQuaternion(V.UP, finalState.rotation);
    const last30 = angularSpeedHistory.slice(-30);

    return { finalState, up, last30 };
  }

  it("rights a car dropped on its side and lands upright, settled", () => {
    // 90 degrees about world Z: lying on its right side.
    const angle = Math.PI / 2;
    const { finalState, up, last30 } = runRecovery(
      { x: 0, y: 0, z: Math.sin(angle / 2), w: Math.cos(angle / 2) },
      240
    );

    expect(up.y).toBeGreaterThan(0.85);
    expect(finalState.grounded).toBe(true);
    expect(Math.max(...last30)).toBeLessThan(1.0);
  });

  it("rights a car dropped exactly upside-down (the degenerate 180 case) and lands upright, settled", () => {
    // The near-exact 180-degree flip is the P-controller's unstable
    // equilibrium (localUpTarget's error terms both vanish even though
    // the car is fully inverted) -- computeRecoveryInput's
    // symmetry-breaking `roll = 1` kick handles this, verified here
    // under the new physics rather than assumed from the pre-F5 test.
    const { finalState, up, last30 } = runRecovery({ x: 0, y: 0, z: 1, w: 0 }, 240);

    expect(up.y).toBeGreaterThan(0.85);
    expect(finalState.grounded).toBe(true);
    expect(Math.max(...last30)).toBeLessThan(1.0);
  });
});
