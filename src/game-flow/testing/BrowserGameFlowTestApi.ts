import { otherTeam, type TeamId } from "@/core/TeamTypes";
import type { MatchFlowController } from "@/game-flow/MatchFlowController";
import type {
  GameSessionState,
  MatchConfig,
  MatchDurationMinutes,
  MatchFlowEvent,
  MatchState
} from "@/game-flow/MatchFlowTypes";
import { RL_CONSTANTS } from "@/physics/PhysicsConstants";
import type { PhysicsFacade } from "@/physics/PhysicsFacade";

/**
 * Trimmed to what Phase 7 implements. The full game-flow spec section 39
 * `BrowserGameTestApi` interface also specifies `resetApplication`,
 * `simulateBoostPadPickup`/`getBoostPadVisualStates` (boost-pad VFX state
 * lives in the render layer, not built until Phase 14), and
 * `setVisualPreset`/`getVisualPreset`/`setCameraPreset`/
 * `setPresentationSeed`/`getVisualDiagnostics` (Phase 8 camera / Phase 13
 * visual language) — see docs/build-decisions.md.
 */
export interface BrowserGameFlowTestApi {
  ready(): boolean;

  getMatchState(): MatchState;
  getSessionState(): GameSessionState;

  openMainMenu(): void;
  openMatchSetup(): void;
  openSettings(): void;
  openCarCustomise(): void;
  openCredits(): void;

  selectMatchDuration(minutes: MatchDurationMinutes): void;
  startMatch(config?: Partial<MatchConfig>): void;

  advanceGameTicks(count: number): void;
  advanceGameSeconds(seconds: number): void;

  simulateGoal(scoringTeam: TeamId): void;
  simulateBallFloorContact(): void;

  pause(): void;
  resume(): void;
  replayMatch(): void;
  returnToMenu(): void;

  getMatchFlowEvents(): readonly MatchFlowEvent[];
  clearMatchFlowEvents(): void;
}

export function createGameFlowTestApi(
  gameFlow: MatchFlowController,
  physics: PhysicsFacade,
  advanceTicks: (count: number) => void,
  /**
   * Called after any action that mutates match-flow state outside the
   * tick loop (menu navigation, pause/resume, replay, return-to-menu).
   * `advanceTicks`-driven actions already re-emit through the normal
   * per-tick path and do not need this — see GameRuntime.onFixedTick's
   * `emitSessionStateChanged`.
   */
  notifyStateChanged: () => void
): BrowserGameFlowTestApi {
  function withNotify(action: () => void): void {
    action();
    notifyStateChanged();
  }

  return {
    ready: () => true,

    getMatchState: () => gameFlow.getMatchState(),
    getSessionState: () => gameFlow.getSessionState(),

    openMainMenu: () => withNotify(() => gameFlow.openMainMenu()),
    openMatchSetup: () => withNotify(() => gameFlow.openMatchSetup()),
    openSettings: () => withNotify(() => gameFlow.openSettings()),
    openCarCustomise: () => withNotify(() => gameFlow.openCarCustomise()),
    openCredits: () => withNotify(() => gameFlow.openCredits()),

    selectMatchDuration: (minutes) => withNotify(() => gameFlow.selectMatchDuration(minutes)),
    startMatch: (config) => withNotify(() => gameFlow.startMatch(config)),

    advanceGameTicks: (count) => advanceTicks(count),
    advanceGameSeconds: (seconds) => advanceTicks(Math.round(seconds * RL_CONSTANTS.physicsHz)),

    simulateGoal: (scoringTeam) => {
      const centre = physics.getGoalSensorCentre(otherTeam(scoringTeam));
      if (!centre) {
        return;
      }
      physics.setBallState({ position: centre, linearVelocity: { x: 0, y: 0, z: 0 } });
      // Rapier's sensor-overlap query reflects a teleported collider's new
      // position only from the *second* world.step() onward (the first
      // step still queries the pre-teleport broad-phase state) — found via
      // ad hoc Vitest debugging. Two ticks guarantees the goal sensor
      // overlap is actually detected, not just the teleport itself.
      advanceTicks(2);
    },

    simulateBallFloorContact: () => {
      physics.setBallState({
        position: { x: 0, y: RL_CONSTANTS.ballRadius, z: 0 },
        linearVelocity: { x: 0, y: 0, z: 0 }
      });
      advanceTicks(1);
    },

    pause: () => withNotify(() => gameFlow.pause()),
    resume: () => withNotify(() => gameFlow.resume()),
    replayMatch: () => withNotify(() => gameFlow.replayMatch()),
    returnToMenu: () => withNotify(() => gameFlow.returnToMenu()),

    getMatchFlowEvents: () => gameFlow.getMatchFlowEvents(),
    clearMatchFlowEvents: () => gameFlow.clearMatchFlowEvents()
  };
}
