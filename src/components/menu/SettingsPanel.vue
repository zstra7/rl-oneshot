<script setup lang="ts">
import { useGameRuntime } from "@/core/useGameRuntime";

const runtime = useGameRuntime();

// game-flow spec section 25: full category content (rebinding UI,
// persistence, accessibility toggles) is UI-module Phase 15 scope. This
// placeholder only satisfies Phase 7's navigation requirement (MAIN_MENU
// <-> SETTINGS) — see docs/build-decisions.md.
const categories = ["GAMEPLAY", "CAMERA", "GRAPHICS", "AUDIO", "CONTROLS", "ACCESSIBILITY"];
</script>

<template>
  <div class="menu-panel settings-panel" data-testid="settings-panel">
    <h2 class="heading">SETTINGS</h2>
    <ul class="categories">
      <li v-for="category in categories" :key="category">{{ category }}</li>
    </ul>
    <button type="button" class="menu-item" @click="runtime.openMainMenu()">BACK</button>
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
  font-family: monospace;
  letter-spacing: 0.15em;
  color: #4ff0ff;
  margin: 0 0 1rem 0;
}

.categories {
  list-style: none;
  margin: 0 0 1.5rem 0;
  padding: 0;
  font-family: monospace;
  color: #9fb4c8;
  letter-spacing: 0.1em;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.menu-item {
  pointer-events: auto;
  font-family: monospace;
  font-size: 1.1rem;
  letter-spacing: 0.15em;
  padding: 0.55rem 1.4rem;
  background: rgba(10, 6, 20, 0.55);
  border: 1px solid rgba(79, 240, 255, 0.4);
  color: #e8f9ff;
  cursor: pointer;
  text-align: left;
  width: fit-content;
}

.menu-item:hover,
.menu-item:focus-visible {
  border-color: #4ff0ff;
  outline: none;
}
</style>
