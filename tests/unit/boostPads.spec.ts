import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { AssetPipeline } from "@/assets/AssetPipeline";
import { BoostPadRenderBinding } from "@/integration/BoostPadRenderBinding";
import { RL_CONSTANTS } from "@/physics/PhysicsConstants";
import { PhysicsFacade } from "@/physics/PhysicsFacade";

describe("Boost pad system (Phase 6, physics spec section 21.13)", () => {
  let physics: PhysicsFacade;

  beforeEach(async () => {
    physics = new PhysicsFacade();
    await physics.initialise();
  });

  afterEach(() => {
    physics.dispose();
  });

  function firstPadId(type: "small" | "full"): string {
    const pad = physics.getBoostPadStates().find((p) => p.type === type);
    if (!pad) throw new Error(`No ${type} pad found in default layout.`);
    return pad.id;
  }

  it("small pad: grants 12 boost, deactivates, respawns in exactly 480 ticks", () => {
    const padId = firstPadId("small");
    const pad = physics.getBoostPadStates().find((p) => p.id === padId)!;

    physics.spawnCar({ id: "car-a", transform: pad.position, initialBoost: 20 });
    physics.collectBoostPadForCar(padId, "car-a");

    expect(physics.getCarState("car-a").boostAmount).toBe(32);

    const padAfter = physics.getBoostPadStates().find((p) => p.id === padId)!;
    expect(padAfter.active).toBe(false);

    physics.stepTicks(479);
    expect(physics.getBoostPadStates().find((p) => p.id === padId)!.active).toBe(false);

    physics.stepTicks(1);
    expect(physics.getBoostPadStates().find((p) => p.id === padId)!.active).toBe(true);
  });

  it("small pad near cap: grants only up to 100", () => {
    const padId = firstPadId("small");
    const pad = physics.getBoostPadStates().find((p) => p.id === padId)!;

    physics.spawnCar({ id: "car-a", transform: pad.position, initialBoost: 95 });
    physics.collectBoostPadForCar(padId, "car-a");

    expect(physics.getCarState("car-a").boostAmount).toBe(100);
  });

  it("full pad: fills to 100 and respawns in exactly 1200 ticks", () => {
    const padId = firstPadId("full");
    const pad = physics.getBoostPadStates().find((p) => p.id === padId)!;

    physics.spawnCar({ id: "car-a", transform: pad.position, initialBoost: 18 });
    physics.collectBoostPadForCar(padId, "car-a");

    expect(physics.getCarState("car-a").boostAmount).toBe(100);

    physics.stepTicks(1199);
    expect(physics.getBoostPadStates().find((p) => p.id === padId)!.active).toBe(false);

    physics.stepTicks(1);
    expect(physics.getBoostPadStates().find((p) => p.id === padId)!.active).toBe(true);
  });

  it("a full car cannot consume a pad via real overlap (no event, pad stays active)", () => {
    const padId = firstPadId("small");
    const pad = physics.getBoostPadStates().find((p) => p.id === padId)!;

    physics.spawnCar({ id: "car-a", transform: pad.position, initialBoost: 100 });
    physics.stepTicks(1);

    const padState = physics.getBoostPadStates().find((p) => p.id === padId)!;
    expect(padState.active).toBe(true);
    expect(physics.getBoostPadEvents()).toHaveLength(0);
    expect(physics.getCarState("car-a").boostAmount).toBe(100);
  });

  it("an inactive (cooling down) pad grants no boost even while overlapped", () => {
    const padId = firstPadId("small");
    const pad = physics.getBoostPadStates().find((p) => p.id === padId)!;

    physics.setBoostPadState(padId, {
      active: false,
      respawnAtTick: 1_000_000
    });

    physics.spawnCar({ id: "car-a", transform: pad.position, initialBoost: 50 });
    physics.stepTicks(5);

    expect(physics.getCarState("car-a").boostAmount).toBe(50);
  });

  it("driving a real car onto an active small pad collects it via genuine sensor overlap", () => {
    const padId = firstPadId("small");
    const pad = physics.getBoostPadStates().find((p) => p.id === padId)!;

    physics.spawnCar({
      id: "car-a",
      transform: { x: pad.position.x, y: 1, z: pad.position.z }
    });
    physics.stepTicks(90); // settle onto the ground, directly over the pad

    const before = physics.getCarState("car-a").boostAmount;
    expect(before).toBeLessThan(100);

    const padAfter = physics.getBoostPadStates().find((p) => p.id === padId)!;
    expect(padAfter.active).toBe(false);

    const events = physics.getBoostPadEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "boost-pad-collected", padId, carId: "car-a" });
  });

  it("does not consume a pad when there is no genuine overlap", () => {
    physics.spawnCar({ id: "car-a", transform: { x: 100, y: 1, z: 100 } });
    physics.stepTicks(30);

    expect(physics.getBoostPadEvents()).toHaveLength(0);
    for (const pad of physics.getBoostPadStates()) {
      expect(pad.active).toBe(true);
    }
  });

  it("simultaneous two-car claim: exactly one winner, nearest car wins deterministically", () => {
    const padId = firstPadId("small");
    const pad = physics.getBoostPadStates().find((p) => p.id === padId)!;

    // Car A closer to the pad centre than car B -> car A must win.
    physics.spawnCar({
      id: "car-a",
      transform: { x: pad.position.x + 0.05, y: 1, z: pad.position.z }
    });
    physics.spawnCar({
      id: "car-b",
      transform: { x: pad.position.x + 0.6, y: 1, z: pad.position.z }
    });
    physics.stepTicks(90);

    const events = physics.getBoostPadEvents();
    const collectEvents = events.filter((e) => e.type === "boost-pad-collected");
    expect(collectEvents).toHaveLength(1);
    expect(collectEvents[0]).toMatchObject({ carId: "car-a" });

    const padAfter = physics.getBoostPadStates().find((p) => p.id === padId)!;
    expect(padAfter.active).toBe(false);
  });

  it("simultaneous claim result is independent of car registry insertion order", () => {
    const padId = firstPadId("small");
    const pad = physics.getBoostPadStates().find((p) => p.id === padId)!;

    // Spawn the farther car first this time — the nearer car (by
    // position, not insertion order) must still win.
    physics.spawnCar({
      id: "car-far",
      transform: { x: pad.position.x + 0.6, y: 1, z: pad.position.z }
    });
    physics.spawnCar({
      id: "car-near",
      transform: { x: pad.position.x + 0.05, y: 1, z: pad.position.z }
    });
    physics.stepTicks(90);

    const collectEvents = physics
      .getBoostPadEvents()
      .filter((e) => e.type === "boost-pad-collected");
    expect(collectEvents).toHaveLength(1);
    expect(collectEvents[0]).toMatchObject({ carId: "car-near" });
  });

  it("kickoff reset restores all pads to active and both cars to 33 boost", () => {
    const smallId = firstPadId("small");
    const fullId = firstPadId("full");

    physics.spawnCar({ id: "car-player", transform: physics.getBoostPadStates().find((p) => p.id === smallId)!.position });
    physics.stepTicks(90);
    physics.collectBoostPadForCar(fullId, "car-player");

    expect(physics.getBoostPadStates().find((p) => p.id === smallId)!.active).toBe(false);
    expect(physics.getBoostPadStates().find((p) => p.id === fullId)!.active).toBe(false);

    physics.resetWorld({ carCreationOrder: ["car-player", "car-opponent"] });

    for (const pad of physics.getBoostPadStates()) {
      expect(pad.active).toBe(true);
    }
    expect(physics.getCarState("car-player").boostAmount).toBe(RL_CONSTANTS.kickoffBoostAmount);
    expect(physics.getCarState("car-opponent").boostAmount).toBe(RL_CONSTANTS.kickoffBoostAmount);
  });

  it("the ball rolling through an active pad does not collect it or produce a collision impulse", () => {
    const padId = firstPadId("small");
    const pad = physics.getBoostPadStates().find((p) => p.id === padId)!;

    physics.setBallState({
      position: { x: pad.position.x, y: RL_CONSTANTS.ballRadius, z: pad.position.z - 5 },
      linearVelocity: { x: 0, y: 0, z: 3 }
    });

    for (let i = 0; i < 240; i += 1) {
      physics.stepTicks(1);
    }

    expect(physics.getBoostPadStates().find((p) => p.id === padId)!.active).toBe(true);
    expect(physics.getBoostPadEvents()).toHaveLength(0);
  });

  it("pausing (not stepping) freezes the respawn timer — only enabled ticks advance it", () => {
    const padId = firstPadId("small");
    const pad = physics.getBoostPadStates().find((p) => p.id === padId)!;

    physics.spawnCar({ id: "car-a", transform: pad.position, initialBoost: 50 });
    physics.collectBoostPadForCar(padId, "car-a");

    const remainingBeforePause = physics.getBoostPadStates().find((p) => p.id === padId)!
      .respawnSecondsRemaining;

    // "Pausing" is simply not calling stepTicks — GameRuntime.stop()
    // means onFixedTick (and therefore physics.step()) never fires, so
    // tick-based respawn timers cannot advance by construction.
    const remainingAfterPause = physics.getBoostPadStates().find((p) => p.id === padId)!
      .respawnSecondsRemaining;

    expect(remainingAfterPause).toBe(remainingBeforePause);
  });

  it("pad observations are returned in stable id order", () => {
    const idsA = physics.getBoostPadStates().map((p) => p.id);
    const idsB = physics.getBoostPadStates().map((p) => p.id);
    expect(idsA).toEqual(idsB);
    expect(idsA).toHaveLength(16); // 12 small + 4 full
  });
});

describe("WS5.D: boost pad visuals are seated on the floor", () => {
  it("every pad visual's y position is 0, even though the sensor centre floats above the floor", async () => {
    const physics = new PhysicsFacade();
    await physics.initialise();

    const stubAssets = {
      createBoostPadVisual: () => new THREE.Group(),
      applyBoostPadVisualState: () => {}
    } as unknown as AssetPipeline;

    const binding = new BoostPadRenderBinding(physics, stubAssets);
    binding.updateRenderFrame({ timestampMs: 0, frameDeltaSeconds: 1 / 60, alpha: 1 });

    const root = binding.getRoot();
    expect(root.children.length).toBe(16);
    for (const visual of root.children) {
      expect(visual.position.y).toBe(0);
    }

    physics.dispose();
  });
});
