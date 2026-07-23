import type * as THREE from "three";

import type { AppState } from "@/core/ApplicationState";
import { validateModuleContracts } from "@/core/ContractRegistry";
import { DefaultErrorReporter, type ErrorReporter } from "@/core/ErrorReporter";
import { EventDispatcher, type Unsubscribe } from "@/core/EventDispatcher";
import type { TypedEventMap } from "@/core/EventTypes";
import { ALWAYS_ADVANCE, FixedStepCoordinator, FIXED_DT_SECONDS } from "@/core/FixedStepCoordinator";
import { FrameCoordinator } from "@/core/FrameCoordinator";
import type { ModuleStatus } from "@/core/GameModule";
import type { RuntimeDiagnostics } from "@/core/RuntimeDiagnostics";
import { RuntimeClock } from "@/core/RuntimeClock";
import {
  createNullModuleContainer,
  type ModuleContainer
} from "@/integration/ModuleContainer";
import { BoostPadRenderBinding } from "@/integration/BoostPadRenderBinding";
import { PhysicsRenderBinding, type CorrectionTargetId } from "@/integration/PhysicsRenderBinding";
import { installAssetTestApi } from "@/assets/testing/BrowserAssetTestApi";
import { installInputTestApi } from "@/input/testing/BrowserInputTestApi";
import { installPhysicsTestApi } from "@/physics/testing/BrowserPhysicsTestApi";
import { createGameFlowTestApi } from "@/game-flow/testing/BrowserGameFlowTestApi";
import type { BrowserGameFlowTestApi } from "@/game-flow/testing/BrowserGameFlowTestApi";
import {
  MENU_NAVIGABLE_STATES,
  type GameSessionState,
  type MatchConfig,
  type MatchDurationMinutes,
  type MatchState
} from "@/game-flow/MatchFlowTypes";
import { PLAYER_CAR_ID, OPPONENT_CAR_ID } from "@/game-flow/MatchFlowConstants";
import { otherTeam, type TeamId } from "@/core/TeamTypes";
import {
  AiSource,
  BufferedLocalSource,
  LocalDeviceSource,
  type CarInputContext,
  type CarInputSource
} from "@/netcode/CarInputSource";
import type { OnlineMatchContext } from "@/netcode/MultiplayerSession";
import { LEAD_EMA_ALPHA, computeRateScale, computeTargetLeadTicks } from "@/netcode/RateAlignment";
import { FALLBACK_NICKNAME } from "@/netcode/Nickname";
import { parsePeerPayload } from "@/netcode/PeerCosmetics";
import { VoteKind } from "@/netcode/protocol";
import { shouldPause, shouldResume } from "@/netcode/VotePolicy";
import type { CarTeamId } from "@/assets/cars/CarModelTypes";
import type { CarId, Vec3Like } from "@/physics/PhysicsTypes";
import { TournamentController, type TournamentPublicState } from "@/game-flow/TournamentController";
import { ChaseCameraController } from "@/camera/ChaseCameraController";
import type { CameraDiagnostics } from "@/camera/ChaseCameraController";
import { DEFAULT_CAMERA_SETTINGS, type CameraSettings } from "@/camera/CameraSettings";
import type { AiDifficulty } from "@/ai/AiDifficulty";
import type { AiDebugState } from "@/ai/AiTypes";
import { PlaceholderSceneRenderer } from "@/visual-language/PlaceholderSceneRenderer";
import type { VisualPreset } from "@/assets/procedural/ProceduralAssetContext";
import { PSX_RENDER_PRESETS, type VisualDiagnostics } from "@/visual-language/PsxRenderSettings";
import { VfxModule } from "@/vfx/VfxModule";
import { RetroAudioModule } from "@/audio/RetroAudioModule";
import { installAudioTestApi } from "@/audio/testing/BrowserAudioTestApi";
import { AudioEventAdapter } from "@/integration/AudioEventAdapter";
import { DEFAULT_AUDIO_SETTINGS, type AudioDiagnostics, type AudioSettings } from "@/audio/AudioTypes";
import type { ControlBindings } from "@/input/bindings/BindingsConfig";
import type { CapturedBinding } from "@/input/InputControlsModule";
import type { ActiveInputDevice, HumanGameplayInputFrame } from "@/input/InputTypes";

export type UiRequestedAction = { readonly kind: "noop" };

/** R12.2: matches settingsStore's `car.bodyColor`/`car.boostColor` default (`#4ff0ff`, the built-in player cyan). */
const DEFAULT_PLAYER_CAR_COLOR = "#4ff0ff";

/**
 * S5: the most ticks the guest will re-simulate to bridge a host snapshot to
 * its current tick (replay reconciliation). 30 ticks = 250ms of one-way
 * latency + snapshot interval; beyond that the guest adopts the host's
 * timeline outright instead of burning CPU replaying a stale gap.
 */
const ONLINE_MAX_REPLAY_TICKS = 30;

/** P3 (host only): while paused, send a match-flow-carrying snapshot at most every this many rendered frames. */
const PAUSED_SNAPSHOT_EVERY_N_FRAMES = 10;

/** P4.2: no packet at all from the remote peer for this long — the other side has abandoned the match; the local player wins by forfeit. */
const ONLINE_ABANDONMENT_TIMEOUT_MS = 10_000;

/**
 * P1.2: match states in which a car/ball position change is a REAL teleport
 * (kickoff spawn/reset) rather than reconciliation drift — correction
 * smoothing must be suppressed here so a kickoff snaps instantly.
 */
const KICKOFF_PHASE_STATES: readonly MatchState[] = [
  "KICKOFF_SETUP",
  "KICKOFF_RESET",
  "COUNTDOWN_3",
  "COUNTDOWN_2",
  "COUNTDOWN_1",
  "COUNTDOWN_GO"
];

const MENU_MATCH_STATES: readonly MatchState[] = [
  "MAIN_MENU",
  "MATCH_SETUP",
  "SETTINGS",
  "CAR_CUSTOMISE",
  "TOURNAMENT_BRACKET",
  "TOURNAMENT_VICTORY"
];

/**
 * game-flow spec section 35 defines a 3-value `AppState` ("BOOT"|"MENU"|
 * "MATCH") distinct from this project's own `ApplicationState.ts` (which
 * also has LOADING/FATAL_ERROR/DISPOSED for startup-failure handling —
 * see docs/build-decisions.md). Menu-family match states map to "MENU";
 * every live-match state (including MATCH_RESULTS, still part of the
 * match session until the player returns to the menu) maps to "MATCH".
 */
function mapMatchStateToAppState(matchState: MatchState): AppState {
  if (matchState === "BOOT") {
    return "BOOT";
  }
  if (MENU_MATCH_STATES.includes(matchState)) {
    return "MENU";
  }
  return "MATCH";
}

export interface ReadonlyApplicationSnapshot {
  readonly appState: AppState;
  readonly diagnostics: RuntimeDiagnostics;
}

export interface GameRuntimeFacade {
  initialise(canvas: HTMLCanvasElement): Promise<void>;

  start(): void;
  stop(): void;
  dispose(): void;

  notifyResize(width: number, height: number): void;

  requestAction(action: UiRequestedAction): void;

  getReadOnlyState(): ReadonlyApplicationSnapshot;
  getDiagnostics(): RuntimeDiagnostics;

  isInitialised(): boolean;
  isRunning(): boolean;

  /** Bypasses requestAnimationFrame; for Playwright/Vitest determinism only. */
  stepFixedTicksForTesting(count: number): void;

  onEvent<K extends keyof TypedEventMap>(
    type: K,
    listener: (event: TypedEventMap[K]) => void
  ): Unsubscribe;

  // -- Online multiplayer (plan/ONLINE_MULTIPLAYER_PLAN.md, N5/N6) --

  startOnlineSession(context: OnlineMatchContext, durationMinutes: MatchDurationMinutes): void;
  endOnlineSession(): void;
  isOnlineSession(): boolean;
  /** P2.4: the two peers' sanitized nicknames for the active online match, or null outside one. */
  getOnlineNicknames(): { local: string; remote: string } | null;
  /** P3: LEAVE MATCH — forfeits immediately, regardless of pause state. */
  leaveOnlineMatch(): void;
  /** P4.2: the remote peer abandoned the match — local player wins by forfeit. */
  forfeitOnlineMatchByAbandonment(): void;
  /** P3: ESC — toggle this client's personal pause overlay (never touches match state by itself). */
  toggleOnlinePauseOverlay(): void;
  isOnlinePauseOverlayOpen(): boolean;
  /** P3: hold/release this client's "please pause" vote. */
  requestOnlinePause(active: boolean): void;
  /** P3: hold/release this client's "yes, continue" vote. */
  voteOnlineContinue(active: boolean): void;
  getOnlineVoteCounts(): { pauseRequests: number; continueVotes: number };
  isRequestingOnlinePause(): boolean;
  isVotingOnlineContinue(): boolean;
  /** P4.2: RTT + time-since-last-packet for the HUD ping readout, or null outside an online session. */
  getOnlineConnectionInfo(): { rttMs: number | null; msSinceRemoteActivity: number } | null;

  // -- Match flow (game-flow spec sections 28/35/39) --

  getMatchState(): MatchState;
  getSessionState(): GameSessionState;

  openMainMenu(): void;
  openMatchSetup(): void;
  openSettings(): void;
  openCarCustomise(): void;

