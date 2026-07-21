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
    <span class="value" :data-value="label">{{ label }}</span>
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
  font-family: monospace;
  font-size: clamp(4rem, 12vw, 9rem);
  color: #ffcf4d;
  letter-spacing: 0.1em;
  text-shadow: 0 0 24px rgba(255, 207, 77, 0.7);
}
</style>
