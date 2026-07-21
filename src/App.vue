<script setup lang="ts">
import { onBeforeUnmount } from "vue";

import GameCanvas from "@/components/GameCanvas.vue";
import { useGameRuntime } from "@/core/useGameRuntime";
import { useApplicationStore } from "@/stores/applicationStore";

const applicationStore = useApplicationStore();
const runtime = useGameRuntime();

// Registered during setup (before any child onMounted hooks run) so no
// early "runtime:app-state-changed" event from GameCanvas's initialise()
// can be missed regardless of mount order.
const unsubscribe = runtime.onEvent("runtime:app-state-changed", (event) => {
  applicationStore.setAppState(event.next);
});

onBeforeUnmount(() => {
  unsubscribe();
});
</script>

<template>
  <div id="app-root" :data-app-state="applicationStore.appState">
    <GameCanvas />
  </div>
</template>

<style>
html,
body,
#app,
#app-root {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  background: #05010a;
  overflow: hidden;
}
</style>
