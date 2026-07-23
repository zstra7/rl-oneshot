import { describe, expect, it } from "vitest";

import {
  buildCarInput,
  neutralLogicalGameplayState
} from "@/input/LogicalGameplayState";

describe("buildCarInput (physics spec section 27)", () => {
  it("neutral logical state produces neutral CarInput", () => {
    const car = buildCarInput(neutralLogicalGameplayState(), true);
    expect(car).toEqual({
      throttle: 0,
      steer: 0,
      pitch: 0,
      yaw: 0,
      roll: 0,
      jump: false,
      boost: false,
      powerslide: false
    });
  });

  it("grounded: accelerate maps to throttle=1, steer stays 0 with no lateral input", () => {
    const logical = { ...neutralLogicalGameplayState(), accelerate: 1 };
    const car = buildCarInput(logical, true);
    expect(car.throttle).toBe(1);
    expect(car.steer).toBe(0);
  });

  it("grounded: accelerate + steer right", () => {
    const logical = { ...neutralLogicalGameplayState(), accelerate: 1, steerRight: 1 };
    const car = buildCarInput(logical, true);
    expect(car.throttle).toBe(1);
    expect(car.steer).toBe(1);
  });

  it("grounded: reverse maps to throttle=-1", () => {
    const logical = { ...neutralLogicalGameplayState(), reverse: 1 };
    const car = buildCarInput(logical, true);
    expect(car.throttle).toBe(-1);
  });

  it("grounded: powerslide only applies while grounded", () => {
    const logical = { ...neutralLogicalGameplayState(), powerslideHeld: true };
    expect(buildCarInput(logical, true).powerslide).toBe(true);
    expect(buildCarInput(logical, false).powerslide).toBe(false);
  });

  it("airborne: pitch/yaw resolve instead of steer", () => {
    const logical = {
      ...neutralLogicalGameplayState(),
      pitchNoseDown: 1,
      yawRight: 1
    };
    const car = buildCarInput(logical, false);
    expect(car.steer).toBe(0);
    expect(car.pitch).toBe(1);
    expect(car.yaw).toBe(1);
    expect(car.roll).toBe(0);
  });

  it("airborne: air roll modifier replaces yaw with roll", () => {
    const logical = {
      ...neutralLogicalGameplayState(),
      yawRight: 1,
      airRollModifier: true
    };
    const car = buildCarInput(logical, false);
    expect(car.yaw).toBe(0);
    expect(car.roll).toBe(1);
  });

  it("airborne: explicit air roll left/right bindings take priority over the modifier", () => {
    const logical = {
      ...neutralLogicalGameplayState(),
      yawRight: 1,
      airRollModifier: true,
      airRollLeft: true
    };
    const car = buildCarInput(logical, false);
    expect(car.roll).toBe(-1);
  });

  it("jump/boost are held-state pass-throughs regardless of grounded state", () => {
    const logical = { ...neutralLogicalGameplayState(), jumpHeld: true, boostHeld: true };
    expect(buildCarInput(logical, true).jump).toBe(true);
    expect(buildCarInput(logical, true).boost).toBe(true);
    expect(buildCarInput(logical, false).jump).toBe(true);
    expect(buildCarInput(logical, false).boost).toBe(true);
  });
});
