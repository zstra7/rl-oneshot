<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import * as THREE from "three";

import { assertThreeRevision } from "@/core/BuildInfo";

const canvasRef = ref<HTMLCanvasElement | null>(null);

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let frameHandle: number | null = null;

function renderPlaceholderFrame(): void {
  if (!renderer || !scene || !camera) {
    return;
  }

  renderer.render(scene, camera);
  frameHandle = requestAnimationFrame(renderPlaceholderFrame);
}

onMounted(() => {
  const canvas = canvasRef.value;

  if (!canvas) {
    throw new Error("Game canvas was not mounted.");
  }

  assertThreeRevision();

  renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setClearColor(0x05010a, 1);
  renderer.setSize(canvas.clientWidth || 1, canvas.clientHeight || 1, false);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  camera.position.set(0, 0, 5);

  document.documentElement.dataset["threeRevision"] = THREE.REVISION;

  renderPlaceholderFrame();
});

onBeforeUnmount(() => {
  if (frameHandle !== null) {
    cancelAnimationFrame(frameHandle);
    frameHandle = null;
  }

  renderer?.dispose();
  renderer = null;
  scene = null;
  camera = null;
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