  /** R12.2: Customise Car live preview — applies the asset override, rebuilds the player's cached visual, and re-tints boost-trail VFX. */
  setPlayerCarColors(colors: { bodyColor: string; boostColor: string }): void;
  getPlayerCarColors(): { bodyColor: string; boostColor: string };
  /** R12.2 test hook: live team-primary body colour off the player's currently-bound scene visual, null before it has spawned one. */
  getPlayerCarPrimaryColorHex(): string | null;
  /** R12.4: Customise Car boost-trail-in-action preview on the stationary menu player car. */
  setBoostPreviewEnabled(enabled: boolean): void;

  selectMatchDuration(minutes: MatchDurationMinutes): void;
  startMatch(config?: Partial<MatchConfig>): void;

  // -- R13: Tournament mode --

  /** MAIN_MENU/MATCH_RESULTS -> TOURNAMENT_BRACKET (setup phase). */
  enterTournament(): void;
  /** Setup screen's BEGIN TOURNAMENT: locks in duration, opens the bracket at round 0. */
  beginTournament(minutes: MatchDurationMinutes): void;
  /** Bracket's PLAY NEXT GAME: applies the round's AI difficulty + saved duration, starts the match. */
  playNextTournamentMatch(): void;
  /** Results screen's CONTINUE: routes to TOURNAMENT_VICTORY (champion) or back to the bracket. */
  continueTournament(): void;
  /** Any tournament LEAVE/RETURN button: full tournament reset, restores pre-tournament AI difficulty/duration, returns to the main menu. */
  leaveTournament(): void;
  getTournamentState(): TournamentPublicState;

  pauseMatch(): void;
  resumeMatch(): void;
  restartMatch(): void;
  replayMatch(): void;
  returnToMenu(): void;

  /** Boost 0-100 for the human player's car, or 0 before it has spawned. */
  getPlayerBoostAmount(): number;

  /** WS9.C: whether the human player's car is currently supersonic, false before it has spawned. */
  getPlayerSupersonic(): boolean;

  /** F11: whether the human player's ball-cam is currently enabled, false before the camera controller exists. */
  getPlayerBallCamera(): boolean;

  /** F11: the most recently used input device, "none" before any input has arrived. */
  getActiveInputDevice(): ActiveInputDevice;

  /** Null before the camera controller has been constructed. */
  getCameraDiagnostics(): CameraDiagnostics | null;
  /** WS4.B: live camera rig tuning from the settings panel/persisted store. */
  setCameraSettings(settings: CameraSettings): void;
  getCameraSettings(): CameraSettings;

  /** AI spec section 7: takes effect on the next tick, live. */
  selectAiDifficulty(difficulty: AiDifficulty): void;
  getAiDifficulty(): AiDifficulty;
  /** AI spec section 8: deterministic given seed + observations. */
  setAiSeed(seed: number): void;
  getAiDebugState(): AiDebugState;

  /** Populated once `initialise()` completes; used by the test API installer. */
  getGameFlowTestApi(): BrowserGameFlowTestApi;

  /**
   * PSX visual spec section 39. This project's existing `VisualPreset`
   * (asset pipeline spec) is already a preset-id string selector, not a
   * mergeable settings struct — `setVisualPreset` takes that id directly
   * rather than the full spec's `DeepPartial<VisualPreset>` object-merge
   * shape. See docs/visual-language-deviations.md.
   */
  setVisualPreset(preset: VisualPreset): void;
  getVisualPreset(): VisualPreset;
  getVisualDiagnostics(): VisualDiagnostics;

  /** Test/diagnostic hook: how many pooled VFX particles are currently alive. */
  getVfxActiveParticleCount(): number;

  /** Settings spec section 25 accessibility category: applies on top of whichever preset is selected. */
  setAccessibilityOverrides(options: { reducedJitter: boolean; disableDithering: boolean }): void;

  /** Retro audio module spec section 5: call on the first Play/Confirm user gesture. Safe to call repeatedly. */
  resumeAudioFromGesture(): Promise<void>;
  setAudioSettings(settings: AudioSettings): void;
  getAudioSettings(): AudioSettings;
  getAudioDiagnostics(): AudioDiagnostics;
  /** UI sound helper (retro audio module spec section 18): components call this instead of importing RetroAudioModule directly. */
  playUiSound(kind: "navigate" | "confirm" | "cancel"): void;

  isMenuPresentationVisible(): boolean;

  /** R10.2: live rebindable-control surface, forwarded to InputControlsModule. */
  setControlBindings(bindings: ControlBindings): void;
  getControlBindings(): ControlBindings;
  startBindingCapture(device: "keyboardMouse" | "gamepad"): void;
  takeCapturedBinding(): CapturedBinding | null;
  /** R10.3: clamped 0.5-2.0, applied on the next tick's carControlProfile. */
  setAirRollSensitivity(value: number): void;
}

export class GameRuntime implements GameRuntimeFacade {
  private appState: AppState = "BOOT";
  private modules: ModuleContainer | null = null;
  private sceneRenderer: PlaceholderSceneRenderer | null = null;
  private placeholderWorldGroup: THREE.Group | null = null;
  private menuPresentationVisible = true;
  /** R12.3: last matchState updateMenuPresentationVisibility ran for — see syncAppStateFromMatchFlow's comment for why this needs its own change check. */
  private previousMatchStateForPresentation: MatchState | null = null;
  private physicsRenderBinding: PhysicsRenderBinding | null = null;
  private boostPadRenderBinding: BoostPadRenderBinding | null = null;
  private gameFlowTestApi: BrowserGameFlowTestApi | null = null;
  private cameraController: ChaseCameraController | null = null;
  private vfxModule: VfxModule | null = null;
  private audioModule: RetroAudioModule | null = null;
  private audioEventAdapter: AudioEventAdapter | null = null;
  private pendingAudioSettings: AudioSettings | null = null;
  private pendingCameraSettings: CameraSettings | null = null;
  /** R12.2: mirrors the live asset/VFX overrides so getPlayerCarColors() has something to report even before a visual has spawned. */
  private playerCarColors: { bodyColor: string; boostColor: string } = {
    bodyColor: DEFAULT_PLAYER_CAR_COLOR,
    boostColor: DEFAULT_PLAYER_CAR_COLOR
  };
  /** R13: pure state machine, no engine deps — see TournamentController.ts. */
  private readonly tournament = new TournamentController();
  /** R13: pre-tournament AI difficulty/duration, saved once on beginTournament() and restored on leave/abandonment. Null when no tournament has begun (or its settings have already been restored). */
  private tournamentSavedDifficulty: AiDifficulty | null = null;
  private tournamentSavedDuration: MatchDurationMinutes | null = null;
  /** R13: last matchState the tournament match-end/abandonment edge-detector ran for. */
  private previousMatchStateForTournament: MatchState | null = null;

  private readonly clock = new RuntimeClock();
  private readonly fixedStepCoordinator = new FixedStepCoordinator(
    (tick) => this.onFixedTick(tick)
  );
  private readonly frameCoordinator = new FrameCoordinator();
  private readonly dispatcher = new EventDispatcher<TypedEventMap>();
  private readonly errorReporter: ErrorReporter = new DefaultErrorReporter(
    this.dispatcher
  );

  private readonly moduleStatus: Record<string, ModuleStatus> = {};

  private running = false;
  private disposed = false;
  private frameHandle: number | null = null;
  private fixedStepsLastFrame = 0;
  private frameTimeMs = 0;
  /** R11: previous frame's `areControlsActive()`, to detect the false->true transition. */
  private previousControlsActive = false;
  /**
   * F4 (plan/ARENA_FLUSH_AND_REFINEMENTS_PLAN.md): the match state the
   * previous frame's `applyMenuNavigationGates()` observed, so the
   * require-release re-arm only fires when controls-active was entered
   * FROM a menu-navigable state (pause resume, menu -> match) — never
   * from `COUNTDOWN_GO -> PLAYING`, which is not menu-navigable and
   * where a held throttle must carry straight through into gameplay.
   */
  private previousMatchStateForGates: MatchState = "BOOT";

  /**
   * N1 (plan/ONLINE_MULTIPLAYER_PLAN.md): every simulated car's per-tick
   * input origin, keyed by CarId. Single-player installs
   * `{ player: local device, opponent: AI }`; online 1v1 (N5) swaps the
   * opponent for a remote source. `onFixedTick` iterates this map instead
   * of hard-coding "the player" and "the AI".
   */
  private readonly carInputSources = new Map<CarId, CarInputSource>();

  /** N6: the active online 1v1 session, or null in single-player. */
  private onlineSession: OnlineMatchContext | null = null;
  /** N6: the next tick whose local input the online submit-ahead loop should sample and send. */
  private onlineNextSubmitTick = 0;
  /** N6: last local input frame sampled in the online submit loop (for the fixed-tick input context). */
  private lastOnlineFrame: HumanGameplayInputFrame | null = null;
  /**
   * The car this client's human is driving, and whose HUD/camera the
   * presentation follows. Always PLAYER_CAR_ID in single-player and for the
   * online offerer; OPPONENT_CAR_ID for the online answerer.
   */
  private localPlayerCarId: CarId = PLAYER_CAR_ID;
  /** P1.3 (guest only): EMA of the replay "lead" (guest tick ahead of the host's snapshot tick). */
  private onlineLeadEma = 4;
  /** P2.4: the two peers' sanitized nicknames for the active online match, or null outside one. */
  private onlineNicknames: { local: string; remote: string } | null = null;
  /**
   * P3: whether THIS client's pause overlay is open. Purely local UI state —
   * opening it never touches match state (the sim keeps running); only when
   * both peers hold a pause-request vote does the match actually pause.
   */
  private onlinePauseOverlayOpen = false;
  /** P3: match-flow's own isPaused() from the PREVIOUS frame, to detect the pause/resume edge and auto-clear the vote whose phase just ended. */
  private onlineWasPaused = false;
  /** P3 (host only): counts frames while paused, so the low-rate paused-frame snapshot only sends every Nth frame. */
  private pausedSnapshotFrameCounter = 0;

