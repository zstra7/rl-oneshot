import type { OpponentAiController } from "@/ai/OpponentAiController";
import type { TeamId } from "@/core/TeamTypes";
import type { MatchState } from "@/game-flow/MatchFlowTypes";
import type { HumanGameplayInputFrame } from "@/input/InputTypes";
import type { PhysicsFacade } from "@/physics/PhysicsFacade";
import { NEUTRAL_CAR_INPUT, type CarControlProfile, type CarId, type CarInput } from "@/physics/PhysicsTypes";

import { quantizeCarInput } from "@/netcode/InputQuantize";

/**
 * N1 (plan/ONLINE_MULTIPLAYER_PLAN.md): the seam that lets a car's
 * per-tick `CarInput` come from any origin — the local device, the AI, or
 * a remote peer over the wire — without `GameRuntime.onFixedTick` knowing
 * or caring which. Every car in the simulation is driven by exactly one
 * `CarInputSource`, keyed by `CarId`; single-player wires up
 * `{ player: LocalDeviceSource, opponent: AiSource }`, online 1v1 (N5)
 * swaps the opponent for a `RemoteCarInputSource`. Nothing downstream is
 * hard-coded to "the player" or "the AI" — which is also what keeps the
 * core 2v2-ready (§4.6): peer/car count is just the size of this map.
 */
export interface CarInputContext {
  readonly tick: number;
  readonly matchState: MatchState;
  /** Read access to the current simulation state (AI sources observe it). */
  readonly physics: PhysicsFacade;
  /** The already-sampled local input frame (the local device source consumes it). */
  readonly localFrame: HumanGameplayInputFrame;
}

export interface CarInputSample {
  readonly input: CarInput;
  /** Only local human sources carry a control profile (dodge deadzone / air-roll sensitivity). */
  readonly profile?: CarControlProfile;
}

export interface CarInputSource {
  readonly carId: CarId;
  sampleForTick(context: CarInputContext): CarInputSample;
}

/**
 * The local player's own device. Quantizes the sampled analog axes to the
 * shared wire grid (§4.3) so single-player and online simulate the exact
 * same input space, and carries the local control profile through.
 */
export class LocalDeviceSource implements CarInputSource {
  public constructor(public readonly carId: CarId) {}

  public sampleForTick(context: CarInputContext): CarInputSample {
    return {
      input: quantizeCarInput(context.localFrame.car),
      profile: context.localFrame.carControlProfile
    };
  }
}

/**
 * An AI-controlled car. Wraps the existing `OpponentAiController` update,
 * reading the same simulation state the inline runtime code used to read,
 * and returns neutral input if the goal sensors aren't available yet
 * (mirrors the original `if (ownGoalCentre && targetGoalCentre)` guard).
 */
export class AiSource implements CarInputSource {
  public constructor(
    public readonly carId: CarId,
    private readonly ai: OpponentAiController,
    private readonly targetCarId: CarId,
    private readonly ownGoalTeam: TeamId,
    private readonly targetGoalTeam: TeamId
  ) {}

  public sampleForTick(context: CarInputContext): CarInputSample {
    const { physics } = context;
    const ownGoalCentre = physics.getGoalSensorCentre(this.ownGoalTeam);
    const targetGoalCentre = physics.getGoalSensorCentre(this.targetGoalTeam);
    if (!ownGoalCentre || !targetGoalCentre) {
      return { input: { ...NEUTRAL_CAR_INPUT } };
    }

    const input = this.ai.update({
      tick: context.tick,
      matchState: context.matchState,
      controlledCar: physics.getCarState(this.carId),
      humanCar: physics.getCarState(this.targetCarId),
      ball: physics.getBallState(),
      boostPads: physics.getBoostPadStates(),
      ownGoalCentre,
      targetGoalCentre
    });
    return { input };
  }
}

/**
 * A car driven by a remote peer. Inputs arrive out of band (N2 pushes
 * decoded wire inputs into the per-tick buffer) and are replayed exactly
 * on the tick they belong to, so the remote peer's car simulates
 * identically on both machines. `hasInputForTick` is what the lockstep
 * `TickAdvanceGate` consults before allowing the simulation to advance —
 * a missing input stalls the sim rather than substituting a wrong value.
 * In N1 this is wired but unused (single-player has no remote car); N2
 * feeds it and N5 installs it as the opponent source in online mode.
 */
export class RemoteCarInputSource implements CarInputSource {
  private readonly buffer = new Map<number, CarInput>();

  public constructor(public readonly carId: CarId) {}

  public provideInputForTick(tick: number, input: CarInput): void {
    this.buffer.set(tick, input);
  }

  public hasInputForTick(tick: number): boolean {
    return this.buffer.has(tick);
  }

  public sampleForTick(context: CarInputContext): CarInputSample {
    const input = this.buffer.get(context.tick);
    return { input: input ?? { ...NEUTRAL_CAR_INPUT } };
  }

  /** Drop confirmed-and-simulated inputs so the buffer can't grow without bound. */
  public discardBefore(tick: number): void {
    for (const bufferedTick of this.buffer.keys()) {
      if (bufferedTick < tick) {
        this.buffer.delete(bufferedTick);
      }
    }
  }
}
