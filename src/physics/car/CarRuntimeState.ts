import type { DodgeState, Vec3Like } from "@/physics/PhysicsTypes";

/** Per-car mutable state (physics spec section 15). Never shared between cars. */
export interface CarRuntimeState {
  grounded: boolean;
  wheelContactCount: number;
  supportNormal: Vec3Like;
  ticksSinceGrounded: number;

  firstJumpUsed: boolean;
  secondJumpAvailable: boolean;
  jumpButtonHeldTicks: number;
  jumpHoldElapsed: number;
  jumpElapsed: number;
  stickyTicksRemaining: number;
  secondJumpWindowElapsed: number;
  /**
   * True once the car has actually left ground contact since the first
   * jump was triggered. The suspension probe's maximumLength is generous
   * enough that `grounded` can still read true for a tick or two right
   * after the jump impulse — without this flag, processJumpReset would
   * immediately re-arm the first jump before the car ever left the
   * ground, eating the second jump/dodge window.
   */
  hasLeftGroundSinceJump: boolean;

  dodgeState: DodgeState;
  dodgeElapsed: number;
  dodgeDirection: { x: number; z: number };
  /** World-space axis the flip rotates about, fixed at trigger time (WS3). */
  dodgeAxis: Vec3Like;
  /** The dodge's local forward input component at trigger time, used to
   * detect an opposing (flip-cancel) pitch input during the active phase. */
  dodgeForwardInput: number;
  /** 0 = flip at full rate, 1 = fully cancelled (WS3 flip-cancel blend). */
  dodgeCancelBlend: number;

  powerslideBlend: number;
  boostAmount: number;
  supersonic: boolean;
}

export function createInitialCarRuntimeState(initialBoost: number): CarRuntimeState {
  return {
    grounded: false,
    wheelContactCount: 0,
    supportNormal: { x: 0, y: 1, z: 0 },
    ticksSinceGrounded: 0,

    firstJumpUsed: false,
    secondJumpAvailable: false,
    jumpButtonHeldTicks: 0,
    jumpHoldElapsed: 0,
    jumpElapsed: 0,
    stickyTicksRemaining: 0,
    secondJumpWindowElapsed: 0,
    hasLeftGroundSinceJump: false,

    dodgeState: "none",
    dodgeElapsed: 0,
    dodgeDirection: { x: 0, z: 0 },
    dodgeAxis: { x: 0, y: 0, z: 0 },
    dodgeForwardInput: 0,
    dodgeCancelBlend: 0,

    powerslideBlend: 0,
    boostAmount: initialBoost,
    supersonic: false
  };
}
