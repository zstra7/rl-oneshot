<script setup lang="ts">
import { computed } from "vue";

import { useMatchFlowStore } from "@/stores/matchFlowStore";

const matchFlowStore = useMatchFlowStore();

const label = computed<string>(() => {
  switch (matchFlowStore.matchState) {
    case "COUNTDOWN_3":
      return "3";
    case "COUNTDOWN_2":
      return "2";
    case "COUNTDOWN_1":
      return "1";
    case "COUNTDOWN_GO":
      return "GO";
    default:
      return "";
  }
});
</script>

<template>
  <div class="countdown" data-testid="countdown-overlay">
    <span :key="label" class="value wo-title" :class="{ go: label === 'GO' }" :data-value="label">{{
      label
    }}</span>
  </div>
</template>

<style scoped>
.countdown {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.value {
  font-size: clamp(4rem, 10vw, 7rem);
  color: var(--ui-amber);
  text-shadow: 0 0 24px rgba(255, 198, 95, 0.7);
  animation: wo-pop 150ms ease-out;
}

.value.go {
  color: var(--ui-amber);
}

@keyframes wo-pop {
  0% {
    transform: scale(1.35) skewX(var(--skew));
    opacity: 0;
  }
  100% {
    transform: scale(1) skewX(var(--skew));
    opacity: 1;
  }
}
</style>
