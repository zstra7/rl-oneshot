import type { CarInput } from "@/input/InputTypes";

/** Pre-context-resolution logical state (physics spec section 27). */
export interface LogicalGameplayState {
  accelerate: number;
  reverse: number;
  steerLeft: number;
  steerRight: number;
  pitchNoseDown: number;
  pitchNoseUp: number;
  yawLeft: number;
  yawRight: number;
  airRollLeft: boolean;
  airRollRight: boolean;
  airRollModifier: boolean;
  jumpHeld: boolean;
  boostHeld: boolean;
  powerslideHeld: boolean;
}

export function neutralLogicalGameplayState(): LogicalGameplayState {
  return {
    accelerate: 0,
    reverse: 0,
    steerLeft: 0,
    steerRight: 0,
    pitchNoseDown: 0,
    pitchNoseUp: 0,
    yawLeft: 0,
    yawRight: 0,
    airRollLeft: false,
    airRollRight: false,
    airRollModifier: false,
    jumpHeld: false,
    boostHeld: false,
    powerslideHeld: false
  };
}

/** Builds CarInput from logical state + grounded context (physics spec section 27). */
export function buildCarInput(
  logical: LogicalGameplayState,
  grounded: boolean
): CarInput {
  const throttle = logical.accelerate - logical.reverse;

  let steer = 0;
  let pitch = 0;
  let yaw = 0;
  let roll = 0;

  if (grounded) {
    steer = logical.steerRight - logical.steerLeft;
  } else {
    pitch = logical.pitchNoseDown - logical.pitchNoseUp;

    const horizontal = logical.yawRight - logical.yawLeft;

    if (logical.airRollRight) {
      roll = 1;
    } else if (logical.airRollLeft) {
      roll = -1;
    } else if (logical.airRollModifier) {
      roll = horizontal;
    } else {
      yaw = horizontal;
    }
  }

  return {
    throttle,
    steer,
    pitch,
    yaw,
    roll,
    jump: logical.jumpHeld,
    boost: logical.boostHeld,
    powerslide: grounded && logical.powerslideHeld
  };
}
