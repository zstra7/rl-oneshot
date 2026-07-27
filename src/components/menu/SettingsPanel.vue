<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

import type { VisualPreset } from "@/assets/procedural/ProceduralAssetContext";
import {
  DEFAULT_CONTROL_BINDINGS,
  type GamepadBindings,
  type KeyboardMouseBindings
} from "@/input/bindings/BindingsConfig";
import {
  friendlyGamepadLabel,
  friendlyKeyLabel,
  friendlyKeyOrMouseLabel
} from "@/input/bindings/BindingLabels";
import { useGameRuntime } from "@/core/useGameRuntime";
import type { MatchDurationMinutes } from "@/game-flow/MatchFlowTypes";
import { useMatchFlowStore } from "@/stores/matchFlowStore";
import type { CelebrationIntensity, DensityLevel } from "@/stores/settingsStore";
import { useSettingsStore } from "@/stores/settingsStore";

const runtime = useGameRuntime();
const settingsStore = useSettingsStore();
const matchFlowStore = useMatchFlowStore();

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

/**
 * F12: reached both from MAIN_MENU (matchState === "SETTINGS") and as a
 * pause-menu overlay (matchState stays "PAUSED", pauseSettingsOpen true).
 * BACK must return to whichever screen opened it rather than always going
 * to the main menu.
 */
