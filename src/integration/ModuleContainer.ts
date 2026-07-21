import { NeutralOpponentAi } from "@/ai/NeutralOpponentAi";
import { AssetPipeline } from "@/assets/AssetPipeline";
import type { AudioModule } from "@/audio/AudioModule";
import { NullAudioModule } from "@/audio/NullAudioModule";
import { NullCameraModule } from "@/camera/NullCameraModule";
import type { GameModule } from "@/core/GameModule";
import { MatchFlowController } from "@/game-flow/MatchFlowController";
import { InputControlsModule } from "@/input/InputControlsModule";
import { PhysicsFacade } from "@/physics/PhysicsFacade";
import { NullStadiumModule } from "@/stadium/NullStadiumModule";
import { NullVfxModule } from "@/vfx/NullVfxModule";

/**
 * Created once by GameRuntime. `assets`, `physics`, and `input` are
 * narrowed to their real concrete classes as of Phase 2/3/4. Every other
 * slot besides `audio` is still typed as the generic `GameModule` contract
 * because those modules' concrete interfaces have not been designed yet —
 * narrowing them is each phase's own job (core architecture spec section
 * 13), not something to invent ahead of reading that module's
 * specification. `input` and `gameFlow` are not typed as `GameModule` —
 * `input.initialise()` needs the canvas element and `gameFlow.initialise()`
 * needs the ready `PhysicsFacade`, so GameRuntime calls both explicitly
 * rather than through the generic zero-argument loop (see
 * InputControlsModule's class comment and Phase 7's
 * MatchFlowController.initialise()).
 */
export interface ModuleContainer {
  assets: AssetPipeline;
  physics: PhysicsFacade;
  input: InputControlsModule;
  ai: GameModule;
  gameFlow: MatchFlowController;
  stadium: GameModule;
  camera: GameModule;
  vfx: GameModule;
  audio: AudioModule;
}

export function createNullModuleContainer(): ModuleContainer {
  return {
    assets: new AssetPipeline(),
    physics: new PhysicsFacade(),
    input: new InputControlsModule(),
    ai: new NeutralOpponentAi(),
    gameFlow: new MatchFlowController(),
    stadium: new NullStadiumModule(),
    camera: new NullCameraModule(),
    vfx: new NullVfxModule(),
    audio: new NullAudioModule()
  };
}
