import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MatchFlowController } from "@/game-flow/MatchFlowController";
import { PhysicsFacade } from "@/physics/PhysicsFacade";
import { NEUTRAL_CAR_INPUT } from "@/physics/PhysicsTypes";
import { VfxModule } from "@/vfx/VfxModule";

function tick(physics: PhysicsFacade, gameFlow: MatchFlowController): void {
  gameFlow.update();
  if (!gameFlow.isPaused()) {
    if (!gameFlow.areControlsActive()) {
      physics.clearAllInputs();
    }
    physics.step();
    gameFlow.applyPhysicsResults();
  }
}

const FRAME = { timestampMs: 0, frameDeltaSeconds: 1 / 60, alpha: 1 };
const COUNTDOWN_TOTAL_TICKS = 120 + 120 + 120 + 90; // 3, 2, 1, GO

function startMatch(physics: PhysicsFacade, gameFlow: MatchFlowController): void {
  gameFlow.openMatchSetup();
  gameFlow.startMatch();
  for (let i = 0; i < COUNTDOWN_TOTAL_TICKS; i += 1) {
    tick(physics, gameFlow);
  }
}

describe("VfxModule (PSX visual spec sections 18-20)", () => {
  let physics: PhysicsFacade;
  let gameFlow: MatchFlowController;
  let vfx: VfxModule;

  beforeEach(async () => {
    physics = new PhysicsFacade();
    await physics.initialise();
    gameFlow = new MatchFlowController();
    gameFlow.initialise({ physics });
    vfx = new VfxModule(physics, gameFlow);
  });

  afterEach(() => {
    vfx.dispose();
    physics.dispose();
  });

  it("starts with zero active particles", () => {
    expect(vfx.getActiveParticleCount()).toBe(0);
  });

  it("spawns boost-trail particles while a car actively consumes boost", () => {
    startMatch(physics, gameFlow);

    physics.setCarInput("car-player", { ...NEUTRAL_CAR_INPUT, throttle: 1, boost: true });
    physics.setCarInput("car-opponent", { ...NEUTRAL_CAR_INPUT });

    let sawParticles = false;
    for (let i = 0; i < 30; i += 1) {
      tick(physics, gameFlow);
      vfx.updateRenderFrame(FRAME);
      if (vfx.getActiveParticleCount() > 0) {
        sawParticles = true;
        break;
      }
    }

    expect(sawParticles).toBe(true);
  });

  it("does not spawn boost particles for a car with no boost input", () => {
    startMatch(physics, gameFlow);

    physics.setCarInput("car-player", { ...NEUTRAL_CAR_INPUT, throttle: 1, boost: false });
    physics.setCarInput("car-opponent", { ...NEUTRAL_CAR_INPUT });

    for (let i = 0; i < 30; i += 1) {
      tick(physics, gameFlow);
      vfx.updateRenderFrame(FRAME);
    }

    expect(vfx.getActiveParticleCount()).toBe(0);
  });

  it("spawns an impact burst when the ball's velocity changes abruptly", () => {
    physics.resetWorld({ carCreationOrder: ["car-player", "car-opponent"] });
    vfx.updateRenderFrame(FRAME); // baseline frame establishes "previous velocity"

    physics.setBallState({
      position: { x: 0, y: 1, z: 0 },
      linearVelocity: { x: 20, y: 0, z: 0 }
    });
    vfx.updateRenderFrame(FRAME);

    expect(vfx.getActiveParticleCount()).toBeGreaterThan(0);
  });

  it("spawns a larger celebratory burst when the match enters GOAL_CELEBRATION", () => {
    startMatch(physics, gameFlow);

    const opponentGoalCentre = physics.getGoalSensorCentre("opponent")!;
    physics.setBallState({ position: opponentGoalCentre, linearVelocity: { x: 0, y: 0, z: 0 } });
    tick(physics, gameFlow);
    tick(physics, gameFlow);

    expect(gameFlow.getSessionState().matchState).toBe("GOAL_CELEBRATION");

    vfx.updateRenderFrame(FRAME);
    expect(vfx.getActiveParticleCount()).toBeGreaterThan(20);
  });

  it("particles decay to zero after their lifetime elapses (pooling, not a leak)", () => {
    physics.resetWorld({ carCreationOrder: ["car-player", "car-opponent"] });
    vfx.updateRenderFrame(FRAME);
    physics.setBallState({ position: { x: 0, y: 1, z: 0 }, linearVelocity: { x: 20, y: 0, z: 0 } });
    vfx.updateRenderFrame(FRAME);
    expect(vfx.getActiveParticleCount()).toBeGreaterThan(0);

    for (let i = 0; i < 120; i += 1) {
      vfx.updateRenderFrame(FRAME);
    }

    expect(vfx.getActiveParticleCount()).toBe(0);
  });

  it("never exceeds the pool size even under sustained heavy spawning", () => {
    startMatch(physics, gameFlow);
    physics.setCarInput("car-player", { ...NEUTRAL_CAR_INPUT, throttle: 1, boost: true });
    physics.setCarInput("car-opponent", { ...NEUTRAL_CAR_INPUT, throttle: 1, boost: true });

    for (let i = 0; i < 400; i += 1) {
      tick(physics, gameFlow);
      vfx.updateRenderFrame(FRAME);
      expect(vfx.getActiveParticleCount()).toBeLessThanOrEqual(500);
    }
  });
});
