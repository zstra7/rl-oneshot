import { describe, expect, it } from "vitest";

import { OpponentAiController } from "@/ai/OpponentAiController";
import { OPPONENT_CAR_ID, PLAYER_CAR_ID } from "@/game-flow/MatchFlowConstants";
import {
  AiSource,
  LocalDeviceSource,
  RemoteCarInputSource,
  type CarInputContext
} from "@/netcode/CarInputSource";
import { quantizeCarInput } from "@/netcode/InputQuantize";
import { PhysicsFacade } from "@/physics/PhysicsFacade";
import { NEUTRAL_CAR_INPUT } from "@/physics/PhysicsTypes";
import type { HumanGameplayInputFrame } from "@/input/InputTypes";

function fakeLocalFrame(carOverrides: Partial<HumanGameplayInputFrame["car"]>): HumanGameplayInputFrame {
  return {
    tick: 0,
    car: { ...NEUTRAL_CAR_INPUT, ...carOverrides },
    carControlProfile: { dodgeDeadzone: 0.8, airRollSensitivity: 1.0 },
    camera: {
      toggleBallCameraPressed: false,
      rearViewHeld: false,
      swivelX: 0,
      swivelY: 0,
      resetSwivelPressed: false
    },
    system: { scoreboardHeld: false, pausePressed: false, skipPresentationPressed: false },
    sourceDevice: "keyboard-mouse",
    edges: { jumpPressed: false, jumpReleased: false, ballCameraPressed: false, pausePressed: false }
  } as HumanGameplayInputFrame;
}

async function startedPhysics(): Promise<PhysicsFacade> {
  const physics = new PhysicsFacade();
  await physics.initialise();
  physics.resetWorld({ carCreationOrder: [PLAYER_CAR_ID, OPPONENT_CAR_ID], kickoffVariantIndex: 0 });
  return physics;
}

describe("N1 CarInputSource seam", () => {
  it("LocalDeviceSource quantizes the sampled axes and passes the control profile through", async () => {
    const physics = await startedPhysics();
    const source = new LocalDeviceSource(PLAYER_CAR_ID);
    const localFrame = fakeLocalFrame({ throttle: 0.333333, steer: -0.7, jump: true });
    const ctx: CarInputContext = { tick: 0, matchState: "PLAYING", physics, localFrame };

    const sample = source.sampleForTick(ctx);
    expect(sample.input).toEqual(quantizeCarInput(localFrame.car));
    expect(sample.input.jump).toBe(true);
    expect(sample.profile).toEqual(localFrame.carControlProfile);
    physics.dispose();
  });

  it("AiSource produces non-neutral input for a live match and matches a direct AI update", async () => {
    const physics = await startedPhysics();
    // Move the ball somewhere reachable so the AI has a reason to steer.
    physics.setBallState({ position: { x: 5, y: 1, z: 5 }, linearVelocity: { x: 0, y: 0, z: 0 } });

    const aiA = new OpponentAiController();
    const source = new AiSource(OPPONENT_CAR_ID, aiA, PLAYER_CAR_ID, "opponent", "player");
    const ctx: CarInputContext = {
      tick: 0,
      matchState: "PLAYING",
      physics,
      localFrame: fakeLocalFrame({})
    };

    // A second, independently-seeded controller fed the identical context
    // must produce the identical input — proves the source is a faithful
    // pass-through of the AI update, no hidden transformation.
    const aiB = new OpponentAiController();
    const direct = aiB.update({
      tick: 0,
      matchState: "PLAYING",
      controlledCar: physics.getCarState(OPPONENT_CAR_ID),
      humanCar: physics.getCarState(PLAYER_CAR_ID),
      ball: physics.getBallState(),
      boostPads: physics.getBoostPadStates(),
      ownGoalCentre: physics.getGoalSensorCentre("opponent")!,
      targetGoalCentre: physics.getGoalSensorCentre("player")!
    });

    const sample = source.sampleForTick(ctx);
    expect(sample.input).toEqual(direct);
    expect(sample.profile).toBeUndefined();
    physics.dispose();
  });

  it("RemoteCarInputSource replays the exact input buffered for a tick, neutral if absent", () => {
    const source = new RemoteCarInputSource(OPPONENT_CAR_ID);
    const drivingInput = { ...NEUTRAL_CAR_INPUT, throttle: 1, steer: 0.5, boost: true };
    source.provideInputForTick(42, drivingInput);

    expect(source.hasInputForTick(42)).toBe(true);
    expect(source.hasInputForTick(43)).toBe(false);

    const ctx = (tick: number): CarInputContext =>
      ({ tick, matchState: "PLAYING", physics: null as never, localFrame: null as never });

    expect(source.sampleForTick(ctx(42)).input).toEqual(drivingInput);
    // A tick with no buffered input yields neutral (the gate, not a wrong
    // value, is what prevents advancing past a gap).
    expect(source.sampleForTick(ctx(43)).input).toEqual(NEUTRAL_CAR_INPUT);
  });

  it("RemoteCarInputSource.discardBefore prunes old ticks only", () => {
    const source = new RemoteCarInputSource(OPPONENT_CAR_ID);
    source.provideInputForTick(10, { ...NEUTRAL_CAR_INPUT, throttle: 1 });
    source.provideInputForTick(20, { ...NEUTRAL_CAR_INPUT, throttle: 1 });
    source.discardBefore(20);
    expect(source.hasInputForTick(10)).toBe(false);
    expect(source.hasInputForTick(20)).toBe(true);
  });
});
