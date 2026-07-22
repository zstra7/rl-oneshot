import { defineStore } from "pinia";

import { DEFAULT_MATCH_DURATION_MINUTES } from "@/game-flow/MatchFlowConstants";
import { TOURNAMENT_ROUNDS, type TournamentPublicState } from "@/game-flow/TournamentController";

const INACTIVE_TOURNAMENT: TournamentPublicState = {
  active: false,
  phase: "setup",
  currentRound: 0,
  durationMinutes: DEFAULT_MATCH_DURATION_MINUTES,
  results: TOURNAMENT_ROUNDS.map(() => null),
  rounds: TOURNAMENT_ROUNDS
};

export interface TournamentStoreState {
  state: TournamentPublicState;
}

/**
 * Read-only mirror of `TournamentController`'s public state (R13, plan/
 * RAMPS_AND_FEATURES_PLAN.md), refreshed once per rendered frame via
 * `runtime:session-state-changed` (see `src/App.vue`) — same pattern as
 * `matchFlowStore.ts`. Never assigns state itself, only copies it for
 * display.
 */
export const useTournamentStore = defineStore("tournament", {
  state: (): TournamentStoreState => ({
    state: INACTIVE_TOURNAMENT
  }),

  getters: {
    active: (state): boolean => state.state.active,
    phase: (state) => state.state.phase
  },

  actions: {
    setState(next: TournamentPublicState): void {
      this.state = next;
    }
  }
});
