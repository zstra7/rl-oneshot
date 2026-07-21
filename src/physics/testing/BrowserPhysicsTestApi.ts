import type { PhysicsFacade } from "@/physics/PhysicsFacade";
import type { DeepPartial, PhysicsParameters } from "@/physics/PhysicsParameters";
import type {
  ArenaPreset,
  BallSerializableState,
  CarId,
  CarInput,
  CarSerializableState,
  ResetWorldOptions,
  SpawnCarOptions,
  WorldSerializableState
} from "@/physics/PhysicsTypes";

export interface PhysicsDiagnostics {
  readonly tick: number;
  readonly carCount: number;
}

/**
 * Trimmed to what Phase 3 (physics foundation) actually implements. The
 * full physics spec section 30 interface also specifies boost-pad
 * methods, scenario/telemetry recording, and debug/camera controls —
 * those require systems built in later phases (6, 5 calibration loop,
 * 8/9) and are deferred; see docs/physics-deviations.md.
 */
export interface BrowserPhysicsTestApi {
  ready(): boolean;

  pauseRuntime(): void;
  resumeRuntime(): void;

  resetWorld(options?: ResetWorldOptions): void;
  setArenaPreset(preset: ArenaPreset): void;

  setPhysicsParameters(partial: DeepPartial<PhysicsParameters>): void;
  getPhysicsParameters(): PhysicsParameters;

  spawnCar(options: SpawnCarOptions): CarId;
  removeCar(carId: CarId): void;
  getCarIds(): CarId[];

  getCarState(carId: CarId): CarSerializableState;
  getAllCarStates(): CarSerializableState[];
  setCarState(carId: CarId, state: Partial<CarSerializableState>): void;

  getBallState(): BallSerializableState;
  setBallState(state: Partial<BallSerializableState>): void;
  getWorldState(): WorldSerializableState;

  setCarInput(carId: CarId, input: Partial<CarInput>): void;
  clearCarInput(carId: CarId): void;
  clearAllInputs(): void;

  stepTicks(count: number): void;

  getDiagnostics(): PhysicsDiagnostics;
}

declare global {
  interface Window {
    __PHYSICS_TEST__?: BrowserPhysicsTestApi;
  }
}

export interface RuntimeStepControl {
  pause(): void;
  resume(): void;
}

export function installPhysicsTestApi(
  physics: PhysicsFacade,
  runtimeControl: RuntimeStepControl
): void {
  if (!(__DEV__ || __TEST_BUILD__)) {
    return;
  }

  const api: BrowserPhysicsTestApi = {
    ready: () => true,
    pauseRuntime: () => runtimeControl.pause(),
    resumeRuntime: () => runtimeControl.resume(),
    resetWorld: (options) => physics.resetWorld(options),
    setArenaPreset: (preset) => physics.setArenaPreset(preset),
    setPhysicsParameters: (partial) => physics.setPhysicsParameters(partial),
    getPhysicsParameters: () => physics.getPhysicsParameters(),
    spawnCar: (options) => physics.spawnCar(options),
    removeCar: (carId) => physics.removeCar(carId),
    getCarIds: () => physics.getCarIds(),
    getCarState: (carId) => physics.getCarState(carId),
    getAllCarStates: () => physics.getAllCarStates(),
    setCarState: (carId, state) => physics.setCarState(carId, state),
    getBallState: () => physics.getBallState(),
    setBallState: (state) => physics.setBallState(state),
    getWorldState: () => physics.getWorldState(),
    setCarInput: (carId, input) => physics.setCarInput(carId, input),
    clearCarInput: (carId) => physics.clearCarInput(carId),
    clearAllInputs: () => physics.clearAllInputs(),
    stepTicks: (count) => physics.stepTicks(count),
    getDiagnostics: () => ({
      tick: physics.getTick(),
      carCount: physics.getCarIds().length
    })
  };

  window.__PHYSICS_TEST__ = api;
}
