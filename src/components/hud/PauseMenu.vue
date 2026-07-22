<script setup lang="ts">
import { useGameRuntime } from "@/core/useGameRuntime";

const runtime = useGameRuntime();

function resumeMatch(): void {
  runtime.playUiSound("confirm");
  runtime.resumeMatch();
}

function restartMatch(): void {
  if (window.confirm("Restart the current match?")) {
    runtime.playUiSound("confirm");
    runtime.restartMatch();
  }
}

function returnToMenu(): void {
  if (window.confirm("Return to the main menu? Match progress will be lost.")) {
    runtime.playUiSound("cancel");
    runtime.returnToMenu();
  }
}
</script>

<template>
  <div class="pause-overlay" data-testid="pause-menu" data-menu-root>
    <div class="pause-panel wo-panel">
      <h2 class="heading wo-title">PAUSED</h2>
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
      <button type="button" class="menu-item wo-item" data-index="02" @click="restartMatch()">
        RESTART MATCH
      </button>
      <button type="button" class="menu-item wo-item" data-index="03" @click="returnToMenu()">
        RETURN TO MENU
      </button>
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

.menu-item:hover,
.menu-item:focus-visible {
  outline: none;
}
</style>