  public async initialise(canvas: HTMLCanvasElement): Promise<void> {
    if (this.modules) {
      throw new Error("GameRuntime is already initialised.");
    }

    if (this.disposed) {
      throw new Error("GameRuntime was disposed and cannot be reused.");
    }

    validateModuleContracts([]);

    this.modules = createNullModuleContainer();
    this.configureSinglePlayerInputSources();

    const { input, gameFlow, ...modulesWithGenericInit } = this.modules;

    for (const [name, module] of Object.entries(modulesWithGenericInit)) {
      this.moduleStatus[name] = "initialising";
      await module.initialise();
      this.moduleStatus[name] = "ready";
    }

    this.moduleStatus["input"] = "initialising";
    // Gameplay input is sampled every fixed tick regardless of match state
    // (Phase 7 gates it via matchFlow.areControlsActive() in onFixedTick),
    // so GAMEPLAY is still the right initial input context.
    input.initialise({ gameplayElement: canvas, initialContext: "GAMEPLAY" });
    this.moduleStatus["input"] = "ready";
    installInputTestApi(input, canvas);

    this.sceneRenderer = new PlaceholderSceneRenderer(canvas);
    this.moduleStatus["renderer"] = "initialising";
    this.sceneRenderer.initialise();
    this.moduleStatus["renderer"] = "ready";
    this.frameCoordinator.register(this.sceneRenderer);

    const placeholderWorld = this.modules.assets.buildPlaceholderWorld();
    this.placeholderWorldGroup = placeholderWorld;
    this.sceneRenderer.addToScene(placeholderWorld);
    installAssetTestApi(this.modules.assets);

    // Menu-presentation cars (game-flow spec section 23: "Live presentation
    // stadium, Player car shown on field, Ball visible"). The real Phase 7
    // kickoff sequence re-spawns both cars via physics.resetWorld() when a
    // match actually starts.
    // WS7.A (plan/POLISH_OVERHAUL_PLAN.md): the same "far-back" kickoff
    // pose PhysicsFacade.resetWorld() uses for its default kickoff
    // variant (index 4) — duplicated here rather than imported since
    // it's a private constant, both cars facing the arena centre.
    this.modules.physics.spawnCar({
      id: PLAYER_CAR_ID,
      transform: { x: 0, y: 0.35, z: -24 },
      rotation: { x: 0, y: 1, z: 0, w: 0 }
    });
    this.modules.physics.spawnCar({
      id: OPPONENT_CAR_ID,
      transform: { x: 0, y: 0.35, z: 24 },
      rotation: { x: 0, y: 0, z: 0, w: 1 }
    });

    this.physicsRenderBinding = new PhysicsRenderBinding(
      this.modules.physics,
      this.modules.assets,
      () => this.fixedStepCoordinator.alpha
    );
    this.frameCoordinator.register(this.physicsRenderBinding);
    this.sceneRenderer.addToScene(this.physicsRenderBinding.getRoot());

    this.boostPadRenderBinding = new BoostPadRenderBinding(
      this.modules.physics,
      this.modules.assets
    );
    this.frameCoordinator.register(this.boostPadRenderBinding);
    this.sceneRenderer.addToScene(this.boostPadRenderBinding.getRoot());

    installPhysicsTestApi(this.modules.physics, {
      pause: () => this.stop(),
      resume: () => this.start()
    });

    this.moduleStatus["gameFlow"] = "initialising";
    gameFlow.initialise({ physics: this.modules.physics });
    this.moduleStatus["gameFlow"] = "ready";

    this.vfxModule = new VfxModule(this.modules.physics, gameFlow);
    this.frameCoordinator.register(this.vfxModule);
    this.sceneRenderer.addToScene(this.vfxModule.getRoot());

    this.audioModule = new RetroAudioModule();
    this.moduleStatus["audio"] = "initialising";
    await this.audioModule.initialise();
    this.moduleStatus["audio"] = "ready";
    this.audioModule.setSettings(this.pendingAudioSettings ?? DEFAULT_AUDIO_SETTINGS);
    this.audioEventAdapter = new AudioEventAdapter(this.modules.physics, gameFlow, this.audioModule);
    this.frameCoordinator.register(this.audioEventAdapter);
    installAudioTestApi(this.audioModule);

    const camera = this.sceneRenderer.getCamera();
    if (camera) {
      this.cameraController = new ChaseCameraController(
        this.modules.physics,
        gameFlow,
        camera,
        () => this.fixedStepCoordinator.alpha,
        PLAYER_CAR_ID
      );
      this.cameraController.applyCameraSettings(this.pendingCameraSettings ?? DEFAULT_CAMERA_SETTINGS);
      this.frameCoordinator.register(this.cameraController);
    }

    this.gameFlowTestApi = createGameFlowTestApi(
      gameFlow,
      this.modules.physics,
      (count) => this.stepFixedTicksForTesting(count),
      () => this.emitSessionStateChanged()
    );

    this.setAppState(mapMatchStateToAppState(gameFlow.getMatchState()));
  }

  public start(): void {
    if (!this.modules) {
      throw new Error("initialise() must be called before start().");
    }

    if (this.running) {
      return;
    }

    this.running = true;
    this.clock.reset();
    this.frameHandle = requestAnimationFrame(this.frame);
  }

  public stop(): void {
    this.running = false;

    if (this.frameHandle !== null) {
      cancelAnimationFrame(this.frameHandle);
      this.frameHandle = null;
    }
  }

  private readonly frame = (timestampMs: number): void => {
    if (!this.running) {
      return;
    }

    try {
      const frameStart =
        typeof performance !== "undefined" ? performance.now() : Date.now();

      // R11: apply this frame's gameplay/menu edge gates + the
      // require-release re-arm *before* polling the gamepad or advancing
      // any fixed ticks, reading match state as committed by the end of
      // the previous frame. Ordering matters: a menu->gameplay transition
      // (e.g. clicking RESUME) happens inside emitMenuNavigationFrame()
      // below, i.e. at the *end* of the frame it occurs on — deferring the
      // re-arm to the following frame's applyMenuNavigationGates() call
      // means it always runs before that frame's pollGamepad/fixed-tick
      // advance ever samples gameplay input in the new state, so a still
      // -held button is masked before the first tick that could act on it.
      this.applyMenuNavigationGates();

      this.modules?.input.updateBrowserFrame(timestampMs);

      // N6: in online mode, sample the local input ahead of the simulation
      // and hand it to the lockstep session BEFORE the gated advance, so
      // the advance-gate can actually let ticks through (a tick can't run
      // until its local input is submitted).
      this.driveOnlineSubmit();

      // P1.2: a kickoff/countdown reset is a REAL teleport, not
      // reconciliation drift — suppress correction smoothing for it so it
      // snaps instantly rather than gliding.
      if (this.modules) {
        this.physicsRenderBinding?.setKickoffPhaseActive(
          KICKOFF_PHASE_STATES.includes(this.modules.gameFlow.getMatchState())
        );
      }

      let frameDelta = this.clock.computeFrameDelta(timestampMs);
      // P1.3 (guest only): nudge the frame clock by at most ±3% so the
      // guest's replay lead over the host's snapshot tick gently converges
      // to an RTT-derived target instead of drifting unbounded over a long
      // match. The host is unaffected (its clock is the authority).
      const onlineGuestSession = this.onlineSession && !this.onlineSession.isHost ? this.onlineSession : null;
      if (onlineGuestSession) {
        const targetLead = computeTargetLeadTicks(onlineGuestSession.session.getRttMs());
        frameDelta *= computeRateScale(this.onlineLeadEma, targetLead);
      }
      this.fixedStepsLastFrame = this.fixedStepCoordinator.advance(frameDelta);

      this.frameCoordinator.updateFrame({
        timestampMs,
        frameDeltaSeconds: frameDelta,
        alpha: this.fixedStepCoordinator.alpha
      });

      this.emitMenuNavigationFrame();

      const frameEnd =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      this.frameTimeMs = frameEnd - frameStart;
    } catch (error) {
      this.handleFatalRuntimeError(error);
      return;
    }

    this.frameHandle = requestAnimationFrame(this.frame);
  };

  /**
   * R11: gates gamepad edge collection between gameplay and
   * menu-navigation contexts and arms the require-release re-arm mask on
   * every menu->gameplay transition. Must run before `updateBrowserFrame`
   * (gamepad poll) and the fixed-tick advance each frame — see the call
   * site comment in `frame()` for why ordering is load-bearing here.
   */
  private applyMenuNavigationGates(): void {
    const modules = this.modules;
    if (!modules) {
      return;
    }

    const matchState = modules.gameFlow.getMatchState();
    const controlsActive = modules.gameFlow.areControlsActive();

    modules.input.setGameplayEdgesEnabled(controlsActive);
    modules.input.setMenuEdgesEnabled(MENU_NAVIGABLE_STATES.includes(matchState));

    // F4: only re-arm (mask held buttons) when this activation came FROM a
    // menu-navigable state (e.g. resuming from PAUSED) — never from
    // COUNTDOWN_GO -> PLAYING, which isn't menu-navigable. Without this
    // guard, holding throttle through the countdown got captured into the
    // require-release mask and suppressed until released and re-pressed,
    // even though no menu button was ever held down.
    const cameFromMenuNavigable = MENU_NAVIGABLE_STATES.includes(this.previousMatchStateForGates);
    if (controlsActive && !this.previousControlsActive && cameFromMenuNavigable) {
      modules.input.rearmGameplayInputs();
      modules.input.clearPendingEdges();
    }
    this.previousControlsActive = controlsActive;
    this.previousMatchStateForGates = matchState;
  }

