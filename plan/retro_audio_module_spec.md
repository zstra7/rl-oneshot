# Retro Audio Module Specification

**Document version:** 1.0  
**Module ID:** `AUDIO`  
**Primary audience:** A Sonnet-level coding LLM implementing the module with minimal human intervention  
**Runtime:** Browser  
**Language:** TypeScript  
**Audio technology:** Web Audio API  
**External audio assets:** None required  
**Music:** Optional procedural loop  
**Primary objective:** Add a small, reliable retro audio layer for gameplay, UI, and match presentation without introducing a large asset pipeline

---

# 0. Instructions to the Implementing LLM

1. Use the Web Audio API.
2. Do not require external audio files.
3. Generate sounds procedurally from oscillators, filtered noise, gain envelopes, and simple modulation.
4. Keep the module small.
5. Do not create a full digital audio workstation architecture.
6. Do not use Tone.js unless a later requirement justifies it.
7. Do not create one `AudioContext` per sound.
8. Create one application-owned `AudioContext`.
9. Resume the context only after a user gesture.
10. Audio must never block gameplay startup.
11. Failure to initialise audio must degrade to silence.
12. Do not call audio APIs directly from physics, UI, AI, or VFX.
13. Consume typed gameplay and UI events.
14. Rate-limit repeated collision sounds.
15. Pool reusable noise buffers.
16. Avoid allocating large buffers during gameplay.
17. Stop or suspend appropriate sounds when paused.
18. Persist only user volume settings if the existing settings service already persists settings.
19. Do not add statistics, unlocks, playlists, radio, or music selection.
20. Add deterministic test hooks where practical.
21. Automated tests should inspect scheduled audio events rather than requiring microphone capture.
22. The module is complete when core actions have readable retro feedback and no event causes audio spam.

---

# 1. Scope

The module provides:

- UI navigation sounds
- UI confirmation and cancellation
- Countdown tones
- Jump sound
- Dodge sound
- Boost sound
- Powerslide/skid sound
- Ball-hit sound
- Car-car impact sound
- Boost-pad pickup sound
- Boost-pad respawn sound
- Goal sound
- Overtime warning
- Match-end sound
- Optional simple procedural menu/gameplay music
- Master, music, and effects volume
- Pause and focus handling

The module does not provide:

- Voice acting
- Commentary
- Licensed music
- Imported sound libraries
- Surround sound
- Reverb zones
- Dynamic music stems
- User playlists
- Audio recording
- Voice chat

---

# 2. Public API

```ts
export const AUDIO_MODULE_CONTRACT_VERSION = "1.0";

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
```

Settings:

```ts
export interface AudioSettings {
  enabled: boolean;

  masterVolume: number;
  effectsVolume: number;
  musicVolume: number;

  musicEnabled: boolean;
}
```

Defaults:

```ts
export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  enabled: true,

  masterVolume: 0.80,
  effectsVolume: 0.85,
  musicVolume: 0.35,

  musicEnabled: true
};
```

All volume values are clamped to:

```text
0–1
```

---

# 3. Module Boundary

The audio module owns:

- `AudioContext`
- Gain-node hierarchy
- Procedural sound synthesis
- Noise buffers
- Sound cooldowns
- Looping boost/skid sound state
- Optional music sequencer
- Audio settings application
- Audio diagnostics

The audio module does not own:

- Deciding whether a collision occurred
- Physics intensity calculation
- Match state
- UI navigation state
- Haptics
- Visual effects
- Settings persistence
- User-gesture detection outside the public resume call

---

# 4. Audio Graph

Use:

```text
AudioContext
├─ EffectsMasterGain
│  ├─ UiBus
│  ├─ VehicleBus
│  ├─ ImpactBus
│  └─ MatchBus
├─ MusicMasterGain
└─ MasterGain
   └─ destination
```

Recommended:

```ts
masterGain.gain.value =
  settings.enabled
    ? settings.masterVolume
    : 0;

effectsGain.gain.value =
  settings.effectsVolume;

musicGain.gain.value =
  settings.musicEnabled
    ? settings.musicVolume
    : 0;
```

Use short gain ramps when changing volume to avoid clicks.

---

# 5. Audio Context Lifecycle

Initialisation:

1. Create one `AudioContext`.
2. Create gain hierarchy.
3. Create reusable noise buffers.
4. Remain suspended if browser policy requires it.
5. Report `awaitingGesture = true`.

On first Play/Confirm gesture:

