import type { CarId } from "@/physics/PhysicsTypes";
import type { BoostPadId } from "@/physics/boost/BoostPadTypes";
import type { TeamId } from "@/core/TeamTypes";
import type { Vec3Data } from "@/assets/AssetTypes";

export const AUDIO_MODULE_CONTRACT_VERSION = "1.0";

export interface AudioSettings {
  readonly enabled: boolean;
  readonly masterVolume: number;
  readonly effectsVolume: number;
  readonly musicVolume: number;
  readonly musicEnabled: boolean;
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  enabled: true,
  masterVolume: 0.8,
  effectsVolume: 0.85,
  musicVolume: 0.35,
  musicEnabled: true
};

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

export function clampAudioSettings(settings: Partial<AudioSettings>, base: AudioSettings = DEFAULT_AUDIO_SETTINGS): AudioSettings {
  return {
    enabled: settings.enabled ?? base.enabled,
    masterVolume: clamp01(settings.masterVolume ?? base.masterVolume),
    effectsVolume: clamp01(settings.effectsVolume ?? base.effectsVolume),
    musicVolume: clamp01(settings.musicVolume ?? base.musicVolume),
    musicEnabled: settings.musicEnabled ?? base.musicEnabled
  };
}

export interface UiNavigateAudioEvent {
  readonly type: "audio:ui-navigate";
  readonly direction?: "up" | "down" | "left" | "right";
}
export interface UiConfirmAudioEvent {
  readonly type: "audio:ui-confirm";
}
export interface UiCancelAudioEvent {
  readonly type: "audio:ui-cancel";
}
export interface CountdownAudioEvent {
  readonly type: "audio:countdown";
  readonly value: 3 | 2 | 1 | "GO";
}
export interface JumpAudioEvent {
  readonly type: "audio:jump";
  readonly carId: CarId;
}
export interface DodgeAudioEvent {
  readonly type: "audio:dodge";
  readonly carId: CarId;
}
export interface BoostStateAudioEvent {
  readonly type: "audio:boost-state";
  readonly carId: CarId;
  readonly active: boolean;
  readonly boostAmount: number;
}
export interface PowerslideStateAudioEvent {
  readonly type: "audio:powerslide-state";
  readonly carId: CarId;
  readonly active: boolean;
  readonly slipAmount: number;
  readonly speed: number;
}
export interface BallHitAudioEvent {
  readonly type: "audio:ball-hit";
  readonly tick: number;
  readonly intensity: number;
  readonly relativeSpeed: number;
  readonly position?: Vec3Data;
}
export interface CarImpactAudioEvent {
  readonly type: "audio:car-impact";
  readonly tick: number;
  readonly intensity: number;
  readonly carIds: readonly [CarId, CarId];
}
export interface BoostPadPickupAudioEvent {
  readonly type: "audio:boost-pad-pickup";
  readonly padId: BoostPadId;
  readonly padType: "small" | "full";
  readonly nearPlayer: boolean;
}
export interface BoostPadRespawnAudioEvent {
  readonly type: "audio:boost-pad-respawn";
  readonly padId: BoostPadId;
  readonly padType: "small" | "full";
  readonly nearPlayer: boolean;
}
export interface GoalAudioEvent {
  readonly type: "audio:goal";
  readonly scoringTeam: TeamId;
}
export interface OvertimeAudioEvent {
  readonly type: "audio:overtime";
}
export interface MatchEndAudioEvent {
  readonly type: "audio:match-end";
  readonly winner: TeamId | null;
}

/** WS7.E (plan/POLISH_OVERHAUL_PLAN.md): speed-scaled continuous engine hum, player car only. */
export interface EngineStateAudioEvent {
  readonly type: "audio:engine-state";
  readonly carId: CarId;
  readonly active: boolean;
  readonly speed: number;
}

export type AudioGameEvent =
  | UiNavigateAudioEvent
  | UiConfirmAudioEvent
  | UiCancelAudioEvent
  | CountdownAudioEvent
  | JumpAudioEvent
  | DodgeAudioEvent
  | BoostStateAudioEvent
  | PowerslideStateAudioEvent
  | BallHitAudioEvent
  | CarImpactAudioEvent
  | BoostPadPickupAudioEvent
  | BoostPadRespawnAudioEvent
  | GoalAudioEvent
  | OvertimeAudioEvent
  | MatchEndAudioEvent
  | EngineStateAudioEvent;

export interface AudioUpdateFrame {
  readonly frameDeltaSeconds: number;
  readonly matchPaused: boolean;
  readonly windowFocused: boolean;
}

export type MusicState = "silent" | "menu" | "match" | "overtime" | "results";

export interface AudioDiagnostics {
  readonly supported: boolean;
  readonly contextState: "unavailable" | AudioContextState;
  readonly awaitingUserGesture: boolean;
  readonly activeContinuousVoices: readonly string[];
  readonly scheduledOneShots: number;
  readonly cooldownCount: number;
  readonly musicState: MusicState;
  readonly settings: AudioSettings;
  readonly lastError: string | null;
}

/** Retro audio module spec section 2. */
export interface AudioModule {
  initialise(): Promise<void>;
  dispose(): void;

  resumeFromUserGesture(): Promise<void>;
  suspend(): Promise<void>;

  setSettings(settings: AudioSettings): void;
  getSettings(): AudioSettings;

  consumeEvent(event: AudioGameEvent): void;

  update(frame: AudioUpdateFrame): void;

  stopAll(): void;

  getDiagnostics(): AudioDiagnostics;
}
