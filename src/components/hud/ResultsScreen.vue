<script setup lang="ts">
import { computed } from "vue";

import { useGameRuntime } from "@/core/useGameRuntime";
import { useMatchFlowStore } from "@/stores/matchFlowStore";
import { useTournamentStore } from "@/stores/tournamentStore";

const runtime = useGameRuntime();
const matchFlowStore = useMatchFlowStore();
const tournamentStore = useTournamentStore();

const session = computed(() => matchFlowStore.session);

const resultLabel = computed(() => {
  if (session.value.winner === "player") return "VICTORY";
  if (session.value.winner === "opponent") return "DEFEAT";
  return "DRAW";
});

const wasOvertime = computed(() => session.value.overtimeElapsed > 0);

// R13: a tournament match's results screen replaces REPLAY/RETURN TO MENU
// with CONTINUE/LEAVE TOURNAMENT. `active` alone is the right condition —
// by the time this screen renders, the tournament controller has already
// recorded the match result (GameRuntime's edge-detected match-end sync
// fires on the same transition into MATCH_RESULTS), so `phase` has moved
// on to "bracket"/"eliminated"/"champion" already; `active` is what stays
// true for the whole tournament, including this results screen.
const isTournamentMatch = computed(() => tournamentStore.active);

function replayMatch(): void {
  runtime.playUiSound("confirm");
  runtime.replayMatch();
}

function returnToMenu(): void {
  runtime.playUiSound("cancel");
  runtime.returnToMenu();
}

function continueTournament(): void {
  runtime.playUiSound("confirm");
  runtime.continueTournament();
}

function leaveTournament(): void {
  runtime.playUiSound("cancel");
  runtime.leaveTournament();
}
</script>

<template>
  <div class="results-overlay" data-testid="results-screen" data-menu-root>
    <div class="results-panel wo-panel">
      <h2 class="result wo-title" :class="resultLabel.toLowerCase()">{{ resultLabel }}</h2>
      <div class="score wo-numeral" data-testid="final-score">
        {{ session.playerScore }} - {{ session.opponentScore }}
      </div>
      <div v-if="wasOvertime" class="overtime-indicator wo-label">OVERTIME</div>
      <div class="duration wo-label">{{ session.selectedDurationMinutes }} MIN MATCH</div>

      <div class="actions">
        <template v-if="isTournamentMatch">
          <button
            type="button"
            class="menu-item wo-item"
            data-index="01"
            data-testid="tournament-continue"
            autofocus
            @click="continueTournament()"
          >
            CONTINUE
          </button>
          <button
            type="button"
            class="menu-item wo-item"
            data-index="02"
            data-testid="tournament-leave"
            data-menu-back
            @click="leaveTournament()"
          >
            LEAVE TOURNAMENT
          </button>
        </template>
        <template v-else>
          <button type="button" class="menu-item wo-item" data-index="01" autofocus @click="replayMatch()">
            REPLAY
          </button>
          <button
            type="button"
            class="menu-item wo-item"
            data-index="02"
            data-menu-back
            @click="returnToMenu()"
          >
            RETURN TO MENU
          </button>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.results-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(3, 2, 8, 0.75);
}

.results-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 2.5rem 3rem;
  color: var(--ui-ink);
}

.result {
  font-size: 3rem;
  margin: 0;
}

.result.victory {
  color: var(--ui-cyan);
}

.result.defeat {
  color: var(--ui-magenta);
}

.result.draw {
  color: var(--ui-amber);
}

.score {
  font-size: 2.6rem;
}

.overtime-indicator,
.duration {
  font-size: 0.85rem;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  margin-top: 1.25rem;
  width: 100%;
}

.menu-item {
  font-family: var(--font-ui);
  font-size: 1.05rem;
  letter-spacing: 0.15em;
  padding: 0.5rem 1.2rem 0.5rem 1rem;
  border: none;
  color: var(--ui-ink);
  cursor: pointer;
  text-transform: uppercase;
  text-align: left;
}

.menu-item:hover,
.menu-item:focus-visible {
  outline: none;
}
</style>
