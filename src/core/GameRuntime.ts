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
import { PhysicsRenderBinding } from "@/integration/PhysicsRenderBinding";
import { installAssetTestApi } from "@/assets/testing/BrowserAssetTestApi";
import { installPhysicsTestApi } from "@/physics/testing/BrowserPhysicsTestApi";
import { PlaceholderSceneRenderer } from "@/visual-language/PlaceholderSceneRenderer";

export type UiRequestedAction = { readonly kind: "noop" };

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
}

export class GameRuntime implements GameRuntimeFacade {
  private appState: AppState = "BOOT";
  private modules: ModuleContainer | null = null;
  private sceneRenderer: PlaceholderSceneRenderer | null = null;
  private physicsRenderBinding: PhysicsRenderBinding | null = null;

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

  public async initialise(canvas: HTMLCanvasElement): Promise<void> {
    if (this.modules) {
      throw new Error("GameRuntime is already initialised.");
    }

    if (this.disposed) {
      throw new Error("GameRuntime was disposed and cannot be reused.");
    }

    validateModuleContracts([]);

    this.modules = createNullModuleContainer();

    for (const [name, module] of Object.entries(this.modules)) {
      this.moduleStatus[name] = "initialising";
      await module.initialise();
      this.moduleStatus[name] = "ready";
    }

    this.sceneRenderer = new PlaceholderSceneRenderer(canvas);
    this.moduleStatus["renderer"] = "initialising";
    this.sceneRenderer.initialise();
    this.moduleStatus["renderer"] = "ready";
    this.frameCoordinator.register(this.sceneRenderer);

    this.sceneRenderer.addToScene(this.modules.assets.buildPlaceholderWorld());
    installAssetTestApi(this.modules.assets);

    this.modules.physics.spawnCar({ id: "car-player", transform: { x: -6, y: 1, z: -10 } });
    this.modules.physics.spawnCar({ id: "car-opponent", transform: { x: 6, y: 1, z: 10 } });

    this.physicsRenderBinding = new PhysicsRenderBinding(
      this.modules.physics,
      () => this.fixedStepCoordinator.alpha
    );
    this.frameCoordinator.register(this.physicsRenderBinding);
    this.sceneRenderer.addToScene(this.physicsRenderBinding.getRoot());

    installPhysicsTestApi(this.modules.physics, {
      pause: () => this.stop(),
      resume: () => this.start()
    });

    this.setAppState("MENU");
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

      const frameDelta = this.clock.computeFrameDelta(timestampMs);
      this.fixedStepsLastFrame = this.fixedStepCoordinator.advance(frameDelta);

      this.frameCoordinator.updateFrame({
        timestampMs,
        frameDeltaSeconds: frameDelta,
        alpha: this.fixedStepCoordinator.alpha
      });

      const frameEnd =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      this.frameTimeMs = frameEnd - frameStart;
    } catch (error) {
      this.handleFatalRuntimeError(error);
      return;
    }

    this.frameHandle = requestAnimationFrame(this.frame);
  };

  private onFixedTick(tick: number): void {
    // The single Rapier step location: core's one FixedStepCoordinator
    // drives physics directly rather than the physics module owning a
    // second accumulator, per core architecture spec rule "never step
    // Rapier from more than one location" (see docs/physics-deviations.md).
    this.modules?.physics.step();

    this.dispatcher.emit("runtime:fixed-tick", {
      tick,
      fixedDeltaSeconds: FIXED_DT_SECONDS
    });
  }

  private setAppState(next: AppState): void {
    const previous = this.appState;
    this.appState = next;
    this.dispatcher.emit("runtime:app-state-changed", { previous, next });
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

  public dispose(): void {
    this.stop();

    if (this.modules) {
      for (const module of Object.values(this.modules)) {
        module.dispose();
      }
    }

    this.physicsRenderBinding?.dispose();
    this.physicsRenderBinding = null;

    this.sceneRenderer?.dispose();
    this.sceneRenderer = null;
    this.frameCoordinator.clear();
    this.dispatcher.dispose();

    this.modules = null;
    this.appState = "DISPOSED";
    this.disposed = true;
  }
}
