import { NeutralOpponentAi } from "@/ai/NeutralOpponentAi";
import { NullAssetPipeline } from "@/assets/NullAssetPipeline";
import type { AudioModule } from "@/audio/AudioModule";
import { NullAudioModule } from "@/audio/NullAudioModule";
import { NullCameraModule } from "@/camera/NullCameraModule";
import type { GameModule } from "@/core/GameModule";
import { NullGameFlowController } from "@/game-flow/NullGameFlowController";
import { NullInputModule } from "@/input/NullInputModule";
import { NullPhysicsModule } from "@/physics/NullPhysicsModule";
import { NullStadiumModule } from "@/stadium/NullStadiumModule";
import { NullVfxModule } from "@/vfx/NullVfxModule";

/**
 * Created once by GameRuntime. Every slot besides `audio` is typed as the
 * generic `GameModule` contract in Phase 1 because the concrete module
 * interfaces (PhysicsFacade, InputControlsModule, OpponentAiModule, etc.)
 * have not been designed yet — narrowing these types is each module's own
 * phase's job (core architecture spec section 13), not something to invent
 * ahead of reading that module's specification.
 */
export interface ModuleContainer {
  assets: GameModule;
  physics: GameModule;
  input: GameModule;
  ai: GameModule;
  gameFlow: GameModule;
  stadium: GameModule;
  camera: GameModule;
  vfx: GameModule;
  audio: AudioModule;
}

export function createNullModuleContainer(): ModuleContainer {
  return {
    assets: new NullAssetPipeline(),
    physics: new NullPhysicsModule(),
    input: new NullInputModule(),
    ai: new NeutralOpponentAi(),
    gameFlow: new NullGameFlowController(),
    stadium: new NullStadiumModule(),
    camera: new NullCameraModule(),
    vfx: new NullVfxModule(),
    audio: new NullAudioModule()
  };
}
