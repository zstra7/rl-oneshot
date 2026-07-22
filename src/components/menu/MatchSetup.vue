<script setup lang="ts">
import { computed, ref } from "vue";

import type { AiDifficulty } from "@/ai/AiDifficulty";
import { useGameRuntime } from "@/core/useGameRuntime";
import type { MatchDurationMinutes } from "@/game-flow/MatchFlowTypes";
import { useMatchFlowStore } from "@/stores/matchFlowStore";

const runtime = useGameRuntime();
const matchFlowStore = useMatchFlowStore();

const durations: MatchDurationMinutes[] = [1, 3, 10];
const difficulties: AiDifficulty[] = ["easy", "medium", "hard", "legend"];

const selected = computed(() => matchFlowStore.session.selectedDurationMinutes);

// AI difficulty is a runtime/AI-module setting (game-flow spec section 24:
// "Reserve future row: OPPONENT DIFFICULTY"), not part of match session
// state, so it's tracked locally here rather than in matchFlowStore.
const selectedDifficulty = ref<AiDifficulty>(runtime.getAiDifficulty());

function selectDifficulty(difficulty: AiDifficulty): void {
  runtime.playUiSound("navigate");
  selectedDifficulty.value = difficulty;
  runtime.selectAiDifficulty(difficulty);
}

function selectDuration(minutes: MatchDurationMinutes): void {
  runtime.playUiSound("navigate");
  runtime.selectMatchDuration(minutes);
}

function startMatch(): void {
  runtime.playUiSound("confirm");
  runtime.startMatch();
}

function back(): void {
  runtime.playUiSound("cancel");
  runtime.openMainMenu();
}
</script>

<template>
  <div class="menu-panel match-setup" data-testid="match-setup">
    <h2 class="heading wo-title">MATCH SETUP</h2>

    <div class="wo-label row-label">DURATION</div>
    <div class="duration-row" role="group" aria-label="Match duration">
      <button
        v-for="minutes in durations"
        :key="minutes"
        type="button"
        class="duration-item wo-chip"
        :class="{ active: selected === minutes }"
        :data-testid="`duration-${minutes}`"
        @click="selectDuration(minutes)"
      >
        <span>{{ minutes }} MIN</span>
      </button>
    </div>

    <div class="wo-label row-label">OPPONENT DIFFICULTY</div>
    <div class="difficulty-row" role="group" aria-label="Opponent difficulty">
      <button
        v-for="difficulty in difficulties"
        :key="difficulty"
        type="button"
        class="duration-item wo-chip"
        :class="{ active: selectedDifficulty === difficulty }"
        :data-testid="`difficulty-${difficulty}`"
        @click="selectDifficulty(difficulty)"
      >
        <span>{{ difficulty.toUpperCase() }}</span>
      </button>
    </div>

    <div class="menu-items">
      <button
        type="button"
        class="menu-item wo-item start-item"
        data-index="01"
        data-testid="start-match"
        @click="startMatch()"
      >
        START MATCH
      </button>
      <button type="button" class="menu-item wo-item" data-index="02" @click="back()">BACK</button>
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
  color: var(--ui-ink);
  margin: 0 0 1.5rem 0;
  font-size: 2rem;
}

.row-label {
  pointer-events: none;
  margin-bottom: 0.4rem;
}

.duration-row {
  display: flex;
  gap: 0.6rem;
  margin-bottom: 1rem;
  pointer-events: auto;
}

.duration-item {
  font-family: var(--font-ui);
  padding: 0.5rem 1.1rem;
  background: rgba(10, 6, 20, 0.55);
  border: 1px solid rgba(79, 240, 255, 0.3);
  color: #cfeeff;
  cursor: pointer;
}

.duration-item.active {
  border-color: transparent;
}

.difficulty-row {
  display: flex;
  gap: 0.6rem;
  margin-bottom: 1.5rem;
  pointer-events: auto;
}

.menu-items {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  pointer-events: auto;
}

.menu-item {
  font-family: var(--font-ui);
  font-size: 1.1rem;
  letter-spacing: 0.15em;
  padding: 0.55rem 1.4rem 0.55rem 1rem;
  border: none;
  color: var(--ui-ink);
  cursor: pointer;
  text-align: left;
  text-transform: uppercase;
}

.start-item {
  border-left-color: var(--ui-amber);
  font-size: 1.3rem;
}

.menu-item:hover,
.menu-item:focus-visible {
  outline: none;
}
</style>
