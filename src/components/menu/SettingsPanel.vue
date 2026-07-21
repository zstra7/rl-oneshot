<script setup lang="ts">
import { computed, ref } from "vue";

import type { VisualPreset } from "@/assets/procedural/ProceduralAssetContext";
import {
  DEFAULT_GAMEPAD_BINDINGS,
  DEFAULT_KEYBOARD_BINDINGS,
  DEFAULT_MOUSE_BINDINGS
} from "@/input/bindings/DefaultBindings";
import { useGameRuntime } from "@/core/useGameRuntime";
import type { MatchDurationMinutes } from "@/game-flow/MatchFlowTypes";
import type { CelebrationIntensity, DensityLevel } from "@/stores/settingsStore";
import { useSettingsStore } from "@/stores/settingsStore";

const runtime = useGameRuntime();
const settingsStore = useSettingsStore();

type Category = "GAMEPLAY" | "CAMERA" | "GRAPHICS" | "AUDIO" | "CONTROLS" | "ACCESSIBILITY";
const categories: Category[] = ["GAMEPLAY", "CAMERA", "GRAPHICS", "AUDIO", "CONTROLS", "ACCESSIBILITY"];
const activeCategory = ref<Category>("GAMEPLAY");

const settings = computed(() => settingsStore.settings);

const durations: MatchDurationMinutes[] = [1, 3, 10];
const presets: VisualPreset[] = ["authentic", "balanced", "clean"];
const densities: DensityLevel[] = ["low", "normal", "high"];
const intensities: CelebrationIntensity[] = ["low", "normal", "high"];

function selectCategory(category: Category): void {
  runtime.playUiSound("navigate");
  activeCategory.value = category;
}

function back(): void {
  runtime.playUiSound("cancel");
  runtime.openMainMenu();
}

function setGraphicsPreset(preset: VisualPreset): void {
  settingsStore.update({ graphics: { preset } });
  runtime.setVisualPreset(preset);
}

function toggleAccessibility(key: "reducedJitter" | "disableDithering"): void {
  const next = !settings.value.accessibility[key];
  settingsStore.update({ accessibility: { [key]: next } });
  runtime.setAccessibilityOverrides({
    reducedJitter: key === "reducedJitter" ? next : settings.value.accessibility.reducedJitter,
    disableDithering: key === "disableDithering" ? next : settings.value.accessibility.disableDithering
  });
}

function toggleAccessibilityFlag(
  key: "reducedShake" | "reducedFlashes" | "highContrastBall" | "teamPatternMode" | "largerHud"
): void {
  settingsStore.update({ accessibility: { [key]: !settings.value.accessibility[key] } });
}

function toggleFullscreen(): void {
  const next = !settings.value.graphics.fullscreen;
  settingsStore.update({ graphics: { fullscreen: next } });
  if (next && !document.fullscreenElement) {
    document.documentElement.requestFullscreen?.().catch(() => undefined);
  } else if (!next && document.fullscreenElement) {
    document.exitFullscreen?.().catch(() => undefined);
  }
}

function setDefaultDuration(minutes: MatchDurationMinutes): void {
  settingsStore.update({ gameplay: { defaultDurationMinutes: minutes } });
  runtime.selectMatchDuration(minutes);
}

function applyLiveCameraSettings(): void {
  runtime.setCameraSettings({
    fov: settings.value.camera.fov,
    distance: settings.value.camera.distance,
    height: settings.value.camera.height,
    stiffness: settings.value.camera.stiffness,
    ballLookStrength: settings.value.camera.ballLookStrength,
    shakeIntensity: settings.value.camera.shakeIntensity,
    shakeEnabled: settings.value.gameplay.cameraShakeEnabled
  });
}

function setCameraSlider(key: "fov" | "distance" | "height" | "stiffness" | "ballLookStrength" | "shakeIntensity", value: number): void {
  settingsStore.update({ camera: { [key]: value } });
  applyLiveCameraSettings();
}

function toggleCameraShake(): void {
  settingsStore.update({ gameplay: { cameraShakeEnabled: !settings.value.gameplay.cameraShakeEnabled } });
  applyLiveCameraSettings();
}