  /**
   * R11: emits the sampled menu-navigation frame once per rendered frame
   * while a `[data-menu-root]` screen is visible. Runs after the fixed-tick
   * advance so a state transition from *this* frame's ticks is reflected;
   * confirm/back handling inside the composable's event listener (e.g.
   * RESUME) may itself flip match state again before this call returns —
   * that flip is picked up by the *next* frame's applyMenuNavigationGates().
   */
  private emitMenuNavigationFrame(): void {
    const modules = this.modules;
    if (!modules) {
      return;
    }

    const matchState = modules.gameFlow.getMatchState();
    if (MENU_NAVIGABLE_STATES.includes(matchState)) {
      const frame = modules.input.sampleMenuNavigation();
      this.dispatcher.emit("runtime:menu-navigation", { frame });
    }
  }

  /**
   * N1: the single-player car-input wiring — the local player's device
   * drives PLAYER_CAR_ID, the AI drives OPPONENT_CAR_ID (targeting the
   * player, defending the opponent net). Behaviour-identical to the
   * pre-N1 inline branches. Online 1v1 (N5) installs a different map with
   * a remote source for the opponent.
   */
  private configureSinglePlayerInputSources(): void {
    if (!this.modules) {
      return;
    }
    this.carInputSources.clear();
    this.carInputSources.set(PLAYER_CAR_ID, new LocalDeviceSource(PLAYER_CAR_ID));
    this.carInputSources.set(
      OPPONENT_CAR_ID,
      new AiSource(OPPONENT_CAR_ID, this.modules.ai, PLAYER_CAR_ID, "opponent", "player")
    );
  }

  /**
   * N6 (plan/ONLINE_MULTIPLAYER_PLAN.md): enter online 1v1 mode. Installs
   * the buffered local source + the remote peer's source, gates the
   * fixed-step advance on the lockstep session (a tick can't run until both
   * cars' inputs for it are in hand), and starts the synchronized match
   * with the shared kickoff seed. The `MultiplayerSession` orchestrator
   * (N5) produces the `context`; the lobby UI (N6) calls this on
   * `match-ready`.
   */
  public startOnlineSession(context: OnlineMatchContext, durationMinutes: MatchDurationMinutes): void {
    const modules = this.requireModules();
    this.onlineSession = context;
    // Restart the fixed-step tick counter at 0 so the input stream numbers
    // from match start on both peers. State-sync never STALLS on a missing
    // remote input (predicted) and never FORFEITS on drift (the host's
    // snapshots correct it) — the only thing that can halt the shared
    // timeline is a P3 both-players pause vote, via the gate installed below.
    this.fixedStepCoordinator.reset();
    this.onlineNextSubmitTick = 0;
    this.lastOnlineFrame = null;
    // P1.3: start the lead EMA at the fallback target; it converges to the
    // measured-RTT target within a few snapshots.
    this.onlineLeadEma = 4;
    // P3: fresh pause/vote state for the new match.
    this.onlinePauseOverlayOpen = false;
    this.onlineWasPaused = false;
    // Follow this client's actual car (the guest drives car-opponent) so the
    // camera, HUD boost/supersonic/ball-cam readouts track the local player.
    this.localPlayerCarId = context.localCarId;
    this.cameraController?.setTargetCar(context.localCarId);

    // Install both cars' sources in a CANONICAL car order (car-player first)
    // so both peers apply inputs in the same order — cheap insurance that
    // keeps the host and guest sims as close as possible between snapshots.
    const sourcesByCar = new Map<CarId, CarInputSource>([
      [context.localCarId, new BufferedLocalSource(context.localCarId, context.session)],
      [context.remoteCarId, context.session.remoteSource]
    ]);
    this.carInputSources.clear();
    for (const carId of [PLAYER_CAR_ID, OPPONENT_CAR_ID] as const) {
      const source = sourcesByCar.get(carId);
      if (source) {
        this.carInputSources.set(carId, source);
      }
    }

    // P3: freeze the shared timeline itself (both peers' tick counters)
    // while the match is actually paused — the ONLY thing besides the clock
    // that can halt online play. `isPaused()` only goes true once BOTH
    // players hold a pause-request vote (see driveOnlineSubmit); opening the
    // personal pause overlay alone never touches this.
    this.fixedStepCoordinator.setAdvanceGate({ canAdvance: () => !modules.gameFlow.isPaused() });
    // The guest follows the host's authoritative match flow; the host runs it.
    modules.gameFlow.setOnlineGuest(!context.isHost);
    modules.gameFlow.startOnlineMatch({ durationMinutes, kickoffSeed: context.kickoffSeed });

    // P2.3/P2.4: apply each peer's nickname + car cosmetics to the CORRECT
    // car (offerer -> car-player, answerer -> car-opponent — the same
    // mapping MultiplayerSession used to assign localCarId/remoteCarId).
    this.onlineNicknames = { local: FALLBACK_NICKNAME, remote: FALLBACK_NICKNAME };
    for (const peer of context.peers) {
      const carId = peer.role === "offerer" ? PLAYER_CAR_ID : OPPONENT_CAR_ID;
      const team: CarTeamId = carId === OPPONENT_CAR_ID ? "opponent" : "player";
      const cosmetics = parsePeerPayload(peer.payload);
      if (cosmetics.bodyColor) {
        modules.assets.setCarColorOverride(team, cosmetics.bodyColor);
        this.physicsRenderBinding?.rebuildCarVisual(carId);
      }
      if (cosmetics.boostColor) {
        this.vfxModule?.setCarBoostColor(carId, cosmetics.boostColor);
      }
      if (carId === context.localCarId) {
        this.onlineNicknames = { ...this.onlineNicknames, local: cosmetics.name };
      } else {
        this.onlineNicknames = { ...this.onlineNicknames, remote: cosmetics.name };
      }
    }
  }

  /** N6: leave online mode and restore single-player timing + input sources. */
  public endOnlineSession(): void {
    this.onlineSession = null;
    this.localPlayerCarId = PLAYER_CAR_ID;
    this.onlineNicknames = null;
    this.onlinePauseOverlayOpen = false;
    this.onlineWasPaused = false;
    this.cameraController?.setTargetCar(PLAYER_CAR_ID);
    this.fixedStepCoordinator.setAdvanceGate(ALWAYS_ADVANCE);
    this.requireModules().gameFlow.setOnlineGuest(false);

    // P2.3: clear the online opponent's cosmetics (car-opponent restores to
    // the fixed team-magenta default; the SP AI never customises itself),
    // and restore the local player's own car to their Customise Car choice
    // — which may have been overwritten if this client played as the guest
    // (car-player then belonged to the remote host during the match).
    const modules = this.requireModules();
    modules.assets.setCarColorOverride("opponent", null);
    this.vfxModule?.setCarBoostColor(OPPONENT_CAR_ID, null);
    this.physicsRenderBinding?.rebuildCarVisual(OPPONENT_CAR_ID);
    this.setPlayerCarColors(this.playerCarColors);

    this.configureSinglePlayerInputSources();
  }

  /**
   * P3: LEAVE MATCH — forfeits immediately (never needs a vote), regardless
   * of pause state. The local team is inferred from which car this client
   * drives; the OTHER team is recorded as the winner.
   */
  public leaveOnlineMatch(): void {
    const context = this.onlineSession;
    if (!context) {
      return;
    }
    const localTeam: TeamId = context.localCarId === OPPONENT_CAR_ID ? "opponent" : "player";
    this.requireModules().gameFlow.endOnlineMatchByForfeit(otherTeam(localTeam));
    this.endOnlineSession();
  }

  /**
   * P4.2: the REMOTE peer abandoned the match (silence past the timeout, or
   * an explicit WebRTC disconnect/failure signal) — the local player wins by
   * forfeit rather than being stuck in a match that can never finish.
   */
  public forfeitOnlineMatchByAbandonment(): void {
    const context = this.onlineSession;
    if (!context) {
      return;
    }
    const localTeam: TeamId = context.localCarId === OPPONENT_CAR_ID ? "opponent" : "player";
    this.requireModules().gameFlow.endOnlineMatchByForfeit(localTeam);
    this.endOnlineSession();
  }

  public isOnlineSession(): boolean {
    return this.onlineSession !== null;
  }

  /** P2.4: the two peers' sanitized nicknames for the active online match, or null outside one. */
  public getOnlineNicknames(): { local: string; remote: string } | null {
    return this.onlineNicknames;
  }

  /**
   * P3: ESC/pause in an online match — purely local UI state. Opening it
   * never touches match state (the sim keeps running); it's the surface the
   * REQUEST MATCH PAUSE / VOTE TO CONTINUE buttons live behind.
   */
  public toggleOnlinePauseOverlay(): void {
    this.onlinePauseOverlayOpen = !this.onlinePauseOverlayOpen;
  }

