import type * as THREE from "three";

import type { AppState } from "@/core/ApplicationState";
import { validateModuleContracts } from "@/core/ContractRegistry";
import { DefaultErrorReporter, type ErrorReporter } from "@/core/ErrorReporter";
import { EventDispatcher, type Unsubscribe } from "@/core/EventDispatcher";
import type { TypedEventMap } from "@/core/EventTypes";
import { FixedStepCoordinator, FIXED_DT_SECONDS } from "@/core/FixedStepCoordinator";
import { FrameCoordinator } from "@/core/FrameCoordinator";
import type { ModuleStatus } from "@/core/GameModule";
import type { RuntimeDiagnostics } from "@/core/RuntimeDiagnostics";
import { RuntimeClock } from "@/core/RuntimeClock";
import {
  createNullModuleContainer,
  type ModuleContainer
} from "@/integration/ModuleContainer";
import { BoostPadRenderBinding } from "@/integration/BoostPadRenderBinding";
import { PhysicsRenderBinding } from "@/integration/PhysicsRenderBinding";
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
import type { ActiveInputDevice } from "@/input/InputTypes";

export type UiRequestedAction = { readonly kind: "noop" };

/** R12.2: matches settingsStore's `car.bodyColor`/`car.boostColor` default (`#4ff0ff`, the built-in player cyan). */
const DEFAULT_PLAYER_CAR_COLOR = "#4ff0ff";

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

  public async initialise(canvas: HTMLCanvasElement): Promise<void> {
    if (this.modules) {
      throw new Error("GameRuntime is already initialised.");
    }

    if (this.disposed) {
      throw new Error("GameRuntime was disposed and cannot be reused.");
    }

    validateModuleContracts([]);

    this.modules = createNullModuleContainer();

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

      const frameDelta = this.clock.computeFrameDelta(timestampMs);
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

    const frame = modules.input.sampleGameplayInputForTick(tick, { grounded });
    this.cameraController?.consumeCameraInput(frame.camera);

    if (frame.system.pausePressed) {
      this.pauseMatch();
    }

    if (modules.gameFlow.areControlsActive()) {
      modules.physics.setCarInput(PLAYER_CAR_ID, frame.car);
      modules.physics.setCarControlProfile(PLAYER_CAR_ID, frame.carControlProfile);

      if (modules.physics.getCarIds().includes(OPPONENT_CAR_ID)) {
        const ownGoalCentre = modules.physics.getGoalSensorCentre("opponent");
        const targetGoalCentre = modules.physics.getGoalSensorCentre("player");

        if (ownGoalCentre && targetGoalCentre) {
          const aiInput = modules.ai.update({
            tick,
            matchState: modules.gameFlow.getMatchState(),
            controlledCar: modules.physics.getCarState(OPPONENT_CAR_ID),
            humanCar: modules.physics.getCarState(PLAYER_CAR_ID),
            ball: modules.physics.getBallState(),
            boostPads: modules.physics.getBoostPadStates(),
            ownGoalCentre,
            targetGoalCentre
          });
          modules.physics.setCarInput(OPPONENT_CAR_ID, aiInput);
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
      session: this.modules.gameFlow.getSessionState(),
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
    return modules.physics.getCarIds().includes(PLAYER_CAR_ID)
      ? modules.physics.getCarState(PLAYER_CAR_ID).boostAmount
      : 0;
  }

  /** WS9.C: HUD supersonic feedback on the boost ring. */
  public getPlayerSupersonic(): boolean {
    const modules = this.requireModules();
    return modules.physics.getCarIds().includes(PLAYER_CAR_ID)
      ? modules.physics.getCarState(PLAYER_CAR_ID).supersonic
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