```ts
await audio.resumeFromUserGesture();
```

If resume fails:

- Log warning.
- Continue game silently.
- Keep retry available on later user gesture.

On blur:

- Stop continuous boost/skid sounds.
- Optionally suspend context.

On pause:

- Stop continuous gameplay loops.
- Keep quiet UI sounds enabled.
- Music may lower volume rather than fully stop.

On disposal:

- Stop all sources.
- Disconnect nodes.
- Close context.

---

# 6. Event Contract

```ts
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
  | MatchEndAudioEvent;
```

Examples:

```ts
export interface BallHitAudioEvent {
  type: "audio:ball-hit";

  tick: number;
  intensity: number;
  relativeSpeed: number;
  position?: Vec3Data;
}
```

```ts
export interface BoostStateAudioEvent {
  type: "audio:boost-state";

  carId: CarId;
  active: boolean;
  boostAmount: number;
}
```

Audio events describe facts.

The audio module decides synthesis details.

---

# 7. Retro Sound Language

Target character:

- Short
- Punchy
- Synthetic
- Arcade-like
- Slightly crunchy
- Easy to distinguish
- Not a direct copy of Rocket League sounds

Use:

- Square waves
- Triangle waves
- Sine sub tones
- Short white-noise bursts
- Pitch sweeps
- Low-pass filters
- Bit-like stepped modulation
- Fast exponential gain envelopes

Avoid:

- Long realistic recordings
- Excessive reverb
- Harsh full-volume noise
- Continuous high-frequency tones
- Sounds longer than their gameplay purpose

---

# 8. Shared Synthesis Helpers

```ts
export interface RetroSynth {
  tone(request: ToneRequest): void;
  noise(request: NoiseRequest): void;
  sweep(request: SweepRequest): void;
  chord(request: ChordRequest): void;
}
```

Tone:

```ts
interface ToneRequest {
  oscillator:
    | "sine"
    | "square"
    | "triangle"
    | "sawtooth";

  frequencyStart: number;
  frequencyEnd?: number;

  durationSeconds: number;
  gain: number;

  attackSeconds: number;
  releaseSeconds: number;

  destination: AudioNode;
}
```

Noise:

```ts
interface NoiseRequest {
  durationSeconds: number;
  gain: number;

  highpassHz?: number;
  lowpassHz?: number;

  destination: AudioNode;
}
```

Reuse one generated mono white-noise buffer of approximately two seconds.

---

# 9. Required Sounds

## 9.1 UI navigate

Character:

- Tiny dry click
- Square wave
- Short pitch variation based on navigation direction

Suggested:

```text
700–900 Hz
25–40 ms
```

Cooldown:

```text
35 ms
```

## 9.2 UI confirm

Character:

- Two-note ascending chirp

Suggested:

```text
520 Hz -> 780 Hz
80–120 ms total
```

## 9.3 UI cancel

Character:

- Two-note descending chirp

Suggested:

```text
480 Hz -> 300 Hz
90–130 ms
```

## 9.4 Countdown

```text
3, 2, 1:
Short square/triangle tone

GO:
Higher and longer layered tone
```

Suggested:

```text
Countdown: 440 Hz
GO: 660 + 990 Hz
```

## 9.5 Jump

Character:

- Short rising triangle sweep
- Small noise click

Suggested:

```text
160 Hz -> 430 Hz
100 ms
```

## 9.6 Dodge

Character:

- Faster, stronger jump-like sweep
- Brief low-frequency body
- Direction-independent initially

Suggested:

```text
120 Hz -> 500 Hz
130 ms
```

## 9.7 Boost

Continuous sound while active:

- Looped or regenerated filtered noise
- Low square/saw undertone
- Pitch depends modestly on speed
- Volume depends on camera distance only if positional audio is later added

On activation:

- Short ignition chirp

On stop:

- 30–60 ms fade

Do not start a new boost source every physics tick.

Maintain one stateful boost voice for the player car.

Opponent boost may be:

- Quieter
- Positional if implemented
- Event-bounded

## 9.8 Powerslide

Continuous filtered noise while sliding.

Intensity uses:

```text
slip amount
speed
grounded state
```

Low-pass or band-pass to resemble synthetic tyre grit.

Fade out quickly when slide stops.

## 9.9 Ball hit

Character:

- Low sine/triangle body
- Short metallic square overtone
- Noise transient

Map intensity:

```text
frequency decreases slightly for stronger hit
gain increases with intensity
duration increases modestly
```

Cooldown:

