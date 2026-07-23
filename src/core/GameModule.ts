export interface GameModule {
  initialise(): Promise<void> | void;
  dispose(): void;
}

export interface FixedTickContext {
  readonly tick: number;
  readonly fixedDeltaSeconds: number;
}

export interface FixedTickModule {
  beforePhysicsTick?(context: FixedTickContext): void;
  afterPhysicsTick?(context: FixedTickContext): void;
}

export interface RenderFrameContext {
  readonly timestampMs: number;
  readonly frameDeltaSeconds: number;
  readonly alpha: number;
}

export interface RenderFrameModule {
  updateRenderFrame(context: RenderFrameContext): void;
}

export type ModuleStatus =
  | "not-initialised"
  | "initialising"
  | "ready"
  | "error"
  | "disposed";
