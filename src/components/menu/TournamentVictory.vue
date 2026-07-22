<script setup lang="ts">
import { computed } from "vue";

import { useGameRuntime } from "@/core/useGameRuntime";
import { useSettingsStore } from "@/stores/settingsStore";
import { useTournamentStore } from "@/stores/tournamentStore";

/**
 * R13 (plan/RAMPS_AND_FEATURES_PLAN.md): the "you won the whole ladder"
 * screen. Pure CSS celebration — the plan explicitly says not to add new
 * engine coupling just for this, and there is no existing simple hook to
 * trigger the real goal-celebration VFX from a menu screen with no live
 * match/camera context, so this stays CSS-only (see docs/build-decisions.md).
 */
const runtime = useGameRuntime();
const tournamentStore = useTournamentStore();
const settingsStore = useSettingsStore();

const defeatedOpponents = computed(() => tournamentStore.state.rounds.map((round) => round.opponentName));
const reducedFlashes = computed(() => settingsStore.settings.accessibility.reducedFlashes);

function returnToMenu(): void {
  runtime.playUiSound("cancel");
  runtime.leaveTournament();
}
</script>

<template>
  <div
    class="tournament-victory"
    data-testid="tournament-victory"
    data-menu-root
    :class="{ 'reduced-flashes': reducedFlashes }"
  >
    <div class="shimmer" aria-hidden="true"></div>

    <div class="panel">
      <h1 class="champion-title wo-title">CHAMPION</h1>
      <div class="subtitle wo-label">TOURNAMENT WON</div>

      <ul class="defeated-list">
        <li v-for="name in defeatedOpponents" :key="name" class="defeated-item">
          <span class="check">&#10003;</span>
          <span>{{ name }}</span>
        </li>
      </ul>

      <button
        type="button"
        class="menu-item wo-item"
        data-index="01"
        autofocus
        data-menu-back
        @click="returnToMenu()"
      >
        RETURN TO MENU
      </button>
    </div>
  </div>
</template>

<style scoped>
.tournament-victory {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: radial-gradient(circle at 50% 40%, rgba(79, 240, 255, 0.12), rgba(3, 2, 8, 0.92));
}

.shimmer {
  position: absolute;
  inset: -20%;
  pointer-events: none;
  background:
    radial-gradient(2px 2px at 15% 25%, rgba(255, 255, 255, 0.9), transparent 60%),
    radial-gradient(2px 2px at 75% 15%, rgba(79, 240, 255, 0.9), transparent 60%),
    radial-gradient(2px 2px at 35% 70%, rgba(255, 200, 90, 0.8), transparent 60%),
    radial-gradient(2px 2px at 85% 65%, rgba(255, 255, 255, 0.7), transparent 60%),
    radial-gradient(2px 2px at 55% 85%, rgba(79, 240, 255, 0.7), transparent 60%);
  animation: shimmer-drift 6s linear infinite;
  opacity: 0.85;
}

.tournament-victory.reduced-flashes .shimmer {
  animation: none;
  opacity: 0.35;
}

@keyframes shimmer-drift {
  0% {
    transform: translateY(0) rotate(0deg);
    opacity: 0.55;
  }
  50% {
    opacity: 0.95;
  }
  100% {
    transform: translateY(-3%) rotate(2deg);
    opacity: 0.55;
  }
}

.panel {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  padding: 2.5rem 3.5rem;
  z-index: 1;
}

.champion-title {
  margin: 0;
  font-size: clamp(3.5rem, 9vw, 6rem);
  color: var(--ui-cyan);
  text-shadow: 0 0 24px rgba(79, 240, 255, 0.6);
}

.tournament-victory.reduced-flashes .champion-title {
  text-shadow: none;
}

.subtitle {
  letter-spacing: 0.25em;
  color: var(--ui-amber);
  margin-bottom: 1.5rem;
}

.defeated-list {
  list-style: none;
  margin: 0 0 2rem 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  align-items: flex-start;
}

.defeated-item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-family: var(--font-ui);
  letter-spacing: 0.06em;
  color: #cfeeff;
}

.check {
  color: var(--ui-cyan);
  font-weight: 700;
}

.menu-item {
  font-family: var(--font-ui);
  font-size: 1.1rem;
  letter-spacing: 0.15em;
  padding: 0.6rem 1.6rem;
  border: none;
  color: var(--ui-ink);
  cursor: pointer;
  text-transform: uppercase;
}

.menu-item:hover,
.menu-item:focus-visible {
  outline: none;
}
</style>
