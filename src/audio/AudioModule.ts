import type { GameModule } from "@/core/GameModule";

export interface AudioSettings {
  readonly masterVolume: number;
  readonly musicVolume: number;
  readonly sfxVolume: number;
  readonly uiVolume: number;
  readonly muted: boolean;
}

export type AudioGameEvent =
  | { readonly kind: "boost-start"; readonly carId: string }
  | { readonly kind: "boost-stop"; readonly carId: string }
  | { readonly kind: "jump"; readonly carId: string }
  | { readonly kind: "dodge"; readonly carId: string }
  | { readonly kind: "car-ball-contact"; readonly carId: string; readonly impactSpeed: number }
  | { readonly kind: "car-car-contact"; readonly carIdA: string; readonly carIdB: string }
  | { readonly kind: "goal"; readonly scoringTeam: "player" | "opponent" }
  | { readonly kind: "ui-select" }
  | { readonly kind: "ui-confirm" }
  | { readonly kind: "match-overtime" };

export interface AudioModule extends GameModule {
  setVolumes(settings: AudioSettings): void;
  consumeEvent(event: AudioGameEvent): void;
  resumeAudioContextFromUserGesture(): Promise<void>;
}
