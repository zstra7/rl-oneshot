<script setup lang="ts">
import { useGameRuntime } from "@/core/useGameRuntime";

const runtime = useGameRuntime();

function openMatchSetup(): void {
  runtime.playUiSound("confirm");
  runtime.openMatchSetup();
}

function openSettings(): void {
  runtime.playUiSound("confirm");
  runtime.openSettings();
}
</script>

<template>
  <div class="menu-panel main-menu" data-testid="main-menu">
    <h1 class="title">SPACE CARBALL</h1>
    <nav class="menu-items">
      <button type="button" class="menu-item" autofocus @click="openMatchSetup">
        PLAY
      </button>
      <button type="button" class="menu-item" @click="openSettings">SETTINGS</button>
    </nav>
  </div>
</template>

<style scoped>
.menu-panel {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  pointer-events: none;
}

.main-menu {
  align-items: flex-start;
  padding-left: 8vw;
}

.title {
  pointer-events: none;
  margin: 0 0 2rem 0;
  font-family: monospace;
  font-size: clamp(2rem, 5vw, 3.5rem);
  letter-spacing: 0.2em;
  color: #4ff0ff;
  text-shadow: 0 0 12px rgba(79, 240, 255, 0.6);
}

.menu-items {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  pointer-events: auto;
}

.menu-item {
  font-family: monospace;
  font-size: 1.25rem;
  letter-spacing: 0.15em;
  padding: 0.6rem 1.6rem;
  background: rgba(10, 6, 20, 0.55);
  border: 1px solid rgba(79, 240, 255, 0.4);
  color: #e8f9ff;
  cursor: pointer;
  text-align: left;
  transition: transform 0.08s ease, border-color 0.08s ease;
}

.menu-item:hover,
.menu-item:focus-visible {
  border-color: #4ff0ff;
  transform: translateX(6px);
  outline: none;
}
</style>
