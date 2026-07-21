import { NeutralOpponentAi } from "@/ai/NeutralOpponentAi";
import { AssetPipeline } from "@/assets/AssetPipeline";
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
 * Created once by GameRuntime. `assets` is narrowed to the real
 * `AssetPipeline` as of Phase 2. Every other slot besides `audio` is still
 * typed as the generic `GameModule` contract because those modules'
 * concrete interfaces have not been designed yet — narrowing them is each
 * phase's own job (core architecture spec section 13), not something to
 * invent ahead of reading that module's specification.
 */
export interface ModuleContainer {
  assets: AssetPipeline;
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
    assets: new AssetPipeline(),
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