  public isOnlinePauseOverlayOpen(): boolean {
    return this.onlinePauseOverlayOpen;
  }

  /** P3: hold or release this client's "please pause the match" vote. No-op outside an online session. */
  public requestOnlinePause(active: boolean): void {
    this.onlineSession?.session.setLocalVote(VoteKind.PauseRequest, active);
  }

  /** P3: hold or release this client's "yes, continue" vote (only meaningful while actually paused). */
  public voteOnlineContinue(active: boolean): void {
    this.onlineSession?.session.setLocalVote(VoteKind.ContinueYes, active);
  }

  /** P3: whether THIS client currently holds the pause-request vote. */
  public isRequestingOnlinePause(): boolean {
    return this.onlineSession?.session.hasLocalVote(VoteKind.PauseRequest) ?? false;
  }

  /** P3: whether THIS client currently holds the continue-yes vote. */
  public isVotingOnlineContinue(): boolean {
    return this.onlineSession?.session.hasLocalVote(VoteKind.ContinueYes) ?? false;
  }

  /** P3: live vote tallies for the pause-request / continue-yes phases, for the overlay's "n/2" display. */
  public getOnlineVoteCounts(): { pauseRequests: number; continueVotes: number } {
    const session = this.onlineSession?.session;
    if (!session) {
      return { pauseRequests: 0, continueVotes: 0 };
    }
    const pauseRequests =
      (session.hasLocalVote(VoteKind.PauseRequest) ? 1 : 0) + (session.getRemoteVote(VoteKind.PauseRequest) ? 1 : 0);
    const continueVotes =
      (session.hasLocalVote(VoteKind.ContinueYes) ? 1 : 0) + (session.getRemoteVote(VoteKind.ContinueYes) ? 1 : 0);
    return { pauseRequests, continueVotes };
  }

  /**
   * P4.2: connection-health readout for the HUD ping display — round-trip
   * time (null until the first ping/pong completes) and how long it's been
   * since ANY packet was last heard from the remote peer (the same signal
   * that drives silent-abandonment forfeit).
   */
  public getOnlineConnectionInfo(): { rttMs: number | null; msSinceRemoteActivity: number } | null {
    const session = this.onlineSession?.session;
    if (!session) {
      return null;
    }
    return { rttMs: session.getRttMs(), msSinceRemoteActivity: session.msSinceRemoteActivity() };
  }

  /**
   * S5: online submit-ahead + convergence. Each rendered frame, sample the
   * local input for every tick up to `currentTick + inputDelay` not yet sent,
   * hand it to the state-sync session (which quantizes, buffers, transmits),
   * and pump incoming packets. On the GUEST, apply the newest authoritative
   * host snapshot so the world converges before the next simulated tick.
   * Nothing here can stall or forfeit the match.
   */
  private driveOnlineSubmit(): void {
    const context = this.onlineSession;
    const modules = this.modules;
    if (!context || !modules) {
      return;
    }

    const paused = modules.gameFlow.isPaused();

    // P3: while the match is actually paused (both players voted), the tick
    // counter is frozen by the advance gate — don't keep sampling/submitting
    // input for a tick that will never simulate. Network traffic (pump,
    // votes, and the host's paused-frame snapshots below) keeps flowing so
    // the two peers can still reach "both voted continue" and resume.
    if (!paused) {
      // Sample only a small delay ahead so the local player's OWN car stays
      // near-instant (inputDelayTicks ≈ a couple of ticks of latency). A hitchy
      // frame can still advance several ticks past this in one go; those few
      // ticks fall back to hold-last prediction (StateSyncSession.localInputForTick)
      // rather than stalling or crashing — invisible for a brief catch-up burst.
      const targetTick = this.fixedStepCoordinator.tick + context.session.inputDelayTicks;
      const grounded = modules.physics.getCarIds().includes(context.localCarId)
        ? modules.physics.getCarState(context.localCarId).grounded
        : true;

      let submits = 0;
      const maxSubmitsPerFrame = 32;
      while (this.onlineNextSubmitTick <= targetTick && submits < maxSubmitsPerFrame) {
        const frame = modules.input.sampleGameplayInputForTick(this.onlineNextSubmitTick, { grounded });
        this.lastOnlineFrame = frame;
        this.cameraController?.consumeCameraInput(frame.camera);
        // P3: ESC opens/closes the personal pause overlay — never touches
        // match state directly (that only happens once both peers vote).
        if (frame.system.pausePressed) {
          this.toggleOnlinePauseOverlay();
        }
        context.session.submitLocalInput(this.onlineNextSubmitTick, frame.car);
        this.onlineNextSubmitTick += 1;
        submits += 1;
      }
    } else {
      // P3: while actually paused, no tick is being submitted, but ESC must
      // still work (to close the overlay or change a vote) — sample once at
      // the frame level purely to consume the pause-key edge.
      const frame = modules.input.sampleGameplayInputForTick(this.fixedStepCoordinator.tick, { grounded: true });
      if (frame.system.pausePressed) {
        this.toggleOnlinePauseOverlay();
      }
    }

    context.session.pump();

    // P4.2: no packet at all from the remote peer in ONLINE_ABANDONMENT_TIMEOUT_MS
    // — they've disconnected/closed the tab/lost their network entirely.
    // `forfeitOnlineMatchByAbandonment` nulls `this.onlineSession`, so bail
    // out of the rest of this frame's online handling immediately.
    if (context.session.msSinceRemoteActivity() > ONLINE_ABANDONMENT_TIMEOUT_MS) {
      this.forfeitOnlineMatchByAbandonment();
      return;
    }

    context.session.maintainVotes();
    this.driveOnlinePauseVotes(context, modules, paused);

    if (!context.isHost) {
      this.applyHostSnapshot();
    } else if (modules.gameFlow.isPaused() && this.pausedSnapshotFrameCounter % PAUSED_SNAPSHOT_EVERY_N_FRAMES === 0) {
      // Host, while paused: onFixedTick never runs (ticks are frozen), so
      // this is the only place left to keep the guest's mirrored match state
      // (and the vote counts it renders) fresh — a low-rate frame-driven
      // snapshot rather than the normal per-tick one.
      context.session.sendSnapshot({
        tick: this.fixedStepCoordinator.tick,
        world: modules.physics.getWorldSnapshot(),
        flow: modules.gameFlow.captureAuthorityState()
      });
    }
    if (modules.gameFlow.isPaused()) {
      this.pausedSnapshotFrameCounter += 1;
    }

    this.onlineWasPaused = modules.gameFlow.isPaused();

    // P3: `onFixedTick` (the normal source of `emitSessionStateChanged`)
    // never runs while the match is actually paused — the fixed-tick
    // counter itself is frozen. This frame-level call is the only thing
    // that keeps the Vue HUD (vote counts, the pause/resume transition
    // itself) live while frozen; it's cheap and explicitly designed to be
    // safe from outside the tick loop (see its own doc comment).
    this.emitSessionStateChanged();
  }

  /**
   * P3: the host-authoritative pause/resume decision. Both peers compute the
   * SAME vote counts symmetrically (votes are exchanged peer-to-peer, not
   * relayed through the host) via `VotePolicy`'s pure predicates, but only
   * the host is allowed to act — it calls `pauseMatch()`/`resumeMatch()` and
   * the guest mirrors the resulting transition from the host's next
   * snapshot. Whichever vote's phase just ended is auto-cleared on BOTH
   * sides (comparing this frame's paused state to last frame's) so a held
   * vote never leaks into the next phase.
   */
  private driveOnlinePauseVotes(context: OnlineMatchContext, modules: ModuleContainer, paused: boolean): void {
    const localPauseRequest = context.session.hasLocalVote(VoteKind.PauseRequest);
    const remotePauseRequest = context.session.getRemoteVote(VoteKind.PauseRequest);
    const localContinueYes = context.session.hasLocalVote(VoteKind.ContinueYes);
    const remoteContinueYes = context.session.getRemoteVote(VoteKind.ContinueYes);

    if (context.isHost) {
      if (shouldPause(localPauseRequest, remotePauseRequest, paused)) {
        modules.gameFlow.pause();
      } else if (shouldResume(localContinueYes, remoteContinueYes, paused)) {
        modules.gameFlow.resume();
      }
    }

    const nowPaused = modules.gameFlow.isPaused();
    if (!this.onlineWasPaused && nowPaused) {
      context.session.setLocalVote(VoteKind.PauseRequest, false);
      this.pausedSnapshotFrameCounter = 0;
    }
    if (this.onlineWasPaused && !nowPaused) {
      context.session.setLocalVote(VoteKind.ContinueYes, false);
      this.onlinePauseOverlayOpen = false;
    }
  }

