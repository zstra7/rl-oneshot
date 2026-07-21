<script setup lang="ts">
import { useGameRuntime } from "@/core/useGameRuntime";

const runtime = useGameRuntime();

function restartMatch(): void {
  if (window.confirm("Restart the current match?")) {
    runtime.restartMatch();
  }
}

function returnToMenu(): void {
  if (window.confirm("Return to the main menu? Match progress will be lost.")) {
    runtime.returnToMenu();
  }
}
</script>

<template>
  <div class="pause-overlay" data-testid="pause-menu">
    <div class="pause-panel">
      <h2 class="heading">PAUSED</h2>
      <button type="button" class="menu-item" autofocus @click="runtime.resumeMatch()">
        RESUME
      </button>
      <button type="button" class="menu-item" @click="restartMatch()">RESTART MATCH</button>
      <button type="button" class="menu-item" @click="returnToMenu()">RETURN TO MENU</button>
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
  background: rgba(10, 6, 20, 0.85);
  border: 1px solid rgba(79, 240, 255, 0.4);
}

.heading {
  font-family: monospace;
  letter-spacing: 0.2em;
  color: #4ff0ff;
  margin: 0 0 0.5rem 0;
  text-align: center;
}

.menu-item {
  font-family: monospace;
  font-size: 1.1rem;
  letter-spacing: 0.15em;
  padding: 0.55rem 1.4rem;
  background: rgba(10, 6, 20, 0.55);
  border: 1px solid rgba(79, 240, 255, 0.4);
  color: #e8f9ff;
  cursor: pointer;
}

.menu-item:hover,
.menu-item:focus-visible {
  border-color: #4ff0ff;
  outline: none;
}
</style>