function applyLiveAudioSettings(): void {
  const audio = settingsStore.settings.audio;
  runtime.setAudioSettings({
    enabled: audio.enabled,
    masterVolume: audio.master,
    effectsVolume: audio.effects,
    musicVolume: audio.music,
    musicEnabled: audio.musicEnabled
  });
}

function setAudioSlider(key: "master" | "music" | "effects" | "ui", value: number): void {
  settingsStore.update({ audio: { [key]: value } });
  applyLiveAudioSettings();
}

function toggleAudioFlag(key: "enabled" | "musicEnabled"): void {
  settingsStore.update({ audio: { [key]: !settings.value.audio[key] } });
  applyLiveAudioSettings();
}
</script>

<template>
  <div class="menu-panel settings-panel" data-testid="settings-panel">
    <h2 class="heading wo-title">SETTINGS</h2>

    <div class="category-tabs" role="tablist" aria-label="Settings categories">
      <button
        v-for="category in categories"
        :key="category"
        type="button"
        class="tab wo-item"
        :class="{ active: activeCategory === category }"
        :data-testid="`settings-tab-${category.toLowerCase()}`"
        role="tab"
        :aria-selected="activeCategory === category"
        @click="selectCategory(category)"
      >
        {{ category }}
      </button>
    </div>

    <div class="category-content">
      <div v-if="activeCategory === 'GAMEPLAY'" class="rows">
        <div class="row">
          <span class="row-label">DEFAULT MATCH LENGTH</span>
          <div class="button-group">
            <button
              v-for="minutes in durations"
              :key="minutes"
              type="button"
              class="chip"
              :class="{ active: settings.gameplay.defaultDurationMinutes === minutes }"
              @click="setDefaultDuration(minutes)"
            >
              {{ minutes }} MIN
            </button>
          </div>
        </div>
        <div class="row">
          <span class="row-label">CAMERA SHAKE</span>
          <button
            type="button"
            class="chip"
            :class="{ active: settings.gameplay.cameraShakeEnabled }"
            data-testid="toggle-camera-shake"
            @click="toggleCameraShake()"
          >
            {{ settings.gameplay.cameraShakeEnabled ? "ON" : "OFF" }}
          </button>
        </div>
        <div class="row">
          <span class="row-label">GOAL CELEBRATION INTENSITY</span>
          <div class="button-group">
            <button
              v-for="intensity in intensities"
              :key="intensity"
              type="button"
              class="chip"
              :class="{ active: settings.gameplay.goalCelebrationIntensity === intensity }"
              @click="settingsStore.update({ gameplay: { goalCelebrationIntensity: intensity } })"
            >
              {{ intensity.toUpperCase() }}
            </button>
          </div>
        </div>
      </div>

      <div v-else-if="activeCategory === 'CAMERA'" class="rows">
        <label class="slider-row">
          <span class="row-label">FOV</span>
          <input
            type="range"
            min="65"
            max="90"
            step="1"
            data-testid="camera-fov"
            :value="settings.camera.fov"
            @input="setCameraSlider('fov', Number(($event.target as HTMLInputElement).value))"
          />
          <span class="slider-value">{{ settings.camera.fov }}</span>
        </label>
        <label class="slider-row">
          <span class="row-label">DISTANCE</span>
          <input
            type="range"
            min="0.7"
            max="1.6"
            step="0.05"
            data-testid="camera-distance"
            :value="settings.camera.distance"
            @input="setCameraSlider('distance', Number(($event.target as HTMLInputElement).value))"
          />
          <span class="slider-value">{{ settings.camera.distance.toFixed(2) }}</span>
        </label>
        <label class="slider-row">
          <span class="row-label">HEIGHT</span>
          <input
            type="range"
            min="0.6"
            max="1.8"
            step="0.05"
            data-testid="camera-height"
            :value="settings.camera.height"
            @input="setCameraSlider('height', Number(($event.target as HTMLInputElement).value))"
          />
          <span class="slider-value">{{ settings.camera.height.toFixed(2) }}</span>
        </label>
        <label class="slider-row">
          <span class="row-label">STIFFNESS</span>
          <input
            type="range"
            min="0.4"
            max="2.0"
            step="0.05"
            data-testid="camera-stiffness"
            :value="settings.camera.stiffness"
            @input="setCameraSlider('stiffness', Number(($event.target as HTMLInputElement).value))"
          />
          <span class="slider-value">{{ settings.camera.stiffness.toFixed(2) }}</span>
        </label>
        <label class="slider-row">
          <span class="row-label">BALL-LOOK STRENGTH</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            data-testid="camera-ball-look-strength"
            :value="settings.camera.ballLookStrength"
            @input="setCameraSlider('ballLookStrength', Number(($event.target as HTMLInputElement).value))"
          />
          <span class="slider-value">{{ settings.camera.ballLookStrength.toFixed(2) }}</span>
        </label>
        <label class="slider-row">
          <span class="row-label">SHAKE</span>
          <input
            type="range"
            min="0"
            max="2"
            step="0.05"
            data-testid="camera-shake-intensity"
            :value="settings.camera.shakeIntensity"
            @input="setCameraSlider('shakeIntensity', Number(($event.target as HTMLInputElement).value))"
          />
          <span class="slider-value">{{ settings.camera.shakeIntensity.toFixed(2) }}</span>
        </label>
      </div>

      <div v-else-if="activeCategory === 'GRAPHICS'" class="rows">
        <div class="row">
          <span class="row-label">PIXEL PRESET</span>
          <div class="button-group">
            <button
              v-for="preset in presets"
              :key="preset"
              type="button"
              class="chip"
              :class="{ active: settings.graphics.preset === preset }"
              :data-testid="`graphics-preset-${preset}`"
              @click="setGraphicsPreset(preset)"
            >
              {{ preset.toUpperCase() }}
            </button>
          </div>
        </div>
        <div class="row">
          <span class="row-label">PARTICLE DENSITY</span>
          <div class="button-group">
            <button
              v-for="density in densities"
              :key="density"
              type="button"
              class="chip"
              :class="{ active: settings.graphics.particleDensity === density }"
              @click="settingsStore.update({ graphics: { particleDensity: density } })"
            >
              {{ density.toUpperCase() }}
            </button>
          </div>
        </div>
        <div class="row">
          <span class="row-label">STAR DENSITY</span>
          <div class="button-group">
            <button
              v-for="density in densities"
              :key="density"
              type="button"
              class="chip"
              :class="{ active: settings.graphics.starDensity === density }"
              @click="settingsStore.update({ graphics: { starDensity: density } })"
            >
              {{ density.toUpperCase() }}
            </button>
          </div>
        </div>
        <div class="row">
          <span class="row-label">GLOW</span>
          <button
            type="button"
            class="chip"
            :class="{ active: settings.graphics.glowEnabled }"
            @click="settingsStore.update({ graphics: { glowEnabled: !settings.graphics.glowEnabled } })"
          >
            {{ settings.graphics.glowEnabled ? "ON" : "OFF" }}
          </button>
        </div>
        <div class="row">
          <span class="row-label">FULLSCREEN</span>
          <button type="button" class="chip" :class="{ active: settings.graphics.fullscreen }" @click="toggleFullscreen">
            {{ settings.graphics.fullscreen ? "ON" : "OFF" }}
          </button>
        </div>
      </div>

      <div v-else-if="activeCategory === 'AUDIO'" class="rows">
        <div class="row">
          <span class="row-label">AUDIO</span>
          <button type="button" class="chip" :class="{ active: settings.audio.enabled }" data-testid="toggle-audio-enabled" @click="toggleAudioFlag('enabled')">
            {{ settings.audio.enabled ? "ON" : "OFF" }}
          </button>
        </div>
        <label class="slider-row">
          <span class="row-label">MASTER</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            :value="settings.audio.master"
            @input="setAudioSlider('master', Number(($event.target as HTMLInputElement).value))"
          />
          <span class="slider-value">{{ Math.round(settings.audio.master * 100) }}</span>
        </label>
        <div class="row">
          <span class="row-label">MUSIC</span>
          <button type="button" class="chip" :class="{ active: settings.audio.musicEnabled }" data-testid="toggle-music-enabled" @click="toggleAudioFlag('musicEnabled')">
            {{ settings.audio.musicEnabled ? "ON" : "OFF" }}
          </button>
        </div>
        <label class="slider-row">
          <span class="row-label">MUSIC VOLUME</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            :value="settings.audio.music"
            @input="setAudioSlider('music', Number(($event.target as HTMLInputElement).value))"
          />
          <span class="slider-value">{{ Math.round(settings.audio.music * 100) }}</span>
        </label>
        <label class="slider-row">
          <span class="row-label">EFFECTS</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            :value="settings.audio.effects"
            @input="setAudioSlider('effects', Number(($event.target as HTMLInputElement).value))"
          />
          <span class="slider-value">{{ Math.round(settings.audio.effects * 100) }}</span>
        </label>
        <label class="slider-row">
          <span class="row-label">UI</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            :value="settings.audio.ui"
            @input="setAudioSlider('ui', Number(($event.target as HTMLInputElement).value))"
          />
          <span class="slider-value">{{ Math.round(settings.audio.ui * 100) }}</span>
        </label>
      </div>

      <div v-else-if="activeCategory === 'CONTROLS'" class="rows">
        <div class="row"><span class="row-label">THROTTLE / REVERSE</span><span class="binding">{{ DEFAULT_KEYBOARD_BINDINGS.accelerate }} / {{ DEFAULT_KEYBOARD_BINDINGS.reverse }}</span></div>
        <div class="row"><span class="row-label">STEER</span><span class="binding">{{ DEFAULT_KEYBOARD_BINDINGS.steerLeft }} / {{ DEFAULT_KEYBOARD_BINDINGS.steerRight }}</span></div>
        <div class="row"><span class="row-label">JUMP</span><span class="binding">MOUSE {{ DEFAULT_MOUSE_BINDINGS.jump }}</span></div>
        <div class="row"><span class="row-label">BOOST</span><span class="binding">MOUSE {{ DEFAULT_MOUSE_BINDINGS.boost }}</span></div>
        <div class="row"><span class="row-label">POWERSLIDE / AIR ROLL</span><span class="binding">{{ DEFAULT_KEYBOARD_BINDINGS.airRollModifierPrimary }}</span></div>
        <div class="row"><span class="row-label">BALL CAMERA</span><span class="binding">{{ DEFAULT_KEYBOARD_BINDINGS.ballCamera }}</span></div>
        <div class="row"><span class="row-label">PAUSE</span><span class="binding">{{ DEFAULT_KEYBOARD_BINDINGS.pause }}</span></div>
        <div class="row"><span class="row-label">GAMEPAD BOOST</span><span class="binding">BUTTON {{ DEFAULT_GAMEPAD_BINDINGS.boostButton }}</span></div>
        <p class="hint">Rebinding is not yet available.</p>
      </div>

      <div v-else-if="activeCategory === 'ACCESSIBILITY'" class="rows">
        <div class="row">
          <span class="row-label">REDUCED SHAKE</span>
          <button type="button" class="chip" :class="{ active: settings.accessibility.reducedShake }" @click="toggleAccessibilityFlag('reducedShake')">
            {{ settings.accessibility.reducedShake ? "ON" : "OFF" }}
          </button>
        </div>
        <div class="row">
          <span class="row-label">REDUCED FLASHES</span>
          <button type="button" class="chip" :class="{ active: settings.accessibility.reducedFlashes }" @click="toggleAccessibilityFlag('reducedFlashes')">
            {{ settings.accessibility.reducedFlashes ? "ON" : "OFF" }}
          </button>
        </div>
        <div class="row">
          <span class="row-label">REDUCED JITTER</span>
          <button
            type="button"
            class="chip"
            :class="{ active: settings.accessibility.reducedJitter }"
            data-testid="toggle-reduced-jitter"
            @click="toggleAccessibility('reducedJitter')"
          >
            {{ settings.accessibility.reducedJitter ? "ON" : "OFF" }}
          </button>
        </div>
        <div class="row">
          <span class="row-label">DISABLE DITHERING</span>
          <button
            type="button"
            class="chip"
            :class="{ active: settings.accessibility.disableDithering }"
            data-testid="toggle-disable-dithering"
            @click="toggleAccessibility('disableDithering')"
          >
            {{ settings.accessibility.disableDithering ? "ON" : "OFF" }}
          </button>
        </div>
        <div class="row">
          <span class="row-label">HIGH-CONTRAST BALL</span>
          <button type="button" class="chip" :class="{ active: settings.accessibility.highContrastBall }" @click="toggleAccessibilityFlag('highContrastBall')">
            {{ settings.accessibility.highContrastBall ? "ON" : "OFF" }}
          </button>
        </div>
        <div class="row">
          <span class="row-label">TEAM PATTERN MODE</span>
          <button type="button" class="chip" :class="{ active: settings.accessibility.teamPatternMode }" @click="toggleAccessibilityFlag('teamPatternMode')">
            {{ settings.accessibility.teamPatternMode ? "ON" : "OFF" }}
          </button>
        </div>
        <div class="row">
          <span class="row-label">LARGER HUD</span>
          <button type="button" class="chip" :class="{ active: settings.accessibility.largerHud }" @click="toggleAccessibilityFlag('largerHud')">
            {{ settings.accessibility.largerHud ? "ON" : "OFF" }}
          </button>
        </div>
      </div>
    </div>

    <button type="button" class="menu-item wo-item" data-index="03" @click="back()">BACK</button>
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
  pointer-events: none;
  color: var(--ui-ink);
  margin: 0 0 1rem 0;
  font-size: 1.6rem;
}