  /**
   * S5 (guest only): converge onto the newest authoritative snapshot the host
   * has sent — WITHOUT introducing perceived lag. The snapshot describes the
   * world as of the host's tick T, which is RTT/2 + a snapshot interval in
   * the past; applying it directly would yank the ball and cars backward a
   * few ticks on every snapshot (a constant sawtooth that reads as lag even
   * on a LAN). Instead the guest REWINDS to the authoritative frame and then
   * REPLAYS its buffered inputs (its own from the local send buffer, the
   * host's from the receive buffer, hold-last for any not yet arrived) up to
   * the tick it had already reached. The result is always
   * "authoritative state + everything known since" — the present stays the
   * present, the ball responds to local hits instantly, and drift is still
   * fully corrected. A handful of extra physics steps per snapshot is cheap
   * (~2 cars + ball).
   */
  private applyHostSnapshot(): void {
    const context = this.onlineSession;
    const modules = this.modules;
    if (!context || !modules) {
      return;
    }
    const snapshot = context.session.consumeSnapshot();
    if (!snapshot) {
      return;
    }

    modules.gameFlow.applyAuthorityState(snapshot.flow);

    // P1.2: capture "where things appeared" before reconciling, so any net
    // position change can be handed to the renderer as a decaying visual
    // offset instead of a hard pop (see PhysicsRenderBinding.addCorrectionOffset).
    const beforePositions = this.captureCorrectionPositions(modules.physics, context);

    // The world snapshot is the state AFTER the host simulated tick T; the
    // guest's own frontier is the last tick it simulated.
    const lastSimulated = this.fixedStepCoordinator.tick - 1;
    const replayTicks = lastSimulated - snapshot.tick;

    // P1.3: this "replay ticks" figure IS the guest's lead over the host's
    // snapshot tick — EMA it (only in the well-behaved case; the outright
    // -adopt branch below is an already-abnormal jump, not a lead sample)
    // so the frame-clock nudge in `frame()` can track it smoothly.
    if (replayTicks >= 0 && replayTicks <= ONLINE_MAX_REPLAY_TICKS) {
      this.onlineLeadEma += LEAD_EMA_ALPHA * (replayTicks - this.onlineLeadEma);
    }

    if (replayTicks < 0 || replayTicks > ONLINE_MAX_REPLAY_TICKS) {
      // The guest is behind the host (slower machine / just joined) or too
      // far ahead to replay across (an RTT spike): adopt the host's frame
      // AND its timeline outright.
      modules.physics.applyWorldSnapshot(snapshot.world);
      this.fixedStepCoordinator.setTickForOnlineSync(snapshot.tick + 1);
      this.onlineNextSubmitTick = Math.max(this.onlineNextSubmitTick, snapshot.tick + 1);
      this.emitCorrectionOffsets(modules.physics, context, beforePositions);
      return;
    }

    modules.physics.applyWorldSnapshot(snapshot.world);
    const controlsActive = modules.gameFlow.areControlsActive();
    for (let t = snapshot.tick + 1; t <= lastSimulated; t += 1) {
      if (controlsActive) {
        modules.physics.setCarInput(context.localCarId, context.session.localInputForTick(t));
        modules.physics.setCarInput(context.remoteCarId, context.session.remoteSource.inputOrHeldForTick(t));
      } else {
        modules.physics.clearAllInputs();
      }
      modules.physics.step();
    }
    // Replayed ticks re-fire physics events (pad pickups, goal overlaps) the
    // presentation already reacted to when they were first simulated — drop
    // them so sounds/VFX don't double-fire.
    modules.physics.clearGoalEvents();
    modules.physics.clearBoostPadEvents();
    this.emitCorrectionOffsets(modules.physics, context, beforePositions);
  }

  /** P1.2: snapshot the world-space positions correction smoothing cares about, or null where not yet spawned. */
  private captureCorrectionPositions(
    physics: ModuleContainer["physics"],
    context: OnlineMatchContext
  ): Partial<Record<CorrectionTargetId, Vec3Like>> {
    const liveCarIds = physics.getCarIds();
    const out: Partial<Record<CorrectionTargetId, Vec3Like>> = {};
    if (liveCarIds.includes(context.localCarId)) {
      out[context.localCarId] = physics.getCarState(context.localCarId).position;
    }
    if (liveCarIds.includes(context.remoteCarId)) {
      out[context.remoteCarId] = physics.getCarState(context.remoteCarId).position;
    }
    out.ball = physics.getBallState().position;
    return out;
  }

  /** P1.2: hand the renderer the delta between the pre-reconciliation and post-reconciliation positions. */
  private emitCorrectionOffsets(
    physics: ModuleContainer["physics"],
    context: OnlineMatchContext,
    before: Partial<Record<CorrectionTargetId, Vec3Like>>
  ): void {
    const binding = this.physicsRenderBinding;
    if (!binding) {
      return;
    }
    const liveCarIds = physics.getCarIds();
    const targets: CorrectionTargetId[] = [context.localCarId, context.remoteCarId, "ball"];
    for (const target of targets) {
      const beforePos = before[target];
      if (!beforePos) {
        continue;
      }
      const afterPos =
        target === "ball"
          ? physics.getBallState().position
          : liveCarIds.includes(target)
            ? physics.getCarState(target).position
            : null;
      if (!afterPos) {
        continue;
      }
      const delta = {
        x: beforePos.x - afterPos.x,
        y: beforePos.y - afterPos.y,
        z: beforePos.z - afterPos.z
      };
      binding.addCorrectionOffset(target, delta);
    }
  }

  private onFixedTick(tick: number): void {
    const modules = this.modules;
    if (!modules) {
      return;
    }

    // game-flow spec section 34 runtime order: (1) collect input handled
    // just below, (2) update match-flow state, (3) step physics, (4)
    // consume physics events / apply goal+dead-ball rules.
    modules.gameFlow.update();

    if (modules.gameFlow.isPaused()) {
      this.dispatcher.emit("runtime:fixed-tick", { tick, fixedDeltaSeconds: FIXED_DT_SECONDS });
      this.syncAppStateFromMatchFlow();
      this.emitSessionStateChanged();
      return;
    }

    // N6: in online mode the local input was already sampled (once per
    // tick) and submitted by `driveOnlineSubmit` before the gated advance,
    // so DO NOT re-sample here (that would double-consume edges). The
    // buffered local source + remote source read from the lockstep buffers.
    const online = this.onlineSession;

    // Sample input once per tick regardless of match state (input spec:
    // one sample per tick) so camera toggles/swivel still respond during
    // countdown/pause, then either apply or neutralise the CarInput half
    // of the frame depending on whether controls are currently live
    // (core architecture spec section 25: sample input -> submit CarInput
    // -> step physics; game-flow spec section 27: controls are
    // neutralised before GO and during any non-live match state).
    const grounded = modules.physics.getCarIds().includes(PLAYER_CAR_ID)
      ? modules.physics.getCarState(PLAYER_CAR_ID).grounded
      : true;

    let frame: HumanGameplayInputFrame;
    if (online) {
      // Reuse the frame the submit loop sampled (for the input context's
      // shape); the online sources don't read it, and camera/pause were
      // already handled in driveOnlineSubmit.
      frame = this.lastOnlineFrame ?? modules.input.sampleGameplayInputForTick(tick, { grounded });
    } else {
      frame = modules.input.sampleGameplayInputForTick(tick, { grounded });
      this.cameraController?.consumeCameraInput(frame.camera);
      if (frame.system.pausePressed) {
        this.pauseMatch();
      }
    }

    if (modules.gameFlow.areControlsActive()) {
      // N1: drive every car from its CarInputSource (local device, AI, or
      // — online — a remote peer). Cars not yet spawned in physics are
      // skipped, exactly as the old `getCarIds().includes(...)` guards did.
      const context: CarInputContext = {
        tick,
        matchState: modules.gameFlow.getMatchState(),
        physics: modules.physics,
        localFrame: frame
      };
      const liveCarIds = modules.physics.getCarIds();
      for (const [carId, source] of this.carInputSources) {
        if (!liveCarIds.includes(carId)) {
          continue;
        }
        const sample = source.sampleForTick(context);
        modules.physics.setCarInput(carId, sample.input);
        if (sample.profile) {
          modules.physics.setCarControlProfile(carId, sample.profile);
        }
      }
    } else {
      modules.physics.clearAllInputs();
    }

    // The single Rapier step location: core's one FixedStepCoordinator
    // drives physics directly rather than the physics module owning a
    // second accumulator, per core architecture spec rule "never step
    // Rapier from more than one location" (see docs/physics-deviations.md).
    modules.physics.step();

    modules.gameFlow.applyPhysicsResults();

    if (online && online.isHost && online.session.shouldSnapshot(tick)) {
      // S5 (host only): stream the just-simulated authoritative frame — world
      // + match-flow decisions — so the guest converges. No hashing, no
      // desync check: drift is corrected by these snapshots, never fatal.
      online.session.sendSnapshot({
        tick,
        world: modules.physics.getWorldSnapshot(),
        flow: modules.gameFlow.captureAuthorityState()
      });
    }
    if (online) {
      online.session.onTickHousekeeping(tick);
    }

    this.dispatcher.emit("runtime:fixed-tick", {
      tick,
      fixedDeltaSeconds: FIXED_DT_SECONDS
    });

    this.syncAppStateFromMatchFlow();
    this.emitSessionStateChanged();
  }

  private syncAppStateFromMatchFlow(): void {
    if (!this.modules) {
      return;
    }
    const matchState = this.modules.gameFlow.getMatchState();
    const next = mapMatchStateToAppState(matchState);
    if (next !== this.appState) {
      this.setAppState(next);
    } else if (matchState !== this.previousMatchStateForPresentation) {
      // R12.3: MAIN_MENU <-> CAR_CUSTOMISE both map to the "MENU" AppState
      // (mapMatchStateToAppState), so setAppState's own change-detection
      // above never re-runs on that transition — the ghost-car visibility
      // toggle below needs its own matchState-level change check to still
      // fire for it.
      this.updateMenuPresentationVisibility(this.appState, matchState);
    }
  }

