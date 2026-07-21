<script setup lang="ts">
import { computed } from "vue";

import { useGameRuntime } from "@/core/useGameRuntime";
import type { MatchDurationMinutes } from "@/game-flow/MatchFlowTypes";
import { useMatchFlowStore } from "@/stores/matchFlowStore";

const runtime = useGameRuntime();
const matchFlowStore = useMatchFlowStore();

const durations: MatchDurationMinutes[] = [1, 3, 10];

const selected = computed(() => matchFlowStore.session.selectedDurationMinutes);
</script>

<template>
  <div class="menu-panel match-setup" data-testid="match-setup">
    <h2 class="heading">MATCH SETUP</h2>

    <div class="duration-row" role="group" aria-label="Match duration">
      <button
        v-for="minutes in durations"
        :key="minutes"
        type="button"
        class="duration-item"
        :class="{ active: selected === minutes }"
        :data-testid="`duration-${minutes}`"
        @click="runtime.selectMatchDuration(minutes)"
      >
        {{ minutes }} MIN
      </button>
    </div>

    <div class="difficulty-row">OPPONENT DIFFICULTY: STANDARD</div>

    <div class="menu-items">
      <button type="button" class="menu-item" data-testid="start-match" @click="runtime.startMatch()">
        START MATCH
      </button>
      <button type="button" class="menu-item" @click="runtime.openMainMenu()">BACK</button>
    </div>
  </div>
</template>

<style scoped>
.menu-panel {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  padding-left: 8vw;
  pointer-events: none;
}

.heading {
  pointer-events: none;
  font-family: monospace;
  letter-spacing: 0.15em;
  color: #4ff0ff;
  margin: 0 0 1.5rem 0;
}

.duration-row {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
  pointer-events: auto;
}

.duration-item {
  font-family: monospace;
  padding: 0.5rem 1rem;
  background: rgba(10, 6, 20, 0.55);
  border: 1px solid rgba(79, 240, 255, 0.3);
  color: #cfeeff;
  cursor: pointer;
}

.duration-item.active {
  border-color: #4ff0ff;
  color: #4ff0ff;
  background: rgba(79, 240, 255, 0.12);
}

.difficulty-row {
  pointer-events: none;
  font-family: monospace;
  color: #7d8aa0;
  margin-bottom: 1.5rem;
  letter-spacing: 0.05em;
}

.menu-items {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  pointer-events: auto;
}

.menu-item {
  font-family: monospace;
  font-size: 1.1rem;
  letter-spacing: 0.15em;
  padding: 0.55rem 1.4rem;
  background: rgba(10, 6, 20, 0.55);
  border: 1px solid rgba(79, 240, 255, 0.4);
  color: #e8f9ff;
  cursor: pointer;
  text-align: left;
}

.menu-item:hover,
.menu-item:focus-visible {
  border-color: #4ff0ff;
  outline: none;
}
</style>
