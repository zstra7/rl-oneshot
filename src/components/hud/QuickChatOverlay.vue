<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";

import { useMatchFlowStore } from "@/stores/matchFlowStore";
import { useSettingsStore } from "@/stores/settingsStore";

/**
 * R7 (plan/RAMPS_AND_FEATURES_PLAN.md): RL-style toxic quick-chat spam —
 * when the opponent scores, "CPU: WHAT A SAVE!" pops up three times,
 * staggered, fading out after ~2.5s. Pure UI layer, driven purely by
 * watching the mirrored session score (no engine changes needed).
 */
interface QuickChatMessage {
  readonly id: number;
  readonly text: string;
  fading: boolean;
}

const matchFlowStore = useMatchFlowStore();
const settingsStore = useSettingsStore();

const messages = ref<QuickChatMessage[]>([]);
let nextId = 0;
const pendingTimeouts = new Set<ReturnType<typeof setTimeout>>();

function afterDelay(ms: number, fn: () => void): void {
  const handle = setTimeout(() => {
    pendingTimeouts.delete(handle);
    fn();
  }, ms);
  pendingTimeouts.add(handle);
}

function spamOne(): void {
  const id = nextId++;
  messages.value.push({ id, text: "WHAT A SAVE!", fading: false });

  afterDelay(2200, () => {
    const message = messages.value.find((m) => m.id === id);
    if (message) {
      message.fading = true;
    }
  });
  afterDelay(3000, () => {
    messages.value = messages.value.filter((m) => m.id !== id);
  });
}

function spam(): void {
  spamOne();
  afterDelay(300, spamOne);
  afterDelay(600, spamOne);
}

watch(
  () => matchFlowStore.session.opponentScore,
  (next, prev) => {
    if (next > prev) {
      spam();
    }
  }
);

onBeforeUnmount(() => {
  for (const handle of pendingTimeouts) {
    clearTimeout(handle);
  }
  pendingTimeouts.clear();
});
</script>

<template>
  <div class="quick-chat" data-testid="quick-chat">
    <div
      v-for="message in messages"
      :key="message.id"
      class="quick-chat-message"
      :class="{
        fading: message.fading,
        'reduced-flashes': settingsStore.settings.accessibility.reducedFlashes
      }"
      data-testid="quick-chat-message"
    >
      <span class="sender">CPU:</span> {{ message.text }}
    </div>
  </div>
</template>

<style scoped>
.quick-chat {
  position: absolute;
  top: 4.5rem;
  left: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  pointer-events: none;
  z-index: 5;
}

.quick-chat-message {
  padding: 0.4rem 0.75rem;
  background: rgba(10, 6, 20, 0.82);
  border: 1px solid rgba(79, 240, 255, 0.5);
  border-radius: 2px;
  color: #f2f2ff;
  font-size: 0.85rem;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  opacity: 1;
  transition: opacity 800ms ease-out;
  animation: quick-chat-slide-in 200ms ease-out;
}

.quick-chat-message.fading {
  opacity: 0;
}

.quick-chat-message.reduced-flashes {
  animation: none;
  transition: opacity 200ms linear;
}

.sender {
  color: #ff5fd8;
  font-weight: 700;
  margin-right: 0.25rem;
}

@keyframes quick-chat-slide-in {
  0% {
    transform: translateX(-30%);
    opacity: 0;
  }
  100% {
    transform: translateX(0);
    opacity: 1;
  }
}
</style>