  /**
   * The session state oriented to this client's own car. Score and winner
   * are stored from the canonical `player` team's perspective; the online
   * answerer drives `car-opponent`, so its HUD must show that team's score
   * as "YOU". Single-player and the offerer see the state unchanged.
   */
  private sessionStateForLocalPlayer(): GameSessionState {
    const state = this.requireModules().gameFlow.getSessionState();
    if (this.localPlayerCarId !== OPPONENT_CAR_ID) {
      return state;
    }
    return {
      ...state,
      playerScore: state.opponentScore,
      opponentScore: state.playerScore,
      winner: state.winner === null ? null : otherTeam(state.winner)
    };
  }

  /**
   * Emitted once per fixed tick — not once per rendered frame — so the Vue
   * UI layer stays in sync with match-flow session state whether ticks are
   * driven by the real rAF loop or by `stepFixedTicksForTesting()` (used
   * by Playwright's deterministic `advanceGameTicks` test API). This adds
   * no extra `requestAnimationFrame` call of its own, so it does not
   * violate the "exactly one rAF loop" architecture rule.
   */
  private emitSessionStateChanged(): void {
    if (!this.modules) {
      return;
    }
    // R13: edge-detect tournament match-end/abandonment off the *current*
    // matchState before emitting, so both real per-tick transitions and
    // direct facade calls (e.g. the pause menu's own returnToMenu(),
    // outside the tick loop) converge on this one path — see
    // syncTournamentFromMatchFlow's own comment for why this location was
    // chosen over gating it to onFixedTick alone.
    this.syncTournamentFromMatchFlow(this.modules.gameFlow.getMatchState());

    this.dispatcher.emit("runtime:session-state-changed", {
      session: this.sessionStateForLocalPlayer(),
      playerBoostAmount: this.getPlayerBoostAmount(),
      playerSupersonic: this.getPlayerSupersonic(),
      playerBallCamera: this.getPlayerBallCamera(),
      activeInputDevice: this.getActiveInputDevice(),
      tournament: this.tournament.getPublicState()
    });
  }

  /**
   * R13: the single code path every tournament match-end and every
   * tournament-abandonment (leave buttons, pause menu RETURN TO MENU, or
   * any future path that ends up calling `gameFlow.returnToMenu()`)
   * converges on. Running this from `emitSessionStateChanged()` — which
   * both `onFixedTick` and every state-mutating facade method already
   * call — rather than only from the fixed-tick loop means a direct,
   * outside-the-tick-loop transition (e.g. PauseMenu's RETURN TO MENU)
   * is picked up immediately rather than lagging a tick behind.
   */
  private syncTournamentFromMatchFlow(matchState: MatchState): void {
    const previous = this.previousMatchStateForTournament;
    this.previousMatchStateForTournament = matchState;
    if (previous === matchState) {
      return;
    }

    const state = this.tournament.getPublicState();

    if (state.phase === "in-match" && matchState === "MATCH_RESULTS") {
      const winner = this.modules!.gameFlow.getSessionState().winner;
      this.tournament.recordMatchResult(winner);
      return;
    }

    // Abandonment safety net: any path that lands back at MAIN_MENU while
    // a tournament is still active (not just the tournament's own LEAVE
    // buttons, which already call tournament.leave() themselves before
    // this ever sees the transition) resets the tournament and restores
    // the saved pre-tournament AI difficulty/duration.
    if (state.active && matchState === "MAIN_MENU") {
      this.tournament.leave();
      this.restoreSavedTournamentSettings();
    }
  }

  private restoreSavedTournamentSettings(): void {
    if (this.tournamentSavedDifficulty !== null) {
      this.selectAiDifficulty(this.tournamentSavedDifficulty);
      this.tournamentSavedDifficulty = null;
    }
    if (this.tournamentSavedDuration !== null) {
      this.modules?.gameFlow.selectMatchDuration(this.tournamentSavedDuration);
      this.tournamentSavedDuration = null;
    }
  }

  private setAppState(next: AppState): void {
    const previous = this.appState;
    this.appState = next;
    this.updateMenuPresentationVisibility(next, this.modules?.gameFlow.getMatchState() ?? null);
    this.dispatcher.emit("runtime:app-state-changed", { previous, next });
  }

  /**
   * WS7.C (plan/POLISH_OVERHAUL_PLAN.md): the placeholder world's static
   * ghost ball/cars (named "MenuGhost*" in `AssetPipeline.buildPlaceholderWorld`)
   * should only be visible at the menu — otherwise they sit motionless
   * on top of the live, physics-driven cars/ball during a match. Only
   * those three named children toggle; the stadium/starfield siblings
   * under the same root stay visible always.
   *
   * R12.3: the static ghost player car is additionally hidden during
   * CAR_CUSTOMISE specifically — that screen's dedicated orbit camera
   * frames the *live*, colour-overridable `PhysicsRenderBinding` car
   * up close, and the static ghost (a separate, never-recoloured visual)
   * would otherwise sit stacked on top of it showing the stale colour.
   */
  private updateMenuPresentationVisibility(appState: AppState, matchState: MatchState | null): void {
    this.menuPresentationVisible = appState === "MENU";
    this.previousMatchStateForPresentation = matchState;
    if (!this.placeholderWorldGroup) {
      return;
    }
    const playerGhost = this.placeholderWorldGroup.getObjectByName("MenuGhostPlayerCar");
    if (playerGhost) {
      playerGhost.visible = this.menuPresentationVisible && matchState !== "CAR_CUSTOMISE";
    }
    const opponentGhost = this.placeholderWorldGroup.getObjectByName("MenuGhostOpponentCar");
    if (opponentGhost) {
      opponentGhost.visible = this.menuPresentationVisible;
    }
  }

  public isMenuPresentationVisible(): boolean {
    return this.menuPresentationVisible;
  }

  private handleFatalRuntimeError(error: unknown): void {
    this.running = false;

    if (this.frameHandle !== null) {
      cancelAnimationFrame(this.frameHandle);
      this.frameHandle = null;
    }

    this.errorReporter.reportRuntimeError(error, true);
    this.setAppState("FATAL_ERROR");
  }

  public notifyResize(width: number, height: number): void {
    this.sceneRenderer?.handleResize(width, height);
  }

  public requestAction(_action: UiRequestedAction): void {
    // Phase 1 defines no commands yet; game-flow/input phases add real
    // UiRequestedAction handling here.
  }

  public getReadOnlyState(): ReadonlyApplicationSnapshot {
    return {
      appState: this.appState,
      diagnostics: this.getDiagnostics()
    };
  }

  public getDiagnostics(): RuntimeDiagnostics {
    const rendererDiagnostics = this.sceneRenderer?.getDiagnostics() ?? {
      drawCalls: 0,
      triangles: 0,
      textures: 0,
      geometries: 0
    };

    const assetProgress = this.modules?.assets.getLoadingProgress();
    const assetErrors = this.modules?.assets.getErrors() ?? [];

    return {
      appState: this.appState,
      running: this.running,
      fixedTick: this.fixedStepCoordinator.tick,
      accumulatorSeconds: this.fixedStepCoordinator.accumulatorSeconds,
      droppedFixedTimeSeconds: this.fixedStepCoordinator.droppedFixedTimeSeconds,
      frameTimeMs: this.frameTimeMs,
      fixedStepsLastFrame: this.fixedStepsLastFrame,
      moduleStatus: { ...this.moduleStatus },
      renderer: rendererDiagnostics,
      assets: {
        loaded: assetProgress?.loaded ?? 0,
        pending: (assetProgress?.total ?? 0) - (assetProgress?.loaded ?? 0),
        failed: assetErrors.length
      },
      subscriptions: this.dispatcher.getSubscriptionCounts(),
      errors: this.errorReporter.getRecentErrors()
    };
  }

  public isInitialised(): boolean {
    return this.modules !== null;
  }

  public isRunning(): boolean {
    return this.running;
  }

  public stepFixedTicksForTesting(count: number): void {
    for (let i = 0; i < count; i += 1) {
      this.fixedStepCoordinator.stepOnce();
    }
  }

  public onEvent<K extends keyof TypedEventMap>(
    type: K,
    listener: (event: TypedEventMap[K]) => void
  ): Unsubscribe {
    return this.dispatcher.on(type, listener);
  }

  private requireModules(): ModuleContainer {
    if (!this.modules) {
      throw new Error("initialise() must be called first.");
    }
    return this.modules;
  }

  public getMatchState(): MatchState {
    return this.requireModules().gameFlow.getMatchState();
  }

  public getSessionState(): GameSessionState {
    return this.requireModules().gameFlow.getSessionState();
  }

  public openMainMenu(): void {
    this.requireModules().gameFlow.openMainMenu();
    this.emitSessionStateChanged();
  }

  public openMatchSetup(): void {
    this.requireModules().gameFlow.openMatchSetup();
    this.emitSessionStateChanged();
  }

  public openSettings(): void {
    this.requireModules().gameFlow.openSettings();
    this.emitSessionStateChanged();
  }

  public openCarCustomise(): void {
    this.requireModules().gameFlow.openCarCustomise();
    this.emitSessionStateChanged();
  }

  public setPlayerCarColors(colors: { bodyColor: string; boostColor: string }): void {
    this.playerCarColors = { ...colors };
    const modules = this.requireModules();
    modules.assets.setPlayerCarColorOverride(colors.bodyColor);
    this.physicsRenderBinding?.rebuildCarVisual(PLAYER_CAR_ID);
    this.vfxModule?.setPlayerBoostColor(colors.boostColor);
  }

  public getPlayerCarColors(): { bodyColor: string; boostColor: string } {
    return { ...this.playerCarColors };
  }

