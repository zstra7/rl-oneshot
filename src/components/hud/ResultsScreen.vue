<script setup lang="ts">
import { computed } from "vue";

import { useGameRuntime } from "@/core/useGameRuntime";
import { useMatchFlowStore } from "@/stores/matchFlowStore";

const runtime = useGameRuntime();
const matchFlowStore = useMatchFlowStore();

const session = computed(() => matchFlowStore.session);

const resultLabel = computed(() => {
  if (session.value.winner === "player") return "VICTORY";
  if (session.value.winner === "opponent") return "DEFEAT";
  return "DRAW";
});

const wasOvertime = computed(() => session.value.overtimeElapsed > 0);
</script>

<template>
  <div class="results-overlay" data-testid="results-screen">
    <div class="results-panel">
      <h2 class="result" :class="resultLabel.toLowerCase()">{{ resultLabel }}</h2>
      <div class="score" data-testid="final-score">
        {{ session.playerScore }} - {{ session.opponentScore }}
      </div>
      <div v-if="wasOvertime" class="overtime-indicator">OVERTIME</div>
      <div class="duration">{{ session.selectedDurationMinutes }} MIN MATCH</div>

      <div class="actions">
        <button type="button" class="menu-item" autofocus @click="runtime.replayMatch()">
          REPLAY
        </button>
        <button type="button" class="menu-item" @click="runtime.returnToMenu()">
          RETURN TO MENU
        </button>
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
  background: rgba(10, 6, 20, 0.85);
  border: 1px solid rgba(79, 240, 255, 0.4);
  font-family: monospace;
  color: #e8f9ff;
}

.result {
  font-size: 2.5rem;
  letter-spacing: 0.2em;
  margin: 0;
}

.result.victory {
  color: #4ff0ff;
}

.result.defeat {
  color: #ff5fd8;
}

.score {
  font-size: 1.75rem;
}

.overtime-indicator,
.duration {
  color: #8fa4b8;
  letter-spacing: 0.15em;
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
  font-family: monospace;
  font-size: 1.05rem;
  letter-spacing: 0.15em;
  padding: 0.5rem 1.2rem;
  background: rgba(10, 6, 20, 0.55);
  border: 1px solid rgba(79, 240, 255, 0.4);
  color: #e8f9ff;
  cursor: pointer;
}

.menu-item:hover,
.menu-item:focus-visible {
  border-color: #4ff0ff;
  outline: none;
}
</style>
