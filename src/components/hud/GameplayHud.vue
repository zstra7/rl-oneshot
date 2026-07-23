<script setup lang="ts">
import { computed } from "vue";

import { useGameRuntime } from "@/core/useGameRuntime";
import { friendlyGamepadLabel, friendlyKeyLabel } from "@/input/bindings/BindingLabels";
import { useMatchFlowStore } from "@/stores/matchFlowStore";

const runtime = useGameRuntime();
const matchFlowStore = useMatchFlowStore();

const boost = computed(() => Math.round(matchFlowStore.playerBoostAmount));
const supersonic = computed(() => matchFlowStore.playerSupersonic);

// F11: ball-cam HUD indicator (bottom-left). `runtime.getControlBindings()`
// is not itself reactive, so this computed also reads `matchFlowStore.session`
// (a fresh object every fixed tick via `setSession`) purely to force
// re-evaluation each tick — that way a live rebind from the settings panel
// (or a device switch) is picked up on the very next tick rather than
// staying stale until some unrelated prop happens to change.
const ballCameraActive = computed(() => matchFlowStore.playerBallCamera);
const ballCameraLabel = computed(() => {
  void matchFlowStore.session;
  const device = matchFlowStore.activeInputDevice;
  const bindings = runtime.getControlBindings();
  return device === "gamepad"
    ? friendlyGamepadLabel(bindings.gamepad.ballCameraButton)
    : friendlyKeyLabel(bindings.keyboardMouse.ballCamera);
});

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
      <span class="score player wo-numeral" data-testid="player-score">{{ session.playerScore }}</span>
      <span class="timer wo-numeral" data-testid="match-timer">{{ timerLabel }}</span>
      <span class="score opponent wo-numeral" data-testid="opponent-score">{{ session.opponentScore }}</span>
    </div>

    <div class="labels">
      <span class="label wo-label player">YOU</span>
      <span class="label wo-label opponent">CPU</span>
    </div>

    <div
      class="boost-meter"
      :class="{ low: boost < 20, supersonic }"
      :style="{ '--boost-pct': boost }"
      data-testid="boost-meter"
    >
      <span class="boost-value wo-numeral">{{ boost }}</span>
      <span v-if="supersonic" class="supersonic-label wo-label">SUPERSONIC</span>
    </div>

    <div class="ballcam-indicator" :class="{ active: ballCameraActive }" data-testid="ballcam-indicator">
      <span class="ballcam-label wo-label">BALL CAM</span>
      <span class="ballcam-key wo-numeral">{{ ballCameraLabel }}</span>
    </div>
  </div>
</template>

<style scoped>
.hud {
  position: absolute;
  inset: 0;
  pointer-events: none;
  font-family: var(--font-ui);
  color: var(--ui-ink);
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
  color: var(--ui-cyan);
}

.score.opponent {
  color: var(--ui-magenta);
}

.timer {
  font-size: 1.1rem;
  color: var(--ui-ink);
}

.labels {
  position: absolute;
  top: 3.4rem;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 4.2rem;
  font-size: 0.7rem;
}

.label.player {
  color: var(--ui-cyan);
}

.label.opponent {
  color: var(--ui-magenta);
}

.boost-meter {
  position: absolute;
  bottom: 1.25rem;
  right: 1.5rem;
  width: 4.5rem;
  height: 4.5rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    radial-gradient(circle, rgba(6, 4, 14, 0.85) 62%, transparent 63%),
    conic-gradient(var(--ui-amber) calc(var(--boost-pct) * 1%), rgba(255, 255, 255, 0.08) 0);
}

.boost-value {
  font-size: 1.6rem;
  color: var(--ui-ink);
}

.boost-meter.low {
  animation: pulse 0.6s ease-in-out infinite alternate;
}

.boost-meter.supersonic {
  box-shadow: 0 0 14px 3px rgba(255, 255, 255, 0.75);
}

.supersonic-label {
  position: absolute;
  bottom: -1.1rem;
  left: 50%;
  transform: translateX(-50%);
  white-space: nowrap;
  color: var(--ui-ink);
}

@keyframes pulse {
  0% {
    filter: brightness(1);
  }
  100% {
    filter: brightness(0.65);
  }
}

/* F11: mirrors .boost-meter's bottom offset/size on the opposite corner. */
.ballcam-indicator {
  position: absolute;
  bottom: 1.25rem;
  left: 1.5rem;
  width: 4.5rem;
  height: 4.5rem;
  border-radius: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.15rem;
  background: radial-gradient(circle, rgba(6, 4, 14, 0.85) 62%, transparent 63%);
  opacity: 0.45;
  transition:
    opacity 0.15s ease-out,
    box-shadow 0.15s ease-out;
}

.ballcam-indicator.active {
  opacity: 1;
  box-shadow: 0 0 14px 3px rgba(255, 198, 95, 0.55);
}

.ballcam-label {
  font-size: 0.55rem;
  letter-spacing: 0.05em;
  color: var(--ui-ink);
}

.ballcam-key {
  font-size: 1.1rem;
  color: var(--ui-ink);
}

.ballcam-indicator.active .ballcam-key {
  color: var(--ui-amber);
}
</style>
