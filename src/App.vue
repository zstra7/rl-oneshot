<script setup lang="ts">
import { computed, onBeforeUnmount } from "vue";

import GameCanvas from "@/components/GameCanvas.vue";
import CountdownOverlay from "@/components/hud/CountdownOverlay.vue";
import GameplayHud from "@/components/hud/GameplayHud.vue";
import GoalBanner from "@/components/hud/GoalBanner.vue";
import OvertimeBanner from "@/components/hud/OvertimeBanner.vue";
import PauseMenu from "@/components/hud/PauseMenu.vue";
import QuickChatOverlay from "@/components/hud/QuickChatOverlay.vue";
import ResultsScreen from "@/components/hud/ResultsScreen.vue";
import MainMenu from "@/components/menu/MainMenu.vue";
import MatchSetup from "@/components/menu/MatchSetup.vue";
import SettingsPanel from "@/components/menu/SettingsPanel.vue";
import { useGameRuntime } from "@/core/useGameRuntime";
import { useApplicationStore } from "@/stores/applicationStore";
import { useMatchFlowStore } from "@/stores/matchFlowStore";

const applicationStore = useApplicationStore();
const matchFlowStore = useMatchFlowStore();
const runtime = useGameRuntime();

// Registered during setup (before any child onMounted hooks run) so no
// early "runtime:app-state-changed" event from GameCanvas's initialise()
// can be missed regardless of mount order.
const unsubscribeAppState = runtime.onEvent("runtime:app-state-changed", (event) => {
  applicationStore.setAppState(event.next);
});

// Mirrors MatchFlowController's session state into Pinia once per
// rendered frame, driven by GameRuntime's own single rAF loop (core
// architecture spec: exactly one requestAnimationFrame loop) rather than
// a second polling loop of this component's own.
const unsubscribeSession = runtime.onEvent("runtime:session-state-changed", (event) => {
  matchFlowStore.setSession(event.session);
  matchFlowStore.setPlayerBoostAmount(event.playerBoostAmount);
  matchFlowStore.setPlayerSupersonic(event.playerSupersonic);
});

onBeforeUnmount(() => {
  unsubscribeAppState();
  unsubscribeSession();
});

const matchState = computed(() => matchFlowStore.matchState);

const showGameplayHud = computed(
  () =>
    ![
      "BOOT",
      "MAIN_MENU",
      "MATCH_SETUP",
      "SETTINGS",
      "MATCH_LOADING",
      "KICKOFF_SETUP",
      "MATCH_RESULTS"
    ].includes(matchState.value)
);
</script>

<template>
  <div id="app-root" :data-app-state="applicationStore.appState">
    <div class="wo-scanlines" aria-hidden="true"></div>
    <div class="wo-vignette" aria-hidden="true"></div>

    <GameCanvas />
    <QuickChatOverlay />

    <MainMenu v-if="matchState === 'MAIN_MENU'" />
    <MatchSetup v-else-if="matchState === 'MATCH_SETUP'" />
    <SettingsPanel v-else-if="matchState === 'SETTINGS'" />

    <GameplayHud v-if="showGameplayHud" />
    <CountdownOverlay
      v-if="['COUNTDOWN_3', 'COUNTDOWN_2', 'COUNTDOWN_1', 'COUNTDOWN_GO'].includes(matchState)"
    />
    <GoalBanner v-if="['GOAL_LATCHED', 'GOAL_CELEBRATION'].includes(matchState)" />
    <OvertimeBanner v-if="matchState === 'OVERTIME_INTRO'" />
    <PauseMenu v-if="matchState === 'PAUSED'" />
    <ResultsScreen v-if="matchState === 'MATCH_RESULTS'" />
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

#app-root {
  position: relative;
}
</style>