  public getPlayerCarPrimaryColorHex(): string | null {
    return this.physicsRenderBinding?.getCarPrimaryColorHex(PLAYER_CAR_ID) ?? null;
  }

  public setBoostPreviewEnabled(enabled: boolean): void {
    this.vfxModule?.setBoostPreview(enabled ? PLAYER_CAR_ID : null);
  }

  public selectMatchDuration(minutes: MatchDurationMinutes): void {
    this.requireModules().gameFlow.selectMatchDuration(minutes);
    this.emitSessionStateChanged();
  }

  public startMatch(config?: Partial<MatchConfig>): void {
    this.requireModules().gameFlow.startMatch(config);
    this.emitSessionStateChanged();
  }

  // -- R13: Tournament mode --

  public enterTournament(): void {
    const modules = this.requireModules();
    this.tournament.enter();
    modules.gameFlow.openTournamentBracket();
    this.emitSessionStateChanged();
  }

  public beginTournament(minutes: MatchDurationMinutes): void {
    // Save the pre-tournament AI difficulty/duration exactly once, the
    // first time a tournament actually begins (not on enter(), which can
    // be visited then backed out of via BACK without ever playing a game).
    if (this.tournamentSavedDifficulty === null) {
      this.tournamentSavedDifficulty = this.getAiDifficulty();
      this.tournamentSavedDuration = this.requireModules().gameFlow.getSessionState().selectedDurationMinutes;
    }
    this.tournament.begin(minutes);
    this.emitSessionStateChanged();
  }

  public playNextTournamentMatch(): void {
    const modules = this.requireModules();
    const state = this.tournament.getPublicState();
    if (!state.active || state.phase !== "bracket") {
      return;
    }
    const round = this.tournament.startNextMatch();
    this.selectAiDifficulty(round.difficulty);
    modules.gameFlow.selectMatchDuration(state.durationMinutes);
    modules.gameFlow.startMatch();
    this.emitSessionStateChanged();
  }

  public continueTournament(): void {
    const modules = this.requireModules();
    const state = this.tournament.getPublicState();
    if (state.phase === "champion") {
      modules.gameFlow.openTournamentVictory();
    } else {
      modules.gameFlow.openTournamentBracket();
    }
    this.emitSessionStateChanged();
  }

  public leaveTournament(): void {
    const modules = this.requireModules();
    this.tournament.leave();
    this.restoreSavedTournamentSettings();
    modules.gameFlow.returnToMenu();
    this.emitSessionStateChanged();
  }

  public getTournamentState(): TournamentPublicState {
    return this.tournament.getPublicState();
  }

  public pauseMatch(): void {
    this.requireModules().gameFlow.pause();
    this.emitSessionStateChanged();
  }

  public resumeMatch(): void {
    this.requireModules().gameFlow.resume();
    this.emitSessionStateChanged();
  }

  public restartMatch(): void {
    this.requireModules().gameFlow.restartMatch();
    this.emitSessionStateChanged();
  }

  public getPlayerBoostAmount(): number {
    const modules = this.requireModules();
    return modules.physics.getCarIds().includes(this.localPlayerCarId)
      ? modules.physics.getCarState(this.localPlayerCarId).boostAmount
      : 0;
  }

  /** WS9.C: HUD supersonic feedback on the boost ring. */
  public getPlayerSupersonic(): boolean {
    const modules = this.requireModules();
    return modules.physics.getCarIds().includes(this.localPlayerCarId)
      ? modules.physics.getCarState(this.localPlayerCarId).supersonic
      : false;
  }

  /** F11: false before the camera controller has been constructed. */
  public getPlayerBallCamera(): boolean {
    return this.cameraController?.isBallCameraEnabled() ?? false;
  }

  /** F11: forwards InputControlsModule's most-recently-used-device tracking to the HUD. */
  public getActiveInputDevice(): ActiveInputDevice {
    return this.requireModules().input.getActiveDevice();
  }

  public selectAiDifficulty(difficulty: AiDifficulty): void {
    this.requireModules().ai.setDifficulty(difficulty);
  }

  public getAiDifficulty(): AiDifficulty {
    return this.requireModules().ai.getDifficulty();
  }

  public setAiSeed(seed: number): void {
    this.requireModules().ai.setSeed(seed);
  }

  public getAiDebugState(): AiDebugState {
    return this.requireModules().ai.getDebugState();
  }

  public getCameraDiagnostics(): CameraDiagnostics | null {
    return this.cameraController?.getDiagnostics() ?? null;
  }

  public setCameraSettings(settings: CameraSettings): void {
    if (this.cameraController) {
      this.cameraController.applyCameraSettings(settings);
    } else {
      // initialise() hasn't constructed the camera controller yet (e.g. a
      // setting is applied before the async boot sequence reaches it) —
      // remember it and apply it once initialise() does.
      this.pendingCameraSettings = settings;
    }
  }

  public getCameraSettings(): CameraSettings {
    return this.cameraController?.getCameraSettings() ?? this.pendingCameraSettings ?? DEFAULT_CAMERA_SETTINGS;
  }

  public setVisualPreset(preset: VisualPreset): void {
    this.sceneRenderer?.setVisualPreset(preset);
  }

  public getVisualPreset(): VisualPreset {
    return this.sceneRenderer?.getVisualPreset() ?? "clean";
  }

  public getVfxActiveParticleCount(): number {
    return this.vfxModule?.getActiveParticleCount() ?? 0;
  }

  public setAccessibilityOverrides(options: { reducedJitter: boolean; disableDithering: boolean }): void {
    this.sceneRenderer?.setAccessibilityOverrides(options);
  }

  public setControlBindings(bindings: ControlBindings): void {
    this.requireModules().input.setBindings(bindings);
  }

  public getControlBindings(): ControlBindings {
    return this.requireModules().input.getBindings();
  }

  public startBindingCapture(device: "keyboardMouse" | "gamepad"): void {
    this.requireModules().input.startBindingCapture(device);
  }

  public takeCapturedBinding(): CapturedBinding | null {
    return this.requireModules().input.takeCapturedBinding();
  }

  public setAirRollSensitivity(value: number): void {
    this.requireModules().input.setAirRollSensitivity(value);
  }

  public async resumeAudioFromGesture(): Promise<void> {
    await this.audioModule?.resumeFromUserGesture();
  }

  public setAudioSettings(settings: AudioSettings): void {
    if (this.audioModule) {
      this.audioModule.setSettings(settings);
    } else {
      // initialise() hasn't finished constructing the real audio module
      // yet (e.g. a setting is applied before the async boot sequence
      // reaches it) — remember it and apply it once initialise() does.
      this.pendingAudioSettings = settings;
    }
  }

  public getAudioSettings(): AudioSettings {
    return this.audioModule?.getSettings() ?? this.pendingAudioSettings ?? DEFAULT_AUDIO_SETTINGS;
  }

  public getAudioDiagnostics(): AudioDiagnostics {
    return (
      this.audioModule?.getDiagnostics() ?? {
        supported: false,
        contextState: "unavailable",
        awaitingUserGesture: false,
        activeContinuousVoices: [],
        scheduledOneShots: 0,
        cooldownCount: 0,
        musicState: "silent",
        settings: DEFAULT_AUDIO_SETTINGS,
        lastError: null
      }
    );
  }

  public playUiSound(kind: "navigate" | "confirm" | "cancel"): void {
    if (!this.audioModule) {
      return;
    }
    switch (kind) {
      case "navigate":
        this.audioModule.consumeEvent({ type: "audio:ui-navigate" });
        return;
      case "confirm":
        this.audioModule.consumeEvent({ type: "audio:ui-confirm" });
        return;
      case "cancel":
        this.audioModule.consumeEvent({ type: "audio:ui-cancel" });
        return;
    }
  }

  public getVisualDiagnostics(): VisualDiagnostics {
    return (
      this.sceneRenderer?.getVisualDiagnostics() ?? {
        preset: "clean",
        internalResolution: PSX_RENDER_PRESETS["clean"].internalResolution,
        settings: PSX_RENDER_PRESETS["clean"]
      }
    );
  }

  public replayMatch(): void {
    this.requireModules().gameFlow.replayMatch();
    this.emitSessionStateChanged();
  }

  public returnToMenu(): void {
    this.requireModules().gameFlow.returnToMenu();
    this.emitSessionStateChanged();
  }

  public getGameFlowTestApi(): BrowserGameFlowTestApi {
    if (!this.gameFlowTestApi) {
      throw new Error("initialise() must complete before getGameFlowTestApi().");
    }
    return this.gameFlowTestApi;
  }

  public dispose(): void {
    this.stop();

    if (this.modules) {
      for (const module of Object.values(this.modules)) {
        module.dispose();
      }
    }

    this.physicsRenderBinding?.dispose();
    this.physicsRenderBinding = null;

    this.boostPadRenderBinding?.dispose();
    this.boostPadRenderBinding = null;

    this.cameraController?.dispose();
    this.cameraController = null;

    this.vfxModule?.dispose();
    this.vfxModule = null;

    this.audioEventAdapter?.dispose();
    this.audioEventAdapter = null;
    this.audioModule?.dispose();
    this.audioModule = null;

    this.gameFlowTestApi = null;

    this.sceneRenderer?.dispose();
    this.sceneRenderer = null;
    this.frameCoordinator.clear();
    this.dispatcher.dispose();

    this.modules = null;
    this.appState = "DISPOSED";
    this.disposed = true;
  }
}
