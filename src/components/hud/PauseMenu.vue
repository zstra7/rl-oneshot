<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { useGameRuntime } from "@/core/useGameRuntime";
import { useMatchFlowStore } from "@/stores/matchFlowStore";
import { useSettingsStore } from "@/stores/settingsStore";

const runtime = useGameRuntime();
const matchFlowStore = useMatchFlowStore();
const settingsStore = useSettingsStore();

/**
 * F10: `window.confirm` is invisible to the gamepad layer (and Playwright
 * auto-dismisses native dialogs, which was masking the gap). RESTART/RETURN
 * now open an inline, controller-navigable confirm row instead of acting
 * immediately.
 */
const confirming = ref<null | "restart" | "return">(null);
const restartButtonEl = ref<HTMLButtonElement | null>(null);
const returnButtonEl = ref<HTMLButtonElement | null>(null);
const cancelButtonEl = ref<HTMLButtonElement | null>(null);

function resumeMatch(): void {
  runtime.playUiSound("confirm");
  runtime.resumeMatch();
}

function openSettings(): void {
  matchFlowStore.setPauseSettingsOpen(true);
  runtime.playUiSound("confirm");
}

/**
 * F12: keyboard/pause-key Escape while the bare pause menu is showing
 * resumes the match (mirrors clicking RESUME) — the low-level `pausePressed`
 * edge sampled in `GameRuntime`'s fixed tick is never consumed while
 * `isPaused()` early-returns, so this is a dedicated DOM listener rather
 * than a second use of that edge. Skipped while a RESTART/RETURN confirm
 * row is showing so a stray Escape can't blow past the confirmation.
 */
function handlePauseKeydown(event: KeyboardEvent): void {
  if (confirming.value) {
    return;
  }
  if (event.code !== settingsStore.settings.controls.keyboardMouse.pause) {
    return;
  }
  resumeMatch();
}

onMounted(() => {
  window.addEventListener("keydown", handlePauseKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handlePauseKeydown);
});

function requestRestart(): void {
  confirming.value = "restart";
  void nextTick(() => cancelButtonEl.value?.focus());
}

function requestReturn(): void {
  confirming.value = "return";
  void nextTick(() => cancelButtonEl.value?.focus());
}

function confirmAction(): void {
  const pending = confirming.value;
  confirming.value = null;
  if (pending === "restart") {
    runtime.playUiSound("confirm");
    runtime.restartMatch();
  } else if (pending === "return") {
    runtime.playUiSound("cancel");
    runtime.returnToMenu();
  }
}

function cancelConfirm(): void {
  const pending = confirming.value;
  confirming.value = null;
  void nextTick(() => {
    (pending === "restart" ? restartButtonEl.value : returnButtonEl.value)?.focus();
  });
}
</script>

<template>
  <div class="pause-overlay" data-testid="pause-menu" data-menu-root>
    <div class="pause-panel wo-panel">
      <h2 class="heading wo-title">PAUSED</h2>
      <template v-if="!confirming">
        <button
          type="button"
          class="menu-item wo-item"
          data-index="01"
          autofocus
          data-menu-back
          @click="resumeMatch()"
        >
          RESUME
        </button>
        <button
          type="button"
          class="menu-item wo-item"
          data-index="02"
          data-testid="pause-settings"
          @click="openSettings()"
        >
          SETTINGS
        </button>
        <button
          ref="restartButtonEl"
          type="button"
          class="menu-item wo-item"
          data-index="03"
          @click="requestRestart()"
        >
          RESTART MATCH
        </button>
        <button
          ref="returnButtonEl"
          type="button"
          class="menu-item wo-item"
          data-index="04"
          @click="requestReturn()"
        >
          RETURN TO MENU
        </button>
      </template>
      <template v-else>
        <p class="wo-label confirm-label">ARE YOU SURE?</p>
        <button
          type="button"
          class="menu-item wo-item"
          data-index="01"
          data-testid="pause-confirm-yes"
          @click="confirmAction()"
        >
          CONFIRM
        </button>
        <button
          ref="cancelButtonEl"
          type="button"
          class="menu-item wo-item"
          data-index="02"
          data-menu-back
          data-testid="pause-confirm-no"
          @click="cancelConfirm()"
        >
          CANCEL
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.pause-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(3, 2, 8, 0.6);
}

.pause-panel {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 2rem 2.5rem;
}

.heading {
  color: var(--ui-ink);
  margin: 0 0 0.5rem 0;
  text-align: center;
  font-size: 1.8rem;
}

.confirm-label {
  text-align: center;
  margin: 0 0 0.25rem 0;
}

.menu-item {
  font-family: var(--font-ui);
  font-size: 1.1rem;
  letter-spacing: 0.15em;
  padding: 0.55rem 1.4rem 0.55rem 1rem;
  border: none;
  color: var(--ui-ink);
  cursor: pointer;
  text-transform: uppercase;
  text-align: left;
}
</style>