.category-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-bottom: 1rem;
  pointer-events: auto;
}

.tab {
  font-family: var(--font-ui);
  font-size: 0.85rem;
  letter-spacing: 0.1em;
  padding: 0.4rem 0.8rem;
  border: none;
  color: var(--ui-dim);
  cursor: pointer;
}

.tab.active {
  border-left-color: var(--ui-amber);
  color: var(--ui-ink);
  background: rgba(79, 240, 255, 0.12);
}

.category-content {
  pointer-events: auto;
  min-width: 22rem;
  max-width: 30rem;
  margin-bottom: 1.5rem;
}

.rows {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.row,
.slider-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.slider-row input[type="range"] {
  flex: 1;
  accent-color: var(--ui-cyan);
}

.row-label {
  font-family: var(--font-ui);
  font-size: 0.8rem;
  letter-spacing: 0.08em;
  color: var(--ui-ink);
  white-space: nowrap;
}

.binding {
  font-family: var(--font-ui);
  font-size: 0.8rem;
  color: var(--ui-cyan);
}

.slider-value {
  font-family: var(--font-ui);
  font-variant-numeric: tabular-nums;
  font-size: 0.75rem;
  color: var(--ui-dim);
  width: 2.5rem;
  text-align: right;
}

.button-group {
  display: flex;
  gap: 0.35rem;
}

.chip {
  font-family: var(--font-ui);
  font-size: 0.75rem;
  padding: 0.3rem 0.6rem;
  background: rgba(10, 6, 20, 0.55);
  border: 1px solid rgba(79, 240, 255, 0.3);
  color: var(--ui-ink);
  cursor: pointer;
}

.chip.active {
  border-color: var(--ui-cyan);
  color: #050308;
  background: var(--ui-cyan);
}

.hint {
  font-family: var(--font-ui);
  font-size: 0.7rem;
  color: var(--ui-dim);
  margin: 0.25rem 0 0 0;
}

.menu-item {
  pointer-events: auto;
  font-family: var(--font-ui);
  font-size: 1.1rem;
  letter-spacing: 0.15em;
  padding: 0.55rem 1.4rem 0.55rem 1rem;
  border: none;
  color: var(--ui-ink);
  cursor: pointer;
  text-align: left;
  width: fit-content;
  text-transform: uppercase;
}

.menu-item:hover,
.menu-item:focus-visible {
  outline: none;
}
</style>
