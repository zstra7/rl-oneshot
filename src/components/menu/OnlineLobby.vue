<script setup lang="ts">
import { computed, ref } from "vue";

import { useGameRuntime } from "@/core/useGameRuntime";
import { sanitizeNickname } from "@/netcode/Nickname";
import { useOnlineStore } from "@/stores/onlineStore";
import { useSettingsStore } from "@/stores/settingsStore";

const runtime = useGameRuntime();
const online = useOnlineStore();
const settings = useSettingsStore();

const joinCode = ref("");
const copied = ref(false);

// P2.1: the nickname shown to the other peer instead of YOU/CPU — sanitized
// on blur (a stray disallowed character mid-typing is fine; committing it
// to settings is where it gets cleaned).
const nicknameInput = ref(settings.settings.online.nickname);
function commitNickname(): void {
  const clean = sanitizeNickname(nicknameInput.value);
  nicknameInput.value = clean;
  settings.update({ online: { nickname: clean } });
}

const shareUrl = computed(() => `${window.location.origin}${window.location.pathname}?room=${online.roomCode}`);

function sound(kind: "confirm" | "cancel" | "navigate"): void {
  runtime.playUiSound(kind);
}

function quickMatch(): void {
  sound("confirm");
  online.quickMatch();
}
function createRoom(): void {
  sound("confirm");
  online.createRoom();
}
function openJoin(): void {
  sound("confirm");
  joinCode.value = "";
  online.openJoinEntry();
}
function submitJoin(): void {
  sound("confirm");
  online.joinRoom(joinCode.value);
}
function cancel(): void {
  sound("cancel");
  online.cancel();
}
function back(): void {
  sound("cancel");
  online.close();
}
async function copyCode(): Promise<void> {
  try {
    await navigator.clipboard.writeText(shareUrl.value);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  } catch {
    copied.value = false;
  }
}
</script>

<template>
  <div class="menu-panel online-lobby" data-testid="online-lobby" data-menu-root>
    <h2 class="wo-title heading">ONLINE</h2>

    <!-- Home -->
    <nav v-if="online.screen === 'home'" class="menu-items">
      <div class="nickname-row">
        <label class="wo-label" for="online-nickname">NICKNAME</label>
        <input
          id="online-nickname"
          v-model="nicknameInput"
          class="nickname-input"
          data-testid="online-nickname"
          maxlength="12"
          autocomplete="off"
          @blur="commitNickname"
          @keyup.enter="commitNickname"
        />
      </div>
      <button type="button" class="menu-item wo-item" data-index="01" data-testid="online-quick-match" autofocus @click="quickMatch">
        QUICK MATCH
      </button>
      <button type="button" class="menu-item wo-item" data-index="02" data-testid="online-create-room" @click="createRoom">
        CREATE ROOM
      </button>
      <button type="button" class="menu-item wo-item" data-index="03" data-testid="online-join-room" @click="openJoin">
        JOIN ROOM
      </button>
      <button type="button" class="menu-item wo-item" data-index="04" data-menu-back data-testid="online-back" @click="back">
        BACK
      </button>
    </nav>

    <!-- Join code entry -->
    <div v-else-if="online.screen === 'join'" class="lobby-body">
      <label class="wo-label" for="room-code-input">ENTER ROOM CODE</label>
      <input
        id="room-code-input"
        v-model="joinCode"
        class="code-input"
        data-testid="online-code-input"
        maxlength="5"
        autocomplete="off"
        autocapitalize="characters"
        @keyup.enter="submitJoin"
      />
      <div class="button-group">
        <button type="button" class="menu-item wo-item" data-index="01" data-testid="online-join-submit" autofocus @click="submitJoin">
          JOIN
        </button>
        <button type="button" class="menu-item wo-item" data-index="02" data-menu-back @click="back">CANCEL</button>
      </div>
    </div>

    <!-- Connecting / hosting -->
    <div v-else-if="online.screen === 'connecting'" class="lobby-body">
      <p class="wo-label status-line" data-testid="online-status">
        {{ online.isHost ? "WAITING FOR A FRIEND…" : "CONNECTING…" }}
      </p>
      <div v-if="online.isHost && online.roomCode" class="code-display">
        <span class="wo-label">ROOM CODE</span>
        <span class="room-code" data-testid="online-room-code">{{ online.roomCode }}</span>
        <button type="button" class="menu-item wo-item copy-btn" data-index="01" autofocus data-testid="online-copy" @click="copyCode">
          {{ copied ? "COPIED!" : "COPY LINK" }}
        </button>
      </div>
      <button type="button" class="menu-item wo-item" :data-index="online.isHost ? '02' : '01'" data-menu-back @click="cancel">
        CANCEL
      </button>
    </div>

    <!-- Matchmaking queue -->
    <div v-else-if="online.screen === 'queued'" class="lobby-body">
      <p class="wo-label status-line" data-testid="online-status">
        FINDING A MATCH<span v-if="online.queuePosition > 0"> — #{{ online.queuePosition }}</span>…
      </p>
      <button type="button" class="menu-item wo-item" data-index="01" autofocus data-menu-back data-testid="online-cancel-queue" @click="cancel">
        CANCEL
      </button>
    </div>

    <!-- Error -->
    <div v-else-if="online.screen === 'error'" class="lobby-body">
      <p class="wo-label error-line" data-testid="online-error">{{ online.errorMessage }}</p>
      <button type="button" class="menu-item wo-item" data-index="01" autofocus data-menu-back data-testid="online-error-back" @click="back">
        BACK
      </button>
    </div>
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
  color: var(--ui-cyan);
  margin: 0 0 1.5rem 0;
  font-size: 2.4rem;
}
.menu-items,
.lobby-body {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  pointer-events: auto;
}
.button-group {
  display: flex;
  gap: 1rem;
  margin-top: 0.5rem;
}
.menu-item {
  font-family: var(--font-ui);
  font-size: 1.2rem;
  letter-spacing: 0.15em;
  padding: 0.55rem 1.4rem 0.55rem 1rem;
  border: none;
  color: var(--ui-ink);
  cursor: pointer;
  text-align: left;
  text-transform: uppercase;
}
.menu-item:hover,
.menu-item:focus-visible {
  transform: translateX(6px);
}
.nickname-row {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  margin-bottom: 0.5rem;
}
.nickname-input {
  font-family: var(--font-ui);
  font-size: 1.1rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  width: 10em;
  padding: 0.35rem 0.6rem;
  background: rgba(0, 0, 0, 0.4);
  border: 2px solid var(--ui-cyan);
  color: var(--ui-ink);
}
.code-input {
  font-family: var(--font-ui);
  font-size: 2rem;
  letter-spacing: 0.4em;
  text-transform: uppercase;
  width: 8em;
  padding: 0.4rem 0.6rem;
  background: rgba(0, 0, 0, 0.4);
  border: 2px solid var(--ui-cyan);
  color: var(--ui-ink);
}
.code-display {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin: 0.5rem 0;
}
.room-code {
  font-family: var(--font-ui);
  font-size: 2.6rem;
  letter-spacing: 0.5em;
  color: var(--ui-cyan);
}
.status-line {
  font-size: 1.3rem;
}
.error-line {
  font-size: 1.1rem;
  max-width: 28em;
  color: var(--ui-magenta, #ff5e8a);
}
.copy-btn {
  align-self: flex-start;
}
</style>
