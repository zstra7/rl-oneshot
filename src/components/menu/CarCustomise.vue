<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from "vue";

import { useGameRuntime } from "@/core/useGameRuntime";
import { useSettingsStore } from "@/stores/settingsStore";

const runtime = useGameRuntime();
const settingsStore = useSettingsStore();

const settings = computed(() => settingsStore.settings);

/**
 * R12.4: curated 8-swatch preset palette — cyan is the built-in default,
 * the rest are chosen to stay saturated/distinct (retro-neon aesthetic,
 * see src/styles/retro-ui.css --ui-cyan/--ui-magenta/--ui-amber) and
 * legible against the dark stadium backdrop. Reused for both the body and
 * boost-colour rows per the plan's "identical pattern".
 */
const SWATCHES: readonly string[] = [
  "#4ff0ff", // cyan (default)
  "#ff5fd8", // magenta
  "#ffc65f", // amber
  "#a6ff4f", // lime
  "#ff8a1f", // orange
  "#f5f7ff", // white
  "#ff3b3b", // red
  "#b45fff" // violet
];

function applyColors(): void {
  runtime.setPlayerCarColors({
    bodyColor: settings.value.car.bodyColor,
    boostColor: settings.value.car.boostColor
  });
}

function setBodyColor(hex: string): void {
  settingsStore.update({ car: { bodyColor: hex } });
  applyColors();
}

function setBoostColor(hex: string): void {
  settingsStore.update({ car: { boostColor: hex } });
  applyColors();
}

function onBodyColorInput(event: Event): void {
  const value = (event.target as HTMLInputElement).value;
  setBodyColor(value);
}

function onBoostColorInput(event: Event): void {
  const value = (event.target as HTMLInputElement).value;
  setBoostColor(value);
}

function back(): void {
  runtime.playUiSound("cancel");
  runtime.openMainMenu();
}

// R12.4: parked-car boost-trail-in-action preview — on while this screen
// is mounted only, streaming from the stationary menu player car.
onMounted(() => {
  runtime.setBoostPreviewEnabled(true);
});

onBeforeUnmount(() => {
  runtime.setBoostPreviewEnabled(false);
});
</script>

<template>
  <div class="menu-panel car-customise" data-testid="car-customise" data-menu-root>
    <div class="wo-panel customise-card">
      <h2 class="heading wo-title">CUSTOMISE CAR</h2>

      <div class="wo-label row-label">BODY COLOUR</div>
      <div class="swatch-row" role="group" aria-label="Body colour">
        <button
          v-for="(hex, index) in SWATCHES"
          :key="`body-${hex}`"
          type="button"
          class="swatch"
          :class="{ active: settings.car.bodyColor.toLowerCase() === hex.toLowerCase() }"
          :style="{ backgroundColor: hex }"
          :data-testid="`body-swatch-${index + 1}`"
          :aria-label="`Body colour ${hex}`"
          @click="setBodyColor(hex)"
        />
        <input
          type="color"
          class="color-input"
          data-testid="body-color-input"
          :value="settings.car.bodyColor"
          @input="onBodyColorInput"
        />
      </div>

      <div class="wo-label row-label">BOOST COLOUR</div>
      <div class="swatch-row" role="group" aria-label="Boost colour">
        <button
          v-for="(hex, index) in SWATCHES"
          :key="`boost-${hex}`"
          type="button"
          class="swatch"
          :class="{ active: settings.car.boostColor.toLowerCase() === hex.toLowerCase() }"
          :style="{ backgroundColor: hex }"
          :data-testid="`boost-swatch-${index + 1}`"
          :aria-label="`Boost colour ${hex}`"
          @click="setBoostColor(hex)"
        />
        <input
          type="color"
          class="color-input"
          data-testid="boost-color-input"
          :value="settings.car.boostColor"
          @input="onBoostColorInput"
        />
      </div>

      <div class="menu-items">
        <button type="button" class="menu-item wo-item" data-index="01" data-menu-back @click="back()">
          BACK
        </button>
      </div>
    </div>
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
  padding-left: 6vw;
  pointer-events: none;
}

/* R12.4: left-side panel only — the centre-right of the screen is left
   clear for the orbiting car the dedicated ChaseCameraController branch
   frames. */
.customise-card {
  width: min(30rem, 40vw);
  padding: 1.75rem 2rem;
  pointer-events: auto;
}

.heading {
  color: var(--ui-ink);
  margin: 0 0 1.5rem 0;
  font-size: 1.9rem;
}

.row-label {
  margin-bottom: 0.5rem;
}

.swatch-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
}

.swatch {
  width: 2rem;
  height: 2rem;
  border: 2px solid rgba(232, 249, 255, 0.25);
  cursor: pointer;
  padding: 0;
}

.swatch:hover,
.swatch:focus-visible {
  border-color: var(--ui-ink);
}

.swatch.active {
  border-color: var(--ui-amber);
  box-shadow: 0 0 0 2px rgba(255, 198, 95, 0.4);
}

.color-input {
  width: 2.4rem;
  height: 2.4rem;
  border: 1px solid rgba(79, 240, 255, 0.35);
  background: transparent;
  padding: 0;
  cursor: pointer;
}

.menu-items {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.menu-item {
  font-family: var(--font-ui);
  font-size: 1.1rem;
  letter-spacing: 0.15em;
  padding: 0.55rem 1.4rem 0.55rem 1rem;
  border: none;
  color: var(--ui-ink);
  cursor: pointer;
  text-align: left;
  text-transform: uppercase;
}

</style>