```text
25–40 ms
```

This prevents multi-contact solver spam.

## 9.10 Car impact

Character:

- Lower and rougher than ball hit
- Noise plus short low tone

Map from collision impulse/intensity.

Cooldown by pair:

```text
60–100 ms
```

## 9.11 Small boost pad pickup

Character:

- Short bright chirp
- One or two notes

Suggested:

```text
900 Hz -> 1200 Hz
70 ms
```

## 9.12 Full boost pad pickup

Character:

- Larger three-note arpeggio
- Slight low body

Suggested:

```text
500 / 750 / 1000 Hz
140–180 ms
```

## 9.13 Pad respawn

Quiet environmental sound.

Only play when:

- Pad is near the player/camera
- Or full pad respawns

Do not play all respawns globally at full volume.

## 9.14 Goal

Character:

- Strong retro fanfare
- Low impact
- Ascending chord/arpeggio
- Noise burst
- Approximately 0.8–1.5 seconds

Scoring team may influence final note or stereo emphasis.

Do not copy a recognisable existing game fanfare.

## 9.15 Overtime

Character:

- Warning pulse
- Rising two-tone signal
- Short enough not to obscure kickoff

## 9.16 Match end

Win:

- Ascending three/four-note phrase

Loss:

- Descending phrase

Draw does not exist after golden goal.

---

# 10. Procedural Music

Music is optional but included as a small system.

Use a simple deterministic sequencer.

Style:

- Retro futuristic
- Dark space arcade
- Minimal synth pulse
- No sampled instruments

## 10.1 Music states

```ts
export type MusicState =
  | "OFF"
  | "MENU"
  | "MATCH"
  | "OVERTIME"
  | "RESULTS_WIN"
  | "RESULTS_LOSS";
```

## 10.2 Menu loop

- Slow arpeggio
- Minor or suspended harmony
- 80–100 BPM
- Sparse
- Low volume

## 10.3 Match loop

- Simple pulse
- 110–125 BPM
- Very low in mix
- Does not react to every action

## 10.4 Overtime

- Faster pulse or raised octave
- Increased urgency
- No major increase in volume

## 10.5 Sequencer

Use look-ahead scheduling.

```ts
interface MusicSequencer {
  setState(state: MusicState): void;
  update(currentTime: number): void;
  stop(): void;
}
```

Recommended scheduling horizon:

```text
100–200 ms
```

Do not schedule an entire ten-minute match at once.

Use deterministic pattern arrays.

---

# 11. Stereo and Positional Audio

Initial implementation may use stereo buses only.

Optional lightweight panning:

```ts
StereoPannerNode
```

For opponent impacts and pad sounds:

```text
pan = clamp(screenRelativeX, -1, 1)
```

Do not require full `PannerNode` 3D spatialisation initially.

Player boost remains centred.

Goal sounds may pan slightly toward the scoring goal.

---

# 12. Intensity Mapping

Clamp every incoming intensity:

```ts
const intensity =
  clamp(event.intensity, 0, 1);
```

Use curves:

```ts
gain =
  minGain +
  intensity * intensity *
  (maxGain - minGain);
```

Do not map raw physics impulse directly to gain.

Frequency and duration ranges must be bounded.

---

# 13. Rate Limiting

Store cooldown keys:

```ts
type AudioCooldownKey =
  | `ball-hit`
  | `car-impact:${string}`
  | `ui-navigate`
  | `pad-respawn:${BoostPadId}`;
```

```ts
interface AudioCooldownRegistry {
  canPlay(
    key: AudioCooldownKey,
    now: number,
    cooldownSeconds: number
  ): boolean;
}
```

Also merge repeated impacts within a short interval by keeping the strongest event.

---

# 14. Continuous Voices

Stateful voices:

```ts
interface ContinuousAudioVoice {
  start(): void;
  setIntensity(value: number): void;
  stop(fadeSeconds?: number): void;
  dispose(): void;
}
```

Required voices:

- Player boost
- Opponent boost, optional
- Player powerslide
- Procedural music

Do not restart voices every frame.

---

# 15. Pause and Match-State Integration

```text
MAIN_MENU:
Menu music
UI sounds

COUNTDOWN:
Countdown sounds
Match music may fade in

PLAYING:
Gameplay effects
Match music

GOAL_CELEBRATION:
Goal sound
Gameplay loops stopped
Music briefly ducked

PAUSED:
Gameplay loops stopped
Music reduced to 30–50%
UI sounds active

OVERTIME:
Overtime warning
Overtime music state

RESULTS:
Win/loss phrase
Results music
```

