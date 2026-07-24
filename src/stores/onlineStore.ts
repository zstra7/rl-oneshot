import { defineStore } from "pinia";

import { getGameRuntime } from "@/core/GameRuntimeFactory";
import { MultiplayerSession, type MultiplayerEvent } from "@/netcode/MultiplayerSession";
import { buildHandshakePayload } from "@/netcode/PeerCosmetics";
import { useSettingsStore } from "@/stores/settingsStore";
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
export const MP_BUILD_HASH = "4d896bab";

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
let cachedIceServers: RTCIceServer[] | null = null;

/** If the control server never answers the initial connection, surface an error rather than hang. */
const CONNECT_TIMEOUT_MS = 8000;

const FALLBACK_ICE: RTCIceServer[] = [{ urls: "stun:stun.cloudflare.com:3478" }];

/**
 * Fetch the ICE servers (STUN always, TURN when the Worker has credentials)
 * from the control plane's `/turn-cred` endpoint. Without these, WebRTC has
 * only host candidates and can't traverse NATs — i.e. can't connect across
 * the internet. Cached for the session; falls back to public Cloudflare
 * STUN if the endpoint is unreachable.
 */
async function fetchIceServers(): Promise<RTCIceServer[]> {
  if (cachedIceServers) {
    return cachedIceServers;
  }
  try {
    const httpUrl = controlUrl().replace(/^ws/, "http"); // wss->https, ws->http
    const response = await fetch(`${httpUrl}/turn-cred`);
    if (response.ok) {
      const data = (await response.json()) as { iceServers?: RTCIceServer[] };
      cachedIceServers = data.iceServers && data.iceServers.length > 0 ? data.iceServers : FALLBACK_ICE;
      return cachedIceServers;
    }
  } catch {
    // fall through to STUN fallback
  }
  cachedIceServers = FALLBACK_ICE;
  return cachedIceServers;
}

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

    async createRoom(): Promise<void> {
      this.isHost = true;
      this.screen = "connecting";
      await this.startSession();
      session?.createRoom();
    },

    async joinRoom(code: string): Promise<void> {
      const normalized = code.trim().toUpperCase();
      if (normalized.length !== 5) {
        this.errorMessage = "Enter a 5-character room code.";
        this.screen = "error";
        return;
      }
      this.isHost = false;
      this.screen = "connecting";
      await this.startSession();
      session?.joinRoom(normalized);
    },

    async quickMatch(): Promise<void> {
      this.isHost = false;
      this.screen = "queued";
      this.queuePosition = 0;
      await this.startSession();
      session?.quickMatch();
    },

    cancel(): void {
      this.close();
      this.openHome();
    },

    async startSession(): Promise<void> {
      session?.close();
      const iceServers = await fetchIceServers();
      // P2.2: carry this client's nickname + Customise Car cosmetics in the
      // handshake — relayed verbatim by the control plane, parsed (and
      // validated) by the receiving peer's runtime on match-ready.
      const settings = useSettingsStore();
      const handshakePayload = buildHandshakePayload(
        settings.settings.online.nickname,
        settings.settings.car.bodyColor,
        settings.settings.car.boostColor
      );
      session = new MultiplayerSession({
        controlUrl: controlUrl(),
        buildHash: MP_BUILD_HASH,
        handshakePayload,
        iceServers,
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
          } else {
            // P4.2: the peer disconnected mid-match (WebRTC failed, or they
            // left) — win by forfeit immediately rather than waiting out the
            // silent-abandonment timeout for an already-confirmed loss of
            // connection. No-op if the match already ended some other way.
            getGameRuntime().forfeitOnlineMatchByAbandonment();
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
