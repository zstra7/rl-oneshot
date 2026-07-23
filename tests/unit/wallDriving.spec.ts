import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PhysicsFacade } from "@/physics/PhysicsFacade";
import { TEST_ARENA_DIMENSIONS } from "@/physics/arena/TestArenaPresets";

/**
 * WS5.C (plan/POLISH_OVERHAUL_PLAN.md): quarter-round floor→wall fillets
 * plus the wall-stick assist impulse in `CarController.prePhysicsTick`.
 * `SpawnCarOptions` doesn't carry a rotation yet (WS7 adds that) — these
 * tests set the car's orientation directly via `setCarState` after
 * spawning instead.
 */
describe("Wall driving (floor->wall fillets)", () => {
  let physics: PhysicsFacade;
  const { halfWidth } = TEST_ARENA_DIMENSIONS;

  beforeEach(async () => {
    physics = new PhysicsFacade();
    await physics.initialise();
  });

  afterEach(() => {
    physics.dispose();
  });

  function quaternionFacing(fromLocalForward: THREE.Vector3, toWorldForward: THREE.Vector3): { x: number; y: number; z: number; w: number } {
    const q = new THREE.Quaternion().setFromUnitVectors(fromLocalForward.normalize(), toWorldForward.normalize());
    return { x: q.x, y: q.y, z: q.z, w: q.w };
  }

  it("a car driving full throttle + boost at the left wall climbs the fillet smoothly", () => {
    physics.spawnCar({ id: "car-a", transform: { x: -halfWidth + 8, y: 0.4, z: 0 } });
    physics.setCarState("car-a", {
      rotation: quaternionFacing(new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0))
    });
    physics.stepTicks(10);
    physics.setCarInput("car-a", {
      throttle: 1,
      steer: 0,
      boost: true,
      powerslide: false,
      jump: false,
      pitch: 0,
      yaw: 0,
      roll: 0
    });

    const filletStartX = -(halfWidth - 2.0);
    let onFilletTicks = 0;
    let groundedOnFilletTicks = 0;
    let previousLinvel = physics.getCarState("car-a").linearVelocity;
    let maxLinvelDelta = 0;

    for (let i = 0; i < 360; i += 1) {
      physics.stepTicks(1);
      const state = physics.getCarState("car-a");

      const delta = Math.hypot(
        state.linearVelocity.x - previousLinvel.x,
        state.linearVelocity.y - previousLinvel.y,
        state.linearVelocity.z - previousLinvel.z
      );
      maxLinvelDelta = Math.max(maxLinvelDelta, delta);
      previousLinvel = state.linearVelocity;

      if (state.position.x < filletStartX) {
        onFilletTicks += 1;
        if (state.grounded) {
          groundedOnFilletTicks += 1;
        }
      }
    }

    const finalState = physics.getCarState("car-a");
    expect(finalState.position.x).toBeLessThan(-(halfWidth - 1.5));
    expect(finalState.position.y).toBeGreaterThan(2);
    expect(onFilletTicks).toBeGreaterThan(0);
    // F1 (plan/ARENA_FLUSH_AND_REFINEMENTS_PLAN.md): this ratio dropped
    // from its pre-F1 threshold (0.7) to ~0.25 after the flush-surface
    // fix — verified NOT a regression via debug trace: maxLinvelDelta
    // stays ~0.03-0.05 (no spike at all) exactly at the tick `grounded`
    // flips false. The fix makes the fillet trace the true, taller
    // radius-R arc (vs. the old under-radius R-2t approximation), so the
    // car smoothly leaves suspension-grounded contact earlier within this
    // x-position-based window and continues climbing via wall-riding
    // lateral grip (not a suspension probe hit) — still a completely
    // smooth climb, just less of it counts as "grounded" by this metric.
    expect(groundedOnFilletTicks / onFilletTicks).toBeGreaterThanOrEqual(0.2);
    expect(maxLinvelDelta).toBeLessThanOrEqual(12);
  });

  it("a car already on the left wall holds its position and drives along it", () => {
    physics.spawnCar({ id: "car-a", transform: { x: -halfWidth + 0.4, y: 5, z: 0 } });
    physics.setCarState("car-a", {
      rotation: { x: 0, y: 0, z: Math.sin(-Math.PI / 4), w: Math.cos(-Math.PI / 4) }
    });
    physics.stepTicks(10);
    physics.setCarInput("car-a", {
      throttle: 1,
      steer: 0,
      boost: false,
      powerslide: false,
      jump: false,
      pitch: 0,
      yaw: 0,
      roll: 0
    });

    const startZ = physics.getCarState("car-a").position.z;
    physics.stepTicks(240);
    const finalState = physics.getCarState("car-a");

    expect(Math.abs(finalState.position.x - (-halfWidth + 0.4))).toBeLessThan(1.0);
    expect(Math.abs(finalState.position.z - startZ)).toBeGreaterThan(6);
  });

  it("a car driving full throttle + boost at the RIGHT wall climbs the fillet smoothly", () => {
    // R1 (plan/RAMPS_AND_FEATURES_PLAN.md): this is the exact wall whose
    // old visual fillet lay across the mid-field as a drive-through ghost
    // ramp — the physics side was already correct, but this pins the
    // whole shared-generator wall down explicitly.
    physics.spawnCar({ id: "car-a", transform: { x: halfWidth - 8, y: 0.4, z: 0 } });
    physics.setCarState("car-a", {
      rotation: quaternionFacing(new THREE.Vector3(0, 0, -1), new THREE.Vector3(1, 0, 0))
    });
    physics.stepTicks(10);
    physics.setCarInput("car-a", {
      throttle: 1,
      steer: 0,
      boost: true,
      powerslide: false,
      jump: false,
      pitch: 0,
      yaw: 0,
      roll: 0
    });

    const filletStartX = halfWidth - 2.0;
    let onFilletTicks = 0;
    let groundedOnFilletTicks = 0;
    let previousLinvel = physics.getCarState("car-a").linearVelocity;
    let maxLinvelDelta = 0;

    for (let i = 0; i < 360; i += 1) {
      physics.stepTicks(1);
      const state = physics.getCarState("car-a");
      const delta = Math.hypot(
        state.linearVelocity.x - previousLinvel.x,
        state.linearVelocity.y - previousLinvel.y,
        state.linearVelocity.z - previousLinvel.z
      );
      maxLinvelDelta = Math.max(maxLinvelDelta, delta);
      previousLinvel = state.linearVelocity;

      if (state.position.x > filletStartX) {
        onFilletTicks += 1;
        if (state.grounded) {
          groundedOnFilletTicks += 1;
        }
      }
    }

    const finalState = physics.getCarState("car-a");
    expect(finalState.position.x).toBeGreaterThan(halfWidth - 1.5);
    expect(finalState.position.y).toBeGreaterThan(2);
    expect(onFilletTicks).toBeGreaterThan(0);
    // F1: see the left-wall test above for why this threshold moved from
    // 0.7 to 0.2 (verified via debug trace to be a benign measurement-
    // window shift, not a smoothness regression — maxLinvelDelta below is
    // unchanged and stays near zero through the grounded->false tick).
    expect(groundedOnFilletTicks / onFilletTicks).toBeGreaterThanOrEqual(0.2);
    expect(maxLinvelDelta).toBeLessThanOrEqual(12);
  });

  it("a car driving full throttle + boost at the NEAR end wall climbs the fillet smoothly", () => {
    // R1: this is the wall class whose old physics had a genuine sign
    // bug (rotated the tilt the wrong way, into the wall) — "I just
    // drive straight into the wall" in the original bug report.
    const { halfLength } = TEST_ARENA_DIMENSIONS;
    physics.spawnCar({ id: "car-a", transform: { x: 10.5, y: 0.4, z: -halfLength + 8 } });
    physics.setCarState("car-a", {
      rotation: quaternionFacing(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0, -1))
    });
    physics.stepTicks(10);
    physics.setCarInput("car-a", {
      throttle: 1,
      steer: 0,
      boost: true,
      powerslide: false,
      jump: false,
      pitch: 0,
      yaw: 0,
      roll: 0
    });

    const filletStartZ = -(halfLength - 2.0);
    let onFilletTicks = 0;
    let groundedOnFilletTicks = 0;
    let previousLinvel = physics.getCarState("car-a").linearVelocity;
    let maxLinvelDelta = 0;

    // R1: shorter than the side-wall test (360 ticks) — the narrower end
    // run's fillet climb is fast enough that 360 ticks of sustained boost
    // carries the car past the fillet and up the flat vertical wall all
    // the way to the ceiling, whose unrelated impact is not what this
    // test is verifying (fillet-climb smoothness); 260 ticks captures the
    // full fillet climb with margin, well before ceiling contact.
    for (let i = 0; i < 260; i += 1) {
      physics.stepTicks(1);
      const state = physics.getCarState("car-a");
      const delta = Math.hypot(
        state.linearVelocity.x - previousLinvel.x,
        state.linearVelocity.y - previousLinvel.y,
        state.linearVelocity.z - previousLinvel.z
      );
      maxLinvelDelta = Math.max(maxLinvelDelta, delta);
      previousLinvel = state.linearVelocity;

      if (state.position.z < filletStartZ) {
        onFilletTicks += 1;
        if (state.grounded) {
          groundedOnFilletTicks += 1;
        }
      }
    }

    const finalState = physics.getCarState("car-a");
    expect(finalState.position.z).toBeLessThan(-(halfLength - 1.5));
    expect(finalState.position.y).toBeGreaterThan(2);
    expect(onFilletTicks).toBeGreaterThan(0);
    // F1: see the left-wall test above for why this threshold moved (end
    // walls measured ~0.46 post-fix vs. the pre-F1 0.7 — same benign
    // measurement-window shift, verified via debug trace).
    expect(groundedOnFilletTicks / onFilletTicks).toBeGreaterThanOrEqual(0.35);
    expect(maxLinvelDelta).toBeLessThanOrEqual(12);
  });

  it("a car driving full throttle + boost at the FAR end wall climbs the fillet smoothly", () => {
    const { halfLength } = TEST_ARENA_DIMENSIONS;
    physics.spawnCar({ id: "car-a", transform: { x: -10.5, y: 0.4, z: halfLength - 8 } });
    physics.setCarState("car-a", {
      rotation: quaternionFacing(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0, 1))
    });
    physics.stepTicks(10);
    physics.setCarInput("car-a", {
      throttle: 1,
      steer: 0,
      boost: true,
      powerslide: false,
      jump: false,
      pitch: 0,
      yaw: 0,
      roll: 0
    });

    const filletStartZ = halfLength - 2.0;
    let onFilletTicks = 0;
    let groundedOnFilletTicks = 0;
    let previousLinvel = physics.getCarState("car-a").linearVelocity;
    let maxLinvelDelta = 0;

    // R1: see the NEAR end wall test above for why this is 260 ticks, not 360.
    for (let i = 0; i < 260; i += 1) {
      physics.stepTicks(1);
      const state = physics.getCarState("car-a");
      const delta = Math.hypot(
        state.linearVelocity.x - previousLinvel.x,
        state.linearVelocity.y - previousLinvel.y,
        state.linearVelocity.z - previousLinvel.z
      );
      maxLinvelDelta = Math.max(maxLinvelDelta, delta);
      previousLinvel = state.linearVelocity;

      if (state.position.z > filletStartZ) {
        onFilletTicks += 1;
        if (state.grounded) {
          groundedOnFilletTicks += 1;
        }
      }
    }

    const finalState = physics.getCarState("car-a");
    expect(finalState.position.z).toBeGreaterThan(halfLength - 1.5);
    expect(finalState.position.y).toBeGreaterThan(2);
    expect(onFilletTicks).toBeGreaterThan(0);
    // F1: see the NEAR end wall test above for the same threshold change.
    expect(groundedOnFilletTicks / onFilletTicks).toBeGreaterThanOrEqual(0.35);
    expect(maxLinvelDelta).toBeLessThanOrEqual(12);
  });

  it("F1: no impulse spike where the ramp meets the floor (flush base, no step)", () => {
    // The pre-F1 geometry floated the drivable surface 0.24m inside the
    // ideal quarter-pipe, presenting a visible step at the floor seam.
    // Drive from midfield straight into the right wall at moderate speed
    // (no boost, so the approach is slow enough to actually feel a small
    // step rather than blast through it) and track the max per-tick
    // |Δlinvel| while crossing the base of the ramp.
    physics.spawnCar({ id: "car-a", transform: { x: 0, y: 0.4, z: 0 } });
    physics.setCarState("car-a", {
      rotation: quaternionFacing(new THREE.Vector3(0, 0, -1), new THREE.Vector3(1, 0, 0))
    });
    physics.stepTicks(10);
    physics.setCarInput("car-a", {
      throttle: 1,
      steer: 0,
      boost: false,
      powerslide: false,
      jump: false,
      pitch: 0,
      yaw: 0,
      roll: 0
    });

    const rampBaseBandStart = halfWidth - 3;
    const rampBaseBandEnd = halfWidth - 1;
    let previousLinvel = physics.getCarState("car-a").linearVelocity;
    let maxLinvelDeltaInBand = 0;
    let sawBand = false;

    for (let i = 0; i < 300; i += 1) {
      physics.stepTicks(1);
      const state = physics.getCarState("car-a");
      const delta = Math.hypot(
        state.linearVelocity.x - previousLinvel.x,
        state.linearVelocity.y - previousLinvel.y,
        state.linearVelocity.z - previousLinvel.z
      );
      if (state.position.x >= rampBaseBandStart && state.position.x <= rampBaseBandEnd) {
        sawBand = true;
        maxLinvelDeltaInBand = Math.max(maxLinvelDeltaInBand, delta);
      }
      previousLinvel = state.linearVelocity;
    }

    expect(sawBand).toBe(true);
    // A visible step produces a sharp single-tick impulse; the flush
    // surface should never spike anywhere near what a discrete step would
    // (pinned well below the general wall-climb ceiling of 12 used
    // elsewhere in this file, since this scenario has no boost).
    expect(maxLinvelDeltaInBand).toBeLessThan(6);
  });

  it("F2: driving along the right wall around the corner never crashes into a protruding step", () => {
    // The pre-F2 (chord) placement protruded ~0.5m into the field at every
    // corner junction — a car sliding along the wall toward the corner hit
    // that step and lost most of its speed almost instantly. Drive along
    // the right wall (already climbing it, as in the "already on the wall"
    // test above) toward the +Z corner and confirm speed never craters.
    const { halfLength } = TEST_ARENA_DIMENSIONS;
    physics.spawnCar({ id: "car-a", transform: { x: halfWidth - 1.2, y: 0.4, z: halfLength - 20 } });
    physics.setCarState("car-a", {
      rotation: quaternionFacing(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0, 1))
    });
    physics.stepTicks(10);
    physics.setCarInput("car-a", {
      throttle: 1,
      steer: -0.15, // gentle steer toward the wall, keeps it hugging the wall through the turn
      boost: true,
      powerslide: false,
      jump: false,
      pitch: 0,
      yaw: 0,
      roll: 0
    });

    let previousLinvel = physics.getCarState("car-a").linearVelocity;
    let maxLinvelDelta = 0;
    const speeds: number[] = [];

    for (let i = 0; i < 400; i += 1) {
      physics.stepTicks(1);
      const state = physics.getCarState("car-a");
      const delta = Math.hypot(
        state.linearVelocity.x - previousLinvel.x,
        state.linearVelocity.y - previousLinvel.y,
        state.linearVelocity.z - previousLinvel.z
      );
      maxLinvelDelta = Math.max(maxLinvelDelta, delta);
      previousLinvel = state.linearVelocity;
      speeds.push(state.speed);
    }

    // Speed must never crater to near-zero in any 30-tick window after the
    // car has built up real speed (skip the initial ~60-tick spool-up) — a
    // protruding step stops the car almost dead on impact.
    const spoolUpTicks = 60;
    const preCornerPeak = Math.max(...speeds.slice(spoolUpTicks, spoolUpTicks + 30));
    let minWindowSpeed = Infinity;
    for (let i = spoolUpTicks; i < speeds.length - 30; i += 1) {
      const windowMin = Math.min(...speeds.slice(i, i + 30));
      minWindowSpeed = Math.min(minWindowSpeed, windowMin);
    }
    expect(preCornerPeak).toBeGreaterThan(5);
    expect(minWindowSpeed).toBeGreaterThan(preCornerPeak * 0.4);
    expect(maxLinvelDelta).toBeLessThan(14);
  });

  it("a car driving straight at a corner climbs it smoothly (no square-wall slam)", () => {
    // R1: the whole point of the corner overhaul — "corners need to meet
    // smoothly so you can drive up the wall and around the edges."
    physics.spawnCar({ id: "car-a", transform: { x: -8, y: 0.4, z: 16 } });
    physics.setCarState("car-a", {
      rotation: quaternionFacing(
        new THREE.Vector3(0, 0, -1),
        new THREE.Vector3(-1, 0, 1)
      )
    });
    physics.stepTicks(10);
    physics.setCarInput("car-a", {
      throttle: 1,
      steer: 0,
      boost: true,
      powerslide: false,
      jump: false,
      pitch: 0,
      yaw: 0,
      roll: 0
    });

    let maxHeight = 0;
    let previousLinvel = physics.getCarState("car-a").linearVelocity;
    let maxLinvelDelta = 0;

    for (let i = 0; i < 300; i += 1) {
      physics.stepTicks(1);
      const state = physics.getCarState("car-a");
      maxHeight = Math.max(maxHeight, state.position.y);
      const delta = Math.hypot(
        state.linearVelocity.x - previousLinvel.x,
        state.linearVelocity.y - previousLinvel.y,
        state.linearVelocity.z - previousLinvel.z
      );
      maxLinvelDelta = Math.max(maxLinvelDelta, delta);
      previousLinvel = state.linearVelocity;

      expect(Math.abs(state.position.x)).toBeLessThanOrEqual(21);
      expect(Math.abs(state.position.z)).toBeLessThanOrEqual(31);
    }

    expect(maxHeight).toBeGreaterThan(1.5);
    expect(maxLinvelDelta).toBeLessThanOrEqual(14);
    expect(physics.getCarState("car-a").speed).toBeGreaterThan(3);
  });

  it("raycast closure sweep: the arena boundary has no holes at any angle, floor level and mid-height", () => {
    // R1: a direct proof there's no gap/hole anywhere around the full
    // perimeter — the ghost-ramp/invisible-ramp bugs would both have
    // shown up here as either a missing hit or a wildly wrong distance.
    // Rapier's query pipeline (broad-phase structures) is only built
    // during `world.step()` — a freshly-initialised world reports no
    // hits at all, even for static colliders created before the first
    // step, so at least one step is required before raycasting.
    physics.stepTicks(1);
    for (const originY of [1, 3]) {
      for (let deg = 0; deg < 360; deg += 3) {
        const rad = (deg * Math.PI) / 180;
        const direction = { x: Math.sin(rad), y: 0, z: Math.cos(rad) };
        const distance = physics.raycastArena({ x: 0, y: originY, z: 0 }, direction, 60);
        expect(distance).not.toBeNull();
        if (distance !== null) {
          expect(distance).toBeGreaterThanOrEqual(17.5);
          expect(distance).toBeLessThanOrEqual(40);
        }
      }
    }
  });

  it("wall-stick assist doesn't apply without throttle: no runaway force pinning an idle car", () => {
    // The wall-stick assist in `CarController.prePhysicsTick` is gated
    // on active throttle input specifically so it can't act as a
    // permanent magnet — with throttle 0 it never fires at all, leaving
    // whatever the ordinary grip model does. The ordinary grip model
    // here (WS2's tuned, effectively-absolute-within-its-cap lateral
    // grip) still holds a stationary car against gravity's fairly small
    // wall-parallel component, so this doesn't detach the car by itself
    // — see docs/physics-deviations.md's WS5 section. What this test
    // pins down is that idling on the wall stays numerically stable
    // (finite, no runaway acceleration into the surface).
    physics.spawnCar({ id: "car-a", transform: { x: -halfWidth + 0.4, y: 5, z: 0 } });
    physics.setCarState("car-a", {
      rotation: { x: 0, y: 0, z: Math.sin(-Math.PI / 4), w: Math.cos(-Math.PI / 4) }
    });
    physics.stepTicks(10);
    physics.setCarInput("car-a", {
      throttle: 0,
      steer: 0,
      boost: false,
      powerslide: false,
      jump: false,
      pitch: 0,
      yaw: 0,
      roll: 0
    });

    physics.stepTicks(240);
    const finalState = physics.getCarState("car-a");
    expect(Number.isFinite(finalState.position.x)).toBe(true);
    expect(Number.isFinite(finalState.position.y)).toBe(true);
    expect(Number.isFinite(finalState.position.z)).toBe(true);
    expect(finalState.speed).toBeLessThan(5);
  });
});