---

# 16. Audio Ducking

Use temporary bus gain automation.

Examples:

Goal:

```text
Music bus -> 30% for 1 second
```

Overtime announcement:

```text
Music bus -> 50% for 0.5 seconds
```

Pause:

```text
Effects loops -> stop
Music -> 40%
```

Do not create a complex compressor sidechain system.

---

# 17. Integration With Core Runtime

Core creates:

```ts
audio: AudioModule
```

Until initialisation succeeds:

```ts
audio = new NullAudioModule();
```

After real module is available:

```ts
audio = new RetroAudioModule();
```

The runtime forwards typed events through one integration binding.

Do not let modules import `RetroAudioModule` directly.

---

# 18. Integration Events

Forward:

```text
Input/UI
-> navigate, confirm, cancel

Game flow
-> countdown, GO, goal, overtime, match end

Physics
-> jump, dodge, boost state, slide state,
   ball hit, car hit, pad pickup, pad respawn

Application
-> pause, resume, focus loss
```

Physics events should be converted into normalised audio events by an adapter.

---

# 19. Settings UI

Add a small Audio section:

```text
Audio: On / Off
Master Volume
Effects Volume
Music Volume
Music: On / Off
```

Sliders:

```text
0–100
```

Internally convert to:

```text
0–1
```

No advanced EQ or device selection.

---

# 20. Diagnostics

```ts
export interface AudioDiagnostics {
  supported: boolean;
  contextState:
    | "unavailable"
    | AudioContextState;

  awaitingUserGesture: boolean;

  activeContinuousVoices: string[];

  scheduledOneShots: number;

  cooldownCount: number;

  musicState: MusicState;

  settings: AudioSettings;

  lastError: string | null;
}
```

Debug overlay may show:

- Context state
- Master/effects/music gain
- Active voices
- Last sound
- Sounds suppressed by cooldown
- Music scheduler horizon

---

# 21. Browser Test API

```ts
declare global {
  interface Window {
    __AUDIO_TEST__?: BrowserAudioTestApi;
  }
}
```

```ts
export interface BrowserAudioTestApi {
  ready(): boolean;

  resume(): Promise<void>;
  suspend(): Promise<void>;

  emit(event: AudioGameEvent): void;

  setSettings(
    settings: Partial<AudioSettings>
  ): void;

  getDiagnostics(): AudioDiagnostics;

  getScheduleLog(): AudioScheduleLogEntry[];

  clearScheduleLog(): void;

  advanceVirtualTime(seconds: number): void;

  stopAll(): void;
}
```

Use a test scheduler abstraction so automated tests can inspect scheduled tones without depending on audible output.

---

# 22. Automated Tests

## Initialisation

- Unsupported Web Audio creates silent module.
- Suspended context does not crash.
- Resume from user gesture succeeds or reports failure safely.
- One context only.

## Settings

- Master mute silences all buses.
- Effects volume affects effects only.
- Music volume affects music only.
- Music toggle stops music.
- Values clamp to 0–1.

## UI sounds

- Navigate schedules one short sound.
- Rapid navigate events respect cooldown.
- Confirm and cancel use distinct patterns.

## Countdown

- 3/2/1 schedule matching tones.
- GO schedules stronger tone.
- No duplicate countdown event.

## Gameplay

- Jump schedules jump sound.
- Dodge differs from jump.
- Boost activation starts one continuous voice.
- Repeated active events do not create more voices.
- Boost stop fades and disposes voice.
- Powerslide intensity updates one voice.

## Impacts

- Weak and strong ball hits map to bounded values.
- Rapid duplicate hits are rate-limited.
- Strongest event wins within merge window.
- Car impact uses separate sound family.

## Pads

- Small and full pickup sounds differ.
- Respawn sound is suppressed when too distant.
- Full-pad respawn may be audible nearby.

## Match

- Goal ducks music.
- Overtime changes music state.
- Pause stops continuous gameplay voices.
- Resume does not restart boost unless a fresh active event arrives.
- Match end stops gameplay loops.

## Disposal

- All voices stopped.
- Nodes disconnected.
- Context closed.
- No scheduling after disposal.

---

# 23. Performance

Targets:

```text
Audio event processing < 0.10 ms average
No large allocation per event
One shared noise buffer
Bounded active voices
Bounded scheduler queue
```

Maximum suggested simultaneous voices:

