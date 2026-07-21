<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";

import { useGameRuntime } from "@/core/useGameRuntime";
import { useSettingsStore } from "@/stores/settingsStore";
import { installTestApis } from "@/testing/TestApiInstaller";

const canvasRef = ref<HTMLCanvasElement | null>(null);

const runtime = useGameRuntime();
const settingsStore = useSettingsStore();

let resizeObserver: ResizeObserver | null = null;

onMounted(async () => {
  const canvas = canvasRef.value;

  if (!canvas) {
    throw new Error("Game canvas was not mounted.");
  }

  await runtime.initialise(canvas);

  // Settings spec section 25: persisted graphics/accessibility choices
  // take effect immediately at boot, before the first rendered frame.
  const settings = settingsStore.load();
  runtime.setVisualPreset(settings.graphics.preset);
  runtime.setAccessibilityOverrides({
    reducedJitter: settings.accessibility.reducedJitter,
    disableDithering: settings.accessibility.disableDithering
  });
  runtime.selectMatchDuration(settings.gameplay.defaultDurationMinutes);
  runtime.setAudioSettings({
    enabled: settings.audio.enabled,
    masterVolume: settings.audio.master,
    effectsVolume: settings.audio.effects,
    musicVolume: settings.audio.music,
    musicEnabled: settings.audio.musicEnabled
  });

  // Retro audio module spec section 5: the AudioContext stays suspended
  // until a real user gesture resumes it (browser autoplay policy) — a
  // one-time listener on the very first pointer/keyboard interaction
  // covers every entry point (clicking PLAY, pressing a key) without
  // every button having to remember to call this itself.
  const resumeAudioOnce = () => {
    void runtime.resumeAudioFromGesture();
  };
  window.addEventListener("pointerdown", resumeAudioOnce, { once: true });
  window.addEventListener("keydown", resumeAudioOnce, { once: true });

  runtime.start();

  installTestApis(runtime);

  resizeObserver = new ResizeObserver((entries) => {
    const entry = entries[0];
    if (!entry) {
      return;
    }
    const { width, height } = entry.contentRect;
    const pixelWidth = Math.max(1, Math.round(width));
    const pixelHeight = Math.max(1, Math.round(height));
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    runtime.notifyResize(pixelWidth, pixelHeight);
  });
  resizeObserver.observe(canvas);
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
  runtime.dispose();
});
</script>

<template>
  <canvas ref="canvasRef" class="game-canvas" />
</template>

<style scoped>
.game-canvas {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
