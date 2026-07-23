import { defineStore } from "pinia";

import type { GameSessionState, MatchState } from "@/game-flow/MatchFlowTypes";
import type { ActiveInputDevice } from "@/input/InputTypes";

const BOOT_SESSION: GameSessionState = {
  matchState: "BOOT",
  selectedDurationMinutes: 3,
  playerScore: 0,
  opponentScore: 0,
  regulationTimeRemaining: 180,
  overtimeElapsed: 0,
  pausedFromState: null,
  winner: null
};

export interface MatchFlowStoreState {
  session: GameSessionState;
  playerBoostAmount: number;
  /** WS9.C: HUD supersonic feedback on the boost ring. */
  playerSupersonic: boolean;
  /** F11: HUD ball-cam indicator lit/dim state. */
  playerBallCamera: boolean;
  /** F11: most-recently-used input device, drives the HUD binding label. */
  activeInputDevice: ActiveInputDevice;
}

/**
 * Read-only mirror of `MatchFlowController`'s session state (game-flow
 * spec section 35), refreshed once per rendered frame via
 * `runtime:session-state-changed` (see `src/App.vue`) so UI components
 * can react to it without running a second rAF loop of their own. The
 * controller itself remains the single source of truth — this store never
 * assigns state, only copies it for display.
 */
export const useMatchFlowStore = defineStore("matchFlow", {
  state: (): MatchFlowStoreState => ({
    session: BOOT_SESSION,
    playerBoostAmount: 0,
    playerSupersonic: false,
    playerBallCamera: false,
    activeInputDevice: "none"
  }),

  getters: {
    matchState: (state): MatchState => state.session.matchState
  },

  actions: {
    setSession(session: GameSessionState): void {
      this.session = session;
    },
    setPlayerBoostAmount(amount: number): void {
      this.playerBoostAmount = amount;
    },
    setPlayerSupersonic(supersonic: boolean): void {
      this.playerSupersonic = supersonic;
    },
    setPlayerBallCamera(ballCamera: boolean): void {
      this.playerBallCamera = ballCamera;
    },
    setActiveInputDevice(device: ActiveInputDevice): void {
      this.activeInputDevice = device;
    }
  }
});