function back(): void {
  runtime.playUiSound("cancel");
  if (matchFlowStore.pauseSettingsOpen) {
    matchFlowStore.setPauseSettingsOpen(false);
    return;
  }
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

// -- R10.4: rebindable controls --

type ControlsDevice = "keyboardMouse" | "gamepad";
type KbmActionKey = keyof KeyboardMouseBindings;
type GamepadActionKey = keyof GamepadBindings;

const UNION_ACTIONS: readonly KbmActionKey[] = ["jump", "boost", "rearView"];

function isUnionAction(key: KbmActionKey): boolean {
  return (UNION_ACTIONS as readonly string[]).includes(key);
}

const controlsDevice = ref<ControlsDevice>("keyboardMouse");
const capturingDevice = ref<ControlsDevice | null>(null);
const capturingAction = ref<string | null>(null);
let gamepadPollHandle: number | null = null;

const kbmRows: readonly { key: KbmActionKey; label: string }[] = [
  { key: "accelerate", label: "ACCELERATE" },
  { key: "reverse", label: "REVERSE" },
  { key: "steerLeft", label: "STEER LEFT" },
  { key: "steerRight", label: "STEER RIGHT" },
  { key: "pitchNoseDown", label: "PITCH NOSE DOWN" },
  { key: "pitchNoseUp", label: "PITCH NOSE UP" },
  { key: "yawLeft", label: "YAW LEFT" },
  { key: "yawRight", label: "YAW RIGHT" },
  { key: "airRollModifierPrimary", label: "AIR ROLL / POWERSLIDE (PRIMARY)" },
  { key: "airRollModifierSecondary", label: "AIR ROLL / POWERSLIDE (SECONDARY)" },
  { key: "powerslide", label: "POWERSLIDE" },
  { key: "jump", label: "JUMP" },
  { key: "boost", label: "BOOST" },
  { key: "rearView", label: "REAR VIEW" },
  { key: "ballCamera", label: "BALL CAMERA" },
  { key: "scoreboard", label: "SCOREBOARD" },
  { key: "pause", label: "PAUSE" }
];

const gamepadRows: readonly { key: GamepadActionKey; label: string }[] = [
  { key: "accelerateButton", label: "ACCELERATE" },
  { key: "reverseButton", label: "REVERSE" },
  { key: "airRollModifierButton", label: "AIR ROLL / POWERSLIDE" },
  { key: "jumpButton", label: "JUMP" },
  { key: "boostButton", label: "BOOST" },
  { key: "powerslideButton", label: "POWERSLIDE" },
  { key: "ballCameraButton", label: "BALL CAMERA" },
  { key: "scoreboardButton", label: "SCOREBOARD" },
  { key: "pauseButton", label: "PAUSE" },
  { key: "rearViewButton", label: "REAR VIEW" }
];

function kbmRowLabel(key: KbmActionKey): string {
  if (capturingDevice.value === "keyboardMouse" && capturingAction.value === key) {
    return "PRESS A KEY…";
  }
  const value = settings.value.controls.keyboardMouse[key];
  return typeof value === "string" ? friendlyKeyLabel(value) : friendlyKeyOrMouseLabel(value);
}

function gamepadRowLabel(key: GamepadActionKey): string {
  if (capturingDevice.value === "gamepad" && capturingAction.value === key) {
    return "PRESS A BUTTON…";
  }
  return friendlyGamepadLabel(settings.value.controls.gamepad[key]);
}

function serializeKbmValue(key: KbmActionKey): string {
  const value = settings.value.controls.keyboardMouse[key];
  if (typeof value === "string") {
    return `key:${value}`;
  }
  return value.kind === "key" ? `key:${value.code}` : `mouse:${value.button}`;
}

const kbmValueCounts = computed(() => {
  const counts = new Map<string, number>();
  for (const row of kbmRows) {
    const serialized = serializeKbmValue(row.key);
    counts.set(serialized, (counts.get(serialized) ?? 0) + 1);
  }
  return counts;
});

function isKbmDuplicate(key: KbmActionKey): boolean {
  return (kbmValueCounts.value.get(serializeKbmValue(key)) ?? 0) > 1;
}

const gamepadValueCounts = computed(() => {
  const counts = new Map<number, number>();
  for (const row of gamepadRows) {
    const value = settings.value.controls.gamepad[row.key];
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
});

function isGamepadDuplicate(key: GamepadActionKey): boolean {
  return (gamepadValueCounts.value.get(settings.value.controls.gamepad[key]) ?? 0) > 1;
}

function applyControls(): void {
  runtime.setControlBindings(settings.value.controls);
}

function endCapture(): void {
  window.removeEventListener("keydown", handleCaptureKeydown, true);
  window.removeEventListener("mousedown", handleCaptureMousedown, true);
  if (gamepadPollHandle !== null) {
    window.clearInterval(gamepadPollHandle);
    gamepadPollHandle = null;
  }
  capturingDevice.value = null;
  capturingAction.value = null;
}

function handleCaptureKeydown(event: KeyboardEvent): void {
  event.preventDefault();
  const action = capturingAction.value as KbmActionKey | null;
  if (!action) {
    return;
  }
  if (event.code === "Escape") {
    endCapture();
    return;
  }
  const patch: Partial<KeyboardMouseBindings> = isUnionAction(action)
    ? { [action]: { kind: "key", code: event.code } }
    : { [action]: event.code };
  settingsStore.update({ controls: { keyboardMouse: patch } });
  applyControls();
  endCapture();
}

function handleCaptureMousedown(event: MouseEvent): void {
  const action = capturingAction.value as KbmActionKey | null;
  if (!action) {
    return;
  }
  if (!isUnionAction(action)) {
    // Key-only rows ignore a mouse capture and stay armed (R10.4).
    event.preventDefault();
    return;
  }
  event.preventDefault();
  settingsStore.update({
    controls: { keyboardMouse: { [action]: { kind: "mouse", button: event.button } } }
  });
  applyControls();
  endCapture();
}

function pollGamepadCapture(): void {
  const captured = runtime.takeCapturedBinding();
  if (!captured || captured.kind !== "gamepad" || typeof captured.button !== "number") {
    return;
  }
  const action = capturingAction.value as GamepadActionKey | null;
  if (action) {
    settingsStore.update({ controls: { gamepad: { [action]: captured.button } } });
    applyControls();
  }
  endCapture();
}

function startKbmCapture(action: KbmActionKey): void {
  endCapture();
  capturingDevice.value = "keyboardMouse";
  capturingAction.value = action;
  runtime.startBindingCapture("keyboardMouse");
  window.addEventListener("keydown", handleCaptureKeydown, true);
  window.addEventListener("mousedown", handleCaptureMousedown, true);
}

function startGamepadCapture(action: GamepadActionKey): void {
  endCapture();
  capturingDevice.value = "gamepad";
  capturingAction.value = action;
  runtime.startBindingCapture("gamepad");
  gamepadPollHandle = window.setInterval(pollGamepadCapture, 100);
}

function selectControlsDevice(device: ControlsDevice): void {
  endCapture();
  controlsDevice.value = device;
}

function resetBindingsToDefaults(): void {
  endCapture();
  settingsStore.update({
    controls: {
      keyboardMouse: { ...DEFAULT_CONTROL_BINDINGS.keyboardMouse },
      gamepad: { ...DEFAULT_CONTROL_BINDINGS.gamepad }
    }
  });
  applyControls();
}

function setAirRollSensitivity(value: number): void {
  settingsStore.update({ controls: { airRollSensitivity: value } });
  runtime.setAirRollSensitivity(value);
}

/**
 * F12: while overlaid on the pause menu, the pause/Escape key closes the
 * overlay (same as clicking BACK) instead of leaking through to resume the
 * match. Skipped while a binding capture is in progress — that has its own
 * capture-phase Escape handler (`handleCaptureKeydown`) which must win.
 */
function handlePauseOverlayKeydown(event: KeyboardEvent): void {
  if (!matchFlowStore.pauseSettingsOpen || capturingDevice.value !== null) {
    return;
  }
  if (event.code !== settingsStore.settings.controls.keyboardMouse.pause) {
    return;
  }
  back();
}

onMounted(() => {
  window.addEventListener("keydown", handlePauseOverlayKeydown);
});

onBeforeUnmount(() => {
  endCapture();
  window.removeEventListener("keydown", handlePauseOverlayKeydown);
});
</script>

<template>
  <div class="menu-panel settings-panel" data-testid="settings-panel" data-menu-root>
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

      <div v-else-if="activeCategory === 'CONTROLS'" class="rows controls-rows">
        <div class="button-group device-chips">
          <button
            type="button"
            class="chip"
            :class="{ active: controlsDevice === 'keyboardMouse' }"
            data-testid="bindings-device-keyboard"
            @click="selectControlsDevice('keyboardMouse')"
          >
            KEYBOARD &amp; MOUSE
          </button>
          <button
            type="button"
            class="chip"
            :class="{ active: controlsDevice === 'gamepad' }"
            data-testid="bindings-device-gamepad"
            @click="selectControlsDevice('gamepad')"
          >
            CONTROLLER
          </button>
        </div>

        <template v-if="controlsDevice === 'keyboardMouse'">
          <div v-for="row in kbmRows" :key="row.key" class="row">
            <span class="wo-label row-label">{{ row.label }}</span>
            <button
              type="button"
              class="chip binding-chip"
              :class="{
                capturing: capturingDevice === 'keyboardMouse' && capturingAction === row.key,
                duplicate: isKbmDuplicate(row.key)
              }"
              :data-testid="`binding-${row.key}`"
              @click="startKbmCapture(row.key)"
            >
              {{ kbmRowLabel(row.key) }}
            </button>
          </div>
        </template>
        <template v-else>
          <div v-for="row in gamepadRows" :key="row.key" class="row">
            <span class="wo-label row-label">{{ row.label }}</span>
            <button
              type="button"
              class="chip binding-chip"
              :class="{
                capturing: capturingDevice === 'gamepad' && capturingAction === row.key,
                duplicate: isGamepadDuplicate(row.key)
              }"
              :data-testid="`binding-gamepad-${row.key}`"
              @click="startGamepadCapture(row.key)"
            >
              {{ gamepadRowLabel(row.key) }}
            </button>
          </div>
        </template>

        <button type="button" class="chip reset-chip" data-testid="bindings-reset" @click="resetBindingsToDefaults()">
          RESET TO DEFAULTS
        </button>

        <label class="slider-row">
          <span class="row-label">AIR ROLL SENSITIVITY</span>
          <input
            type="range"
            min="0.5"
            max="2.0"
            step="0.05"
            data-testid="air-roll-sensitivity"
            :value="settings.controls.airRollSensitivity"
            @input="setAirRollSensitivity(Number(($event.target as HTMLInputElement).value))"
          />
          <span class="slider-value">{{ settings.controls.airRollSensitivity.toFixed(2) }}</span>
        </label>
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

    <button type="button" class="menu-item wo-item" data-index="03" data-menu-back @click="back()">BACK</button>
  </div>
</template>

<style scoped>
.menu-panel {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: flex-start;
  padding-left: 8vw;
  padding-top: 10vh;
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
  /* G9: matches .controls-rows' own max-height cap — the tallest tab
     (CONTROLS) never grows past that, so reserving the same space here
     means switching tabs no longer moves the heading/tabs above it or the
     BACK button below it. */
  min-height: 60vh;
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

.controls-rows {
  max-height: 60vh;
  overflow-y: auto;
  padding-right: 0.25rem;
}

.device-chips {
  margin-bottom: 0.25rem;
}

.binding-chip {
  min-width: 6rem;
  text-align: center;
}

.binding-chip.capturing {
  border-color: var(--ui-amber, #ffb400);
  color: var(--ui-amber, #ffb400);
  animation: pulse 1s ease-in-out infinite;
}

.binding-chip.duplicate {
  border-color: rgba(255, 180, 0, 0.55);
  box-shadow: inset 0 0 0 1px rgba(255, 180, 0, 0.25);
}

.reset-chip {
  align-self: flex-start;
  margin-top: 0.25rem;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.55;
  }
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

</style>
