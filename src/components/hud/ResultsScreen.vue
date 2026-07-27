<script setup lang="ts">
import { computed } from "vue";

import { useGameRuntime } from "@/core/useGameRuntime";
import { useMatchFlowStore } from "@/stores/matchFlowStore";
import { useOnlineStore } from "@/stores/onlineStore";
import { useTournamentStore } from "@/stores/tournamentStore";

const runtime = useGameRuntime();
const matchFlowStore = useMatchFlowStore();
const onlineStore = useOnlineStore();
const tournamentStore = useTournamentStore();

const session = computed(() => matchFlowStore.session);

// P2.4: in an online match, the winner-perspective flip already means
// "player" = the local human — replace VICTORY/DEFEAT with the winner's
// actual nickname for a friendlier result.
const resultLabel = computed(() => {
  if (runtime.isOnlineSession()) {
    const names = runtime.getOnlineNicknames();
    if (session.value.winner === "player") return `${names?.local ?? "YOU"} WINS`;
    if (session.value.winner === "opponent") return `${names?.remote ?? "OPPONENT"} WINS`;
    return "DRAW";
  }
  if (session.value.winner === "player") return "VICTORY";
  if (session.value.winner === "opponent") return "DEFEAT";
  return "DRAW";
});

// Styling stays keyed to the winner itself (not the display text), so the
// online nickname variant still gets the right victory/defeat/draw colour.
const resultClass = computed(() => {
  if (session.value.winner === "player") return "victory";
  if (session.value.winner === "opponent") return "defeat";
  return "draw";
});

const wasOvertime = computed(() => session.value.overtimeElapsed > 0);

// R13: a tournament match's results screen replaces REPLAY/RETURN TO MENU
// with CONTINUE/LEAVE TOURNAMENT. `active` alone is the right condition —
// by the time this screen renders, the tournament controller has already
// recorded the match result (GameRuntime's edge-detected match-end sync
// fires on the same transition into MATCH_RESULTS), so `phase` has moved
// on to "bracket"/"eliminated"/"champion" already; `active` is what stays
// true for the whole tournament, including this results screen.
const isTournamentMatch = computed(() => tournamentStore.active);

// P4.3: MATCH_RESULTS in an online match replaces REPLAY/RETURN TO MENU with
// a REMATCH (n/2) vote + LEAVE MATCH, mirroring PauseMenu's P3 vote UI — same
// reasoning: neither player can unilaterally restart a shared match. Reads
// `matchFlowStore.session` (re-emitted every frame while online, per P3) so
// the vote count updates live without a tick-driven event.
const isOnlineMatch = computed(() => {
  void matchFlowStore.session;
  return runtime.isOnlineSession();
});
// Why the online match ended, so the player knows what happened instead of
// the game silently landing on a results screen. null = a natural finish
// with both players still connected, where a rematch is offered.
const onlineEndReason = computed(() => {
  void matchFlowStore.session;
  return runtime.getOnlineEndReason();
});
const endReasonLabel = computed(() => {
  switch (onlineEndReason.value) {
    case "opponent-left":
      return "OPPONENT LEFT THE MATCH";
    case "you-left":
      return "YOU LEFT THE MATCH";
    default:
      return "";
  }
});
// A rematch is only possible on a natural finish — if either side forfeited
// or disconnected, the match is over and only RETURN TO MENU is offered.
const canRematch = computed(() => onlineEndReason.value === null);
const rematchVotes = computed(() => {
  void matchFlowStore.session;
  return runtime.getOnlineVoteCounts().rematchVotes;
});
const myRematchVoteActive = computed(() => {
  void matchFlowStore.session;
  return runtime.isVotingOnlineRematch();
});

function toggleOnlineRematchVote(): void {
  runtime.playUiSound("confirm");
  runtime.voteOnlineRematch(!myRematchVoteActive.value);
}

// Full clean exit from an online match: tear down the transport (store) and
// restore single-player state + return to the menu (runtime).
function exitOnlineToMenu(): void {
  runtime.playUiSound("cancel");
  onlineStore.close();
  runtime.leaveOnlineToMenu();
}

