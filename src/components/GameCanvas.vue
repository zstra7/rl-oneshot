<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";

import { useGameRuntime } from "@/core/useGameRuntime";
import { installTestApis } from "@/testing/TestApiInstaller";

const canvasRef = ref<HTMLCanvasElement | null>(null);

const runtime = useGameRuntime();

let resizeObserver: ResizeObserver | null = null;

onMounted(async () => {
  const canvas = canvasRef.value;

  if (!canvas) {
    throw new Error("Game canvas was not mounted.");
  }

  await runtime.initialise(canvas);
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
