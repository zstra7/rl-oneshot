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

function openCarCustomise(): void {
  runtime.playUiSound("confirm");
  runtime.openCarCustomise();
}
</script>

<template>
  <div class="menu-panel main-menu" data-testid="main-menu" data-menu-root>
    <h1 class="title">
      <span class="wo-label title-kicker">SPACE</span>
      <span class="wo-title title-main">CARBALL</span>
    </h1>
    <nav class="menu-items">
      <button
        type="button"
        class="menu-item wo-item"
        data-index="01"
        autofocus
        @click="openMatchSetup"
      >
        PLAY
      </button>
      <button
        type="button"
        class="menu-item wo-item"
        data-index="02"
        data-testid="customise-car"
        @click="openCarCustomise"
      >
        CUSTOMISE CAR
      </button>
      <button type="button" class="menu-item wo-item" data-index="03" @click="openSettings">
        SETTINGS
      </button>
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
  display: flex;
  flex-direction: column;
  gap: 0.2em;
}

.title-kicker {
  color: var(--ui-cyan);
}

.title-main {
  font-size: clamp(3rem, 8vw, 5.5rem);
  color: var(--ui-ink);
  line-height: 1;
}

.menu-items {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  pointer-events: auto;
}

.menu-item {
  font-family: var(--font-ui);
  font-size: 1.25rem;
  letter-spacing: 0.15em;
  padding: 0.6rem 1.6rem 0.6rem 1rem;
  border: none;
  color: var(--ui-ink);
  cursor: pointer;
  text-align: left;
  text-transform: uppercase;
}

.menu-item:hover,
.menu-item:focus-visible {
  transform: translateX(6px);
  outline: none;
}
</style>
