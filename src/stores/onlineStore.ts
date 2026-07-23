import { defineStore } from "pinia";

import { getGameRuntime } from "@/core/GameRuntimeFactory";
import { MultiplayerSession, type MultiplayerEvent } from "@/netcode/MultiplayerSession";
import type { MatchDurationMinutes } from "@/game-flow/MatchFlowTypes";

/**
 * N6 (plan/ONLINE_MULTIPLAYER_PLAN.md): the lobby UI state + the
 * MultiplayerSession lifecycle. Owns the connection to the N4 control
 * plane, translates its events into screen state the OnlineLobby component
 * renders, and — on `match-ready` — hands the runtime everything it needs
 * to begin the synchronized online match (`startOnlineSession`).
 *
 * The control-plane URL comes from `VITE_MP_CONTROL_URL` (N8); the build
 * hash is the deterministic-sim identity — two clients must share it or the
 * handshake is refused (mismatched builds would desync). It tracks the
 * simulation, so it is bumped together with `simDeterminism.spec.ts`'s
 * golden hash whenever the physics changes.
 */
export const MP_BUILD_HASH = "d12dfc99";

export type OnlineScreen = "closed" | "home" | "join" | "connecting" | "queued" | "error" | "in-match";

interface OnlineStoreState {
  screen: OnlineScreen;
  roomCode: string;
  joinCodeInput: string;
  queuePosition: number;
  errorMessage: string;
  isHost: boolean;
}

function controlUrl(): string {
  const configured = (import.meta.env["VITE_MP_CONTROL_URL"] as string | undefined)?.trim();
  if (configured) {
    return configured.replace(/\/$/, "");
  }
  // Same-origin fallback (Workers Assets deploy): ws(s)://<host>/api
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api`;
}

let session: MultiplayerSession | null = null;
let connectTimer: ReturnType<typeof setTimeout> | null = null;

/** If the control server never answers the initial connection, surface an error rather than hang. */
const CONNECT_TIMEOUT_MS = 8000;

export const useOnlineStore = defineStore("online", {
  state: (): OnlineStoreState => ({
    screen: "closed",
    roomCode: "",
    joinCodeInput: "",
    queuePosition: 0,
    errorMessage: "",
    isHost: false
  }),

  actions: {
    openHome(): void {
      this.screen = "home";
      this.errorMessage = "";
    },

    close(): void {
      if (connectTimer) {
        clearTimeout(connectTimer);
        connectTimer = null;
      }
      session?.close();
      session = null;
      this.screen = "closed";
      this.roomCode = "";
      this.queuePosition = 0;
      this.errorMessage = "";
    },

    openJoinEntry(): void {
      this.screen = "join";
      this.joinCodeInput = "";
    },

    createRoom(): void {
      this.startSession();
      this.isHost = true;
      this.screen = "connecting";
      session!.createRoom();
    },

    joinRoom(code: string): void {
      const normalized = code.trim().toUpperCase();
      if (normalized.length !== 5) {
        this.errorMessage = "Enter a 5-character room code.";
        this.screen = "error";
        return;
      }
      this.startSession();
      this.isHost = false;
      this.screen = "connecting";
      session!.joinRoom(normalized);
    },

    quickMatch(): void {
      this.startSession();
      this.isHost = false;
      this.screen = "queued";
      this.queuePosition = 0;
      session!.quickMatch();
    },

    cancel(): void {
      this.close();
      this.openHome();
    },

    startSession(): void {
      session?.close();
      session = new MultiplayerSession({
        controlUrl: controlUrl(),
        buildHash: MP_BUILD_HASH,
        handshakePayload: {},
        onEvent: (event) => this.handleEvent(event)
      });
      // Guard against a control server that never answers (unreachable /
      // wrong URL): if nothing comes back, surface an error rather than
      // sit on the connecting/queued screen forever.
      if (connectTimer) {
        clearTimeout(connectTimer);
      }
      connectTimer = setTimeout(() => {
        connectTimer = null;
        if (this.screen === "connecting" || this.screen === "queued") {
          this.errorMessage = "Couldn't reach the matchmaking server.";
          this.screen = "error";
          session?.close();
          session = null;
        }
      }, CONNECT_TIMEOUT_MS);
    },

    handleEvent(event: MultiplayerEvent): void {
      // Any server response means the connection reached the control plane;
      // the connect-timeout no longer applies (a host may now wait for a
      // friend indefinitely).
      if (connectTimer) {
        clearTimeout(connectTimer);
        connectTimer = null;
      }
      switch (event.type) {
        case "queued":
          this.screen = "queued";
          this.queuePosition = event.position;
          break;
        case "room-ready":
          this.roomCode = event.code;
          this.screen = "connecting";
          break;
        case "connecting":
          this.screen = "connecting";
          break;
        case "match-ready": {
          this.screen = "in-match";
          // The runtime takes over from here; hand off the lockstep context.
          const duration: MatchDurationMinutes = 3;
          getGameRuntime().startOnlineSession(event.context, duration);
          break;
        }
        case "handshake-rejected":
          this.errorMessage =
            event.reason === "build-hash-mismatch"
              ? "Your game versions don't match. Both players need the same build."
              : "Couldn't start the match (protocol mismatch).";
          this.screen = "error";
          break;
        case "disconnected":
          if (this.screen !== "in-match") {
            this.errorMessage = "Connection lost before the match started.";
            this.screen = "error";
          }
          break;
        case "error":
          this.errorMessage = "Couldn't reach the matchmaking server.";
          this.screen = "error";
          break;
      }
    }
  }
});