function replayMatch(): void {
  runtime.playUiSound("confirm");
  runtime.replayMatch();
}

function returnToMenu(): void {
  runtime.playUiSound("cancel");
  runtime.returnToMenu();
}

function continueTournament(): void {
  runtime.playUiSound("confirm");
  runtime.continueTournament();
}

function leaveTournament(): void {
  runtime.playUiSound("cancel");
  runtime.leaveTournament();
}
</script>

<template>
  <div class="results-overlay" data-testid="results-screen" data-menu-root>
    <div class="results-panel wo-panel">
      <h2 class="result wo-title" :class="resultClass">{{ resultLabel }}</h2>
      <div class="score wo-numeral" data-testid="final-score">
        {{ session.playerScore }} - {{ session.opponentScore }}
      </div>
      <div v-if="wasOvertime" class="overtime-indicator wo-label">OVERTIME</div>
      <div class="duration wo-label">{{ session.selectedDurationMinutes }} MIN MATCH</div>

      <div class="actions">
        <template v-if="isTournamentMatch">
          <button
            type="button"
            class="menu-item wo-item"
            data-index="01"
            data-testid="tournament-continue"
            autofocus
            @click="continueTournament()"
          >
            CONTINUE
          </button>
          <button
            type="button"
            class="menu-item wo-item"
            data-index="02"
            data-testid="tournament-leave"
            data-menu-back
            @click="leaveTournament()"
          >
            LEAVE TOURNAMENT
          </button>
        </template>
        <template v-else-if="isOnlineMatch">
          <p v-if="endReasonLabel" class="wo-label end-reason" data-testid="online-end-reason">{{ endReasonLabel }}</p>
          <template v-if="canRematch">
            <p class="wo-label vote-hint">BOTH PLAYERS MUST AGREE TO REMATCH</p>
            <button
              type="button"
              class="menu-item wo-item"
              data-index="01"
              autofocus
              data-testid="online-rematch-vote"
              @click="toggleOnlineRematchVote()"
            >
              {{ myRematchVoteActive ? "CANCEL REMATCH VOTE" : "REMATCH" }}
              ({{ rematchVotes }}/2)
            </button>
            <button
              type="button"
              class="menu-item wo-item"
              data-index="02"
              data-menu-back
              data-testid="online-results-leave"
              @click="exitOnlineToMenu()"
            >
              LEAVE MATCH
            </button>
          </template>
          <button
            v-else
            type="button"
            class="menu-item wo-item"
            data-index="01"
            autofocus
            data-menu-back
            data-testid="online-results-leave"
            @click="exitOnlineToMenu()"
          >
            RETURN TO MENU
          </button>
        </template>
        <template v-else>
          <button type="button" class="menu-item wo-item" data-index="01" autofocus @click="replayMatch()">
            REPLAY
          </button>
          <button
            type="button"
            class="menu-item wo-item"
            data-index="02"
            data-menu-back
            @click="returnToMenu()"
          >
            RETURN TO MENU
          </button>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.results-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(3, 2, 8, 0.75);
}

.results-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 2.5rem 3rem;
  color: var(--ui-ink);
}

.result {
  font-size: 3rem;
  margin: 0;
}

.result.victory {
  color: var(--ui-cyan);
}

.result.defeat {
  color: var(--ui-magenta);
}

.result.draw {
  color: var(--ui-amber);
}

.score {
  font-size: 2.6rem;
}

.overtime-indicator,
.duration {
  font-size: 0.85rem;
}

.vote-hint {
  text-align: center;
  margin: 0 0 0.25rem 0;
  font-size: 0.8rem;
  opacity: 0.8;
}

.end-reason {
  text-align: center;
  margin: 0 0 0.5rem 0;
  font-size: 0.95rem;
  color: var(--ui-amber);
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  margin-top: 1.25rem;
  width: 100%;
}

.menu-item {
  font-family: var(--font-ui);
  font-size: 1.05rem;
  letter-spacing: 0.15em;
  padding: 0.5rem 1.2rem 0.5rem 1rem;
  border: none;
  color: var(--ui-ink);
  cursor: pointer;
  text-transform: uppercase;
  text-align: left;
}

</style>