```text
One-shot voices: 16–24
Continuous voices: 4
Music voices: 4–8
```

If limit exceeded:

- Drop lowest-priority/quietest sound
- Never drop goal or countdown
- Prefer dropping distant pad respawns

---

# 24. Common Failure Modes

## No sound in browser

Check:

- Context suspended
- Resume not called from user gesture
- Master gain zero
- Browser support
- Context closed accidentally

## Repeated harsh collision noise

Check:

- No cooldown
- Solver contact events forwarded every tick
- Intensity not normalised
- Noise gain too high

## Boost clicks on start/stop

Check:

- Gain ramps missing
- Oscillator stopped instantly
- Voice recreated every event

## Music drifts

Check:

- Scheduling with `setInterval` only
- No audio-clock look-ahead
- Entire pattern scheduled from wall clock

## Pause still plays skid/boost

Check:

- Continuous voices not explicitly stopped
- Match state not forwarded
- Old active state restored without fresh event

## Audio breaks game startup

Check:

- Audio initialisation awaited as fatal dependency
- No `NullAudioModule`
- Resume rejection uncaught

---

# 25. Recommended Source Structure

```text
src/audio/
├─ index.ts
├─ AudioModule.ts
├─ AudioTypes.ts
├─ RetroAudioModule.ts
├─ NullAudioModule.ts
├─ AudioSettings.ts
├─ AudioEventAdapter.ts
├─ AudioCooldownRegistry.ts
├─ AudioDiagnostics.ts
│
├─ graph/
│  ├─ AudioGraph.ts
│  └─ AudioBus.ts
│
├─ synth/
│  ├─ RetroSynth.ts
│  ├─ ToneVoice.ts
│  ├─ NoiseVoice.ts
│  ├─ ContinuousVoice.ts
│  └─ NoiseBufferFactory.ts
│
├─ sounds/
│  ├─ UiSounds.ts
│  ├─ VehicleSounds.ts
│  ├─ ImpactSounds.ts
│  ├─ BoostPadSounds.ts
│  └─ MatchSounds.ts
│
├─ music/
│  ├─ MusicSequencer.ts
│  ├─ MusicPatterns.ts
│  └─ MusicState.ts
│
└─ testing/
   ├─ BrowserAudioTestApi.ts
   ├─ VirtualAudioScheduler.ts
   └─ AudioScheduleLog.ts
```

---

# 26. Phased Implementation

## Phase 1 — Audio graph

- Audio context
- Gain buses
- Settings
- Null fallback
- Resume/suspend
- Test scheduler

## Phase 2 — UI and match sounds

- Navigate
- Confirm/cancel
- Countdown
- Goal
- Overtime
- Match end

## Phase 3 — Gameplay sounds

- Jump
- Dodge
- Ball hit
- Car impact
- Pad pickup
- Pad respawn

## Phase 4 — Continuous sounds

- Boost
- Powerslide
- State cleanup
- Pause handling

## Phase 5 — Minimal music

- Menu loop
- Match loop
- Overtime variation
- Results phrase
- Ducking

## Phase 6 — Calibration

- Volume balance
- Cooldowns
- Intensity mapping
- Voice limits
- Full-match test

---

# 27. Definition of Done

- [ ] Web Audio API
- [ ] One AudioContext
- [ ] Null fallback
- [ ] Resume from user gesture
- [ ] Master/effects/music buses
- [ ] UI navigation
- [ ] Confirm/cancel
- [ ] Countdown and GO
- [ ] Jump
- [ ] Dodge
- [ ] Boost loop
- [ ] Powerslide loop
- [ ] Ball hit
- [ ] Car impact
- [ ] Small/full pad pickup
- [ ] Pad respawn
- [ ] Goal
- [ ] Overtime
- [ ] Match end
- [ ] Optional procedural music
- [ ] Pause/focus handling
- [ ] Rate limiting
- [ ] Voice limits
- [ ] Diagnostics
- [ ] Browser test API
- [ ] Automated tests
- [ ] No external sound files required

---

# 28. Final Architecture

```text
Physics / Input / Game Flow events
                |
                v
        AudioEventAdapter
                |
                v
         RetroAudioModule
        ├─ Audio graph
        ├─ Synth helpers
        ├─ Cooldowns
        ├─ Continuous voices
        ├─ One-shot sounds
        └─ Music sequencer
                |
                v
         Web Audio API
```

The intended result is a small arcade audio layer that makes the game feel complete without requiring a sound-asset production pipeline.
