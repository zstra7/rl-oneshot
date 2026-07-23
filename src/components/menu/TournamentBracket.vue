<script setup lang="ts">
import { computed, ref } from "vue";

import { useGameRuntime } from "@/core/useGameRuntime";
import { DEFAULT_MATCH_DURATION_MINUTES } from "@/game-flow/MatchFlowConstants";
import type { MatchDurationMinutes } from "@/game-flow/MatchFlowTypes";
import { useTournamentStore } from "@/stores/tournamentStore";

/**
 * R13 (plan/RAMPS_AND_FEATURES_PLAN.md): the tournament ladder screen —
 * three phase-conditional views (setup / bracket / eliminated) all live
 * here since they share the same `matchState === "TOURNAMENT_BRACKET"`
 * and never overlap (the "in-match" phase is a live match, a different
 * matchState entirely, so this component simply isn't mounted then).
 */
const runtime = useGameRuntime();
const tournamentStore = useTournamentStore();

const durations: MatchDurationMinutes[] = [1, 3, 10];
const ROUND_LABELS = ["ROUND 1", "ROUND 2", "SEMI-FINAL", "FINAL"];

const tournament = computed(() => tournamentStore.state);
const phase = computed(() => tournament.value.phase);

function slatState(index: number): "won" | "lost" | "current" | "upcoming" {
  const result = tournament.value.results[index];
  if (result === "win") return "won";
  if (result === "loss") return "lost";
  if (index === tournament.value.currentRound && (phase.value === "bracket" || phase.value === "eliminated")) {
    return phase.value === "eliminated" ? "lost" : "current";
  }
  return "upcoming";
}

const selectedDuration = ref<MatchDurationMinutes>(DEFAULT_MATCH_DURATION_MINUTES);

function selectDuration(minutes: MatchDurationMinutes): void {
  runtime.playUiSound("navigate");
  selectedDuration.value = minutes;
}

function beginTournament(): void {
  runtime.playUiSound("confirm");
  runtime.beginTournament(selectedDuration.value);
}

function playNext(): void {
  runtime.playUiSound("confirm");
  runtime.playNextTournamentMatch();
}

function leave(): void {
  runtime.playUiSound("cancel");
  runtime.leaveTournament();
}
</script>

<template>
  <div class="menu-panel tournament-bracket" data-testid="tournament-bracket" data-menu-root>
    <template v-if="phase === 'setup'">
      <h2 class="heading wo-title">TOURNAMENT</h2>
      <div class="wo-label row-label">MATCH DURATION</div>
      <div class="duration-row" role="group" aria-label="Match duration">
        <button
          v-for="minutes in durations"
          :key="minutes"
          type="button"
          class="duration-item wo-chip"
          :class="{ active: selectedDuration === minutes }"
          :data-testid="`tournament-duration-${minutes}`"
          @click="selectDuration(minutes)"
        >
          <span>{{ minutes }} MIN</span>
        </button>
      </div>
      <div class="menu-items">
        <button
          type="button"
          class="menu-item wo-item start-item"
          data-index="01"
          data-testid="tournament-begin"
          @click="beginTournament()"
        >
          BEGIN TOURNAMENT
        </button>
        <button type="button" class="menu-item wo-item" data-index="02" data-menu-back @click="leave()">
          BACK
        </button>
      </div>
    </template>

    <template v-else>
      <h2 class="heading wo-title" :class="{ eliminated: phase === 'eliminated' }">
        {{ phase === "eliminated" ? "ELIMINATED" : "TOURNAMENT" }}
      </h2>

      <ol class="ladder">
        <li
          v-for="(round, index) in tournament.rounds"
          :key="round.opponentName"
          class="slat"
          :data-testid="`bracket-round-${index}`"
          :data-state="slatState(index)"
        >
          <span class="slat-label wo-label">{{ ROUND_LABELS[index] }}</span>
          <span class="slat-opponent">{{ round.opponentName }}</span>
          <span class="slat-marker">
            <template v-if="slatState(index) === 'won'">&#10003;</template>
            <template v-else-if="slatState(index) === 'lost'">&#10007;</template>
            <template v-else-if="slatState(index) === 'current'">&#9658;</template>
          </span>
        </li>
      </ol>

      <div class="menu-items">
        <button
          v-if="phase === 'bracket'"
          type="button"
          class="menu-item wo-item start-item"
          data-index="01"
          data-testid="tournament-play-next"
          autofocus
          @click="playNext()"
        >
          PLAY NEXT GAME
        </button>
        <button
          v-if="phase === 'bracket'"
          type="button"
          class="menu-item wo-item"
          data-index="02"
          data-testid="tournament-leave"
          data-menu-back
          @click="leave()"
        >
          LEAVE TOURNAMENT
        </button>
        <button
          v-if="phase === 'eliminated'"
          type="button"
          class="menu-item wo-item"
          data-index="01"
          data-testid="tournament-return"
          autofocus
          data-menu-back
          @click="leave()"
        >
          RETURN TO MENU
        </button>
      </div>
    </template>
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

.heading.eliminated {
  color: var(--ui-magenta);
}

.row-label {
  pointer-events: none;
  margin-bottom: 0.4rem;
}

.duration-row {
  display: flex;
  gap: 0.6rem;
  margin-bottom: 1.5rem;
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

.ladder {
  list-style: none;
  margin: 0 0 1.5rem 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  pointer-events: none;
  min-width: 22rem;
}

.slat {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  padding: 0.6rem 1rem;
  background: rgba(10, 6, 20, 0.55);
  border-left: 3px solid rgba(79, 240, 255, 0.25);
  color: #cfeeff;
}

.slat[data-state="won"] {
  border-left-color: var(--ui-cyan);
  color: var(--ui-cyan);
}

.slat[data-state="lost"] {
  border-left-color: var(--ui-magenta);
  color: var(--ui-magenta);
  opacity: 0.85;
}

.slat[data-state="current"] {
  border-left-color: var(--ui-amber);
  animation: slat-pulse 1.4s ease-in-out infinite;
}

.slat[data-state="upcoming"] {
  opacity: 0.45;
}

.slat-label {
  width: 6.5rem;
  flex-shrink: 0;
}

.slat-opponent {
  flex: 1;
  font-family: var(--font-ui);
  letter-spacing: 0.08em;
}

.slat-marker {
  width: 1.5rem;
  text-align: center;
  font-weight: 700;
}

@keyframes slat-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
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

</style>
