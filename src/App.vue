<script setup lang="ts">
import { onMounted } from "vue";

import GameCanvas from "@/components/GameCanvas.vue";
import { useApplicationStore } from "@/stores/applicationStore";

const applicationStore = useApplicationStore();

onMounted(() => {
  applicationStore.setAppState("MENU");
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
