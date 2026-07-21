<script setup lang="ts">
import { computed } from "vue";

import { useMatchFlowStore } from "@/stores/matchFlowStore";

const matchFlowStore = useMatchFlowStore();

const boost = computed(() => Math.round(matchFlowStore.playerBoostAmount));

const session = computed(() => matchFlowStore.session);

const isOvertime = computed(
  () => session.value.matchState === "OVERTIME_PLAYING" || session.value.matchState === "OVERTIME_INTRO"
);

const timerLabel = computed(() => {
  if (isOvertime.value) {
    return `OT ${formatClock(session.value.overtimeElapsed)}`;
  }
  return formatClock(session.value.regulationTimeRemaining);
});

function formatClock(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const minutes = Math.floor(clamped / 60);
  const seconds = Math.floor(clamped % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
</script>

<template>
  <div class="hud" data-testid="gameplay-hud">
    <div class="scoreboard">
      <span class="score player" data-testid="player-score">{{ session.playerScore }}</span>
      <span class="timer" data-testid="match-timer">{{ timerLabel }}</span>
      <span class="score opponent" data-testid="opponent-score">{{ session.opponentScore }}</span>
    </div>

    <div class="labels">
      <span class="label player">YOU</span>
      <span class="label opponent">CPU</span>
    </div>

    <div class="boost-meter" :class="{ low: boost < 20 }" data-testid="boost-meter">
      <span class="boost-value">{{ boost }}</span>
    </div>
  </div>
</template>

<style scoped>
.hud {
  position: absolute;
  inset: 0;
  pointer-events: none;
  font-family: monospace;
  color: #e8f9ff;
}

.scoreboard {
  position: absolute;
  top: 1rem;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: baseline;
  gap: 1.25rem;
  font-size: 1.75rem;
  letter-spacing: 0.05em;
}

.score.player {
  color: #4ff0ff;
}

.score.opponent {
  color: #ff5fd8;
}

.timer {
  font-size: 1.1rem;
  color: #e8f9ff;
}

.labels {
  position: absolute;
  top: 3.4rem;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 4.2rem;
  font-size: 0.7rem;
  letter-spacing: 0.2em;
  color: #8fa4b8;
}

.boost-meter {
  position: absolute;
  bottom: 1.25rem;
  right: 1.5rem;
  width: 4.5rem;
  height: 4.5rem;
  border-radius: 50%;
  border: 3px solid rgba(79, 240, 255, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.6rem;
  background: rgba(6, 4, 14, 0.5);
}

.boost-meter.low {
  border-color: #ff5f5f;
  animation: pulse 0.6s ease-in-out infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.55;
  }
}
</style>
