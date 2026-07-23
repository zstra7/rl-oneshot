<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from "vue";

import GameCanvas from "@/components/GameCanvas.vue";
import CountdownOverlay from "@/components/hud/CountdownOverlay.vue";
import GameplayHud from "@/components/hud/GameplayHud.vue";
import GoalBanner from "@/components/hud/GoalBanner.vue";
import OvertimeBanner from "@/components/hud/OvertimeBanner.vue";
import PauseMenu from "@/components/hud/PauseMenu.vue";
import QuickChatOverlay from "@/components/hud/QuickChatOverlay.vue";
import ResultsScreen from "@/components/hud/ResultsScreen.vue";
import CarCustomise from "@/components/menu/CarCustomise.vue";
import MainMenu from "@/components/menu/MainMenu.vue";
import MatchSetup from "@/components/menu/MatchSetup.vue";
import SettingsPanel from "@/components/menu/SettingsPanel.vue";
import TournamentBracket from "@/components/menu/TournamentBracket.vue";
import TournamentVictory from "@/components/menu/TournamentVictory.vue";
import { useGameRuntime } from "@/core/useGameRuntime";
import { useApplicationStore } from "@/stores/applicationStore";
import { useMatchFlowStore } from "@/stores/matchFlowStore";
import { useTournamentStore } from "@/stores/tournamentStore";
import { useMenuGamepadNavigation } from "@/ui/useMenuGamepadNavigation";

const applicationStore = useApplicationStore();
const matchFlowStore = useMatchFlowStore();
const tournamentStore = useTournamentStore();
const runtime = useGameRuntime();

// R11: console-convention gamepad menu navigation, instantiated once for
// the whole app — owns its own runtime-event subscription/lifecycle.
useMenuGamepadNavigation();

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
  matchFlowStore.setPlayerBallCamera(event.playerBallCamera);
  matchFlowStore.setActiveInputDevice(event.activeInputDevice);
  tournamentStore.setState(event.tournament);
});

onBeforeUnmount(() => {
  unsubscribeAppState();
  unsubscribeSession();
});

const matchState = computed(() => matchFlowStore.matchState);

// F12: pure UI flag (not a runtime mirror) — the settings panel overlaid on
// top of the pause menu. matchState deliberately stays "PAUSED" throughout
// (see matchFlowStore's doc comment for why), so this is the only signal
// that distinguishes the pause menu from its settings overlay.
const pauseSettingsOpen = computed(() => matchFlowStore.pauseSettingsOpen);

// F12: SettingsPanel is reachable from two different, mutually-exclusive
// contexts (MAIN_MENU's matchState === "SETTINGS", or as a PAUSED overlay)
// so it can't live inside the MAIN_MENU-rooted v-else-if ladder below —
// that ladder only evaluates sequentially off matchState === "MAIN_MENU"
// and PAUSED is a completely different branch. Rendering it from its own
// independent v-if keeps the R11 nav composable's single-`[data-menu-root]`
// invariant: it's never true at the same time as PauseMenu (guarded by
// `!pauseSettingsOpen` below) or the MAIN_MENU ladder (matchState can't be
// both "SETTINGS"/"PAUSED" and one of the ladder's own states at once).
const showSettingsPanel = computed(
  () => matchState.value === "SETTINGS" || (matchState.value === "PAUSED" && pauseSettingsOpen.value)
);

// F12: defensively clear the overlay flag whenever the match leaves PAUSED
// (RESUME, RESTART MATCH, RETURN TO MENU) in case it was somehow still set,
// so a later pause doesn't reopen straight into the settings overlay.
watch(matchState, (next) => {
  if (next !== "PAUSED" && matchFlowStore.pauseSettingsOpen) {
    matchFlowStore.setPauseSettingsOpen(false);
  }
});

const showGameplayHud = computed(
  () =>
    ![
      "BOOT",
      "MAIN_MENU",
      "MATCH_SETUP",
      "SETTINGS",
      "CAR_CUSTOMISE",
      "MATCH_LOADING",
      "KICKOFF_SETUP",
      "MATCH_RESULTS",
      "TOURNAMENT_BRACKET",
      "TOURNAMENT_VICTORY"
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
    <CarCustomise v-else-if="matchState === 'CAR_CUSTOMISE'" />
    <TournamentBracket v-else-if="matchState === 'TOURNAMENT_BRACKET'" />
    <TournamentVictory v-else-if="matchState === 'TOURNAMENT_VICTORY'" />

    <SettingsPanel v-if="showSettingsPanel" />

    <GameplayHud v-if="showGameplayHud" />
    <CountdownOverlay
      v-if="['COUNTDOWN_3', 'COUNTDOWN_2', 'COUNTDOWN_1', 'COUNTDOWN_GO'].includes(matchState)"
    />
    <GoalBanner v-if="['GOAL_LATCHED', 'GOAL_CELEBRATION'].includes(matchState)" />
    <OvertimeBanner v-if="matchState === 'OVERTIME_INTRO'" />
    <PauseMenu v-if="matchState === 'PAUSED' && !pauseSettingsOpen" />
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
