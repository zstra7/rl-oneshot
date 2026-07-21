# Predictive Human-Like Opponent AI Module Specification

**Document version:** 1.2  
**Module ID:** `OPPONENT_AI`  
**Primary audience:** A Sonnet-level coding LLM implementing the module with minimal human intervention  
**Runtime:** Browser, local 1v1  
**Language:** TypeScript  
**Physics dependency:** `PHYSICS_MODULE_CONTRACT_VERSION = "2.0"`  
**Visual/game-flow dependency:** `VISUAL_GAMEFLOW_CONTRACT_VERSION = "1.0"`  
**Automated browser testing:** Playwright Test  
**Opponent style:** Fair and human-like  
**Difficulty levels:** Easy, Medium, Hard  
**Control style:** Predictive planning  
**Supported controlled entity:** `car-opponent`  
**Primary output:** Normalised `CarInput` only  
**Scope:** Perception, prediction, tactical decisions, intercept planning, boost-pad routing and denial, driving control, shooting, defending, recoveries, kickoffs, boost usage, difficulty shaping, debugging, testing, and iterative calibration

---

# 0. Instructions to the Implementing LLM

Read this entire document before implementing the AI.

The opponent must feel like a competent human player, not an omniscient physics exploit.

Follow these rules:

1. The AI controls the opponent only by returning standard `CarInput`.
2. The AI must never apply impulses, forces, teleports, velocity writes, or rigid-body changes directly.
3. The AI must never modify the ball.
4. The AI must never call private physics controller methods.
5. The AI must not branch on hidden Rapier internals unavailable to a human player.
6. The AI may read public immutable observations and prediction data exposed by approved interfaces.
7. The AI must operate while the human uses the same physics, controls, arena, and resources.
8. Difficulty must come from believable limitations and decision quality, not hidden stat advantages.
9. Easy, Medium, and Hard must use the same architecture.
10. Do not create three unrelated scripted bots.
11. The AI must support deterministic seeded behaviour for automated tests.
12. Do not use machine learning, neural networks, external AI APIs, or model inference.
13. Do not use expensive full-world brute-force search every frame.
14. Separate tactical planning, trajectory planning, and low-level control.
15. Do not recalculate strategic decisions at 120 Hz.
16. Do not let noisy perception create unstable frame-to-frame control.
17. Use hysteresis and commitment windows to avoid indecision.
18. The AI must recover after collisions, misses, wall contacts, and awkward landings.
19. The AI must understand when not to attack.
20. The AI must defend its own goal.
21. The AI must avoid driving directly into its own goal when possible.
22. The AI must recognise and contest dangerous shots.
23. The AI must make occasional believable mistakes according to difficulty.
24. The AI must not intentionally own-goal except through plausible error.
25. The AI must not perfectly react on the same tick as an unexpected event.
26. The AI must not know future human inputs.
27. The AI must not use test-only APIs during runtime.
28. The AI must expose detailed debug decisions.
29. Every major behaviour must have Playwright scenarios.
30. Record deliberate deviations in `docs/opponent-ai-deviations.md`.
31. Record tuning changes in `docs/ai-calibration-log.md`.
32. Preserve passing regression scenarios while tuning.
33. Prefer a robust ground-based opponent before advanced aerial behaviour.
34. The initial Hard AI may use limited aerials; Easy and Medium should remain mostly grounded.
35. The AI is complete only when it produces enjoyable 1v1 matches, not merely when unit tests pass.

---

# 1. Product Goal

Create a fair, readable, human-like computer opponent for a compact 1v1 car-football game.

The AI should:

- Predict where the ball will be.
- Choose useful intercepts rather than chasing the ball's current position.
- Understand which goal it attacks and which goal it defends.
- Switch between attack, defend, shadow, retreat, challenge, recover, and kickoff behaviour.
- Turn, brake, powerslide, jump, dodge, boost, and recover through the same input system as the player.
- Make difficulty-appropriate mistakes.
- Avoid robotic instant reactions.
- Produce matches that feel dynamic rather than scripted.

The intended player experience:

```text
Easy:
Readable, forgiving, often late, makes obvious mistakes,
but still plays the game and can score.

Medium:
Competent arcade opponent, predicts basic bounces,
rotates between attack and defence, punishes large mistakes.

Hard:
Strong predictive opponent, quick challenges, better shooting,
limited aerial capability, good recoveries, but still visibly human-like.
```

The AI should not be unbeatable.

A strong player should be able to exploit:

- Overcommitment
- Limited boost
- Recovery time
- Reaction delay
- Imperfect shot choice
- Prediction uncertainty
- Defensive positioning mistakes
- Difficulty-specific execution errors

---

# 2. Module Boundary

## 2.1 AI module owns

- Opponent observation processing
- Delayed perception
- Ball trajectory interpretation
- Tactical state selection
- Intercept selection
- Shot target selection
- Defensive target selection
- Kickoff decision-making
- Recovery planning
- Boost-use decisions
- Boost-pad selection, routing, collection timing, respawn awareness, and denial decisions
- Jump and dodge timing decisions
- Low-level steering and throttle control
- Difficulty parameters
- Human-like noise and mistakes
- AI debugging and telemetry
- AI scenario definitions
- AI performance metrics

## 2.2 AI module does not own

- Car physics
- Ball physics
- Arena collision
- Match clock
- Scoring
- Goal validity
- UI
- Camera
- Audio
- VFX
- Stadium render geometry
- Spawn execution
- Physics resets
- Match-state transitions

## 2.3 Physics contract

AI reads:

```ts
CarObservation
BallObservation
PhysicsArenaMetadata
PhysicsPredictionService
```

AI writes:

```ts
CarInput
```

## 2.4 Game-flow contract

Game flow tells AI:

```ts
interface AiMatchContext {
  matchState: MatchState;
  controlledCarId: CarId;
  opponentCarId: CarId;
  attackingGoal: GoalMetadata;
  defendingGoal: GoalMetadata;
  regulationTimeRemaining: number;
  overtimeElapsed: number;
  scoreFor: number;
  scoreAgainst: number;
}
```

AI must output neutral input when game flow disables control.

---

# 3. Required Public API

```ts
export type AiDifficulty = "easy" | "medium" | "hard";

export interface OpponentAiModule {
  initialise(context: OpponentAiInitialisation): void;
  dispose(): void;

  setDifficulty(difficulty: AiDifficulty): void;
  getDifficulty(): AiDifficulty;

  resetForKickoff(context: AiKickoffResetContext): void;
  resetForMatch(context: AiMatchResetContext): void;

  update(context: AiUpdateContext): CarInput;

  getDebugState(): AiDebugState;
  getTelemetry(): readonly AiTelemetryFrame[];
  clearTelemetry(): void;

  setEnabled(enabled: boolean): void;
  setSeed(seed: number): void;
}
```

Initialisation:

```ts
export interface OpponentAiInitialisation {
  controlledCarId: CarId;
  humanCarId: CarId;
  arena: AiArenaDescription;
  prediction: PhysicsPredictionService;
  difficulty: AiDifficulty;
  seed: number;
}
```

Update:

```ts
export interface AiUpdateContext {
  tick: number;
  simulationTime: number;
  physicsDt: number;

  match: AiMatchContext;

  controlledCar: CarObservation;
  humanCar: CarObservation;
  ball: BallObservation;

  recentPhysicsEvents: readonly PhysicsEvent[];
}
```

---

# 4. Core Architectural Principle

Use a layered controller:

```text
Public observations
       |
Delayed/noisy perception
       |
Ball and car prediction
       |
Tactical planner
       |
Action planner
       |
Maneuver controller
       |
Input smoothing and limits
       |
CarInput
```

Recommended classes:

```text
OpponentAiModule
├─ AiPerception
├─ AiWorldModel
├─ BallPredictionInterpreter
├─ TacticalPlanner
├─ InterceptPlanner
├─ ShotPlanner
├─ DefensivePlanner
├─ KickoffPlanner
├─ RecoveryPlanner
├─ ManeuverController
├─ GroundDriveController
├─ AerialDriveController
├─ JumpDodgeController
├─ HumanisationModel
└─ AiTelemetryRecorder
```

Do not combine all logic into one `updateAi()` function.

---

# 5. AI Update Rates

Physics runs at 120 Hz.

AI layers use different rates.

```ts
export interface AiUpdateRates {
  inputHz: number;
  controlHz: number;
  tacticalHz: number;
  predictionHz: number;
}
```

Recommended defaults:

| Difficulty | Input | Low-level control | Tactical plan | Prediction refresh |
|---|---:|---:|---:|---:|
| Easy | 60 Hz | 30 Hz | 4 Hz | 4 Hz |
| Medium | 120 Hz | 60 Hz | 8 Hz | 8 Hz |
| Hard | 120 Hz | 120 Hz | 12 Hz | 12 Hz |

The module may be called every physics tick.

Internally:

- Return held/smoothed input between update intervals.
- Do not recalculate tactical state every tick.
- Immediately process safety-critical events such as kickoff reset or control disable.

---

# 6. Fairness and Human-Like Constraints

## 6.1 No hidden advantages

AI uses:

- Same car properties
- Same boost capacity
- Same speed caps
- Same collision rules
- Same jump/dodge windows
- Same arena
- Same kickoff positions

AI does not receive:

- Future human input
- Hidden physics solver state
- Direct collision manifold access beyond public observations
- Infinite boost
- Stronger hits
- Shorter cooldowns
- Faster car
- Perfect teleport recovery

## 6.2 Reaction delay

Unexpected events enter perception after a difficulty-specific delay.

Examples:

- Human changes direction.
- Ball receives an unpredictable collision.
- Ball bounces differently than predicted.
- AI is bumped.
- Goal threat changes.

Recommended:

| Difficulty | Base reaction delay |
|---|---:|
| Easy | 280 ms |
| Medium | 150 ms |
| Hard | 75 ms |

Allow small deterministic variation.

## 6.3 Perception history

Maintain a ring buffer of observations.

```ts
interface PerceptionSample {
  tick: number;
  simulationTime: number;
  controlledCar: CarObservation;
  humanCar: CarObservation;
  ball: BallObservation;
}
```

Choose the sample nearest:

```text
currentTime - reactionDelay
```

Own-car immediate state may use a shorter delay than external ball/human state to prevent unusable controls.

Recommended own-car delay:

| Difficulty | Own-state delay |
|---|---:|
| Easy | 80 ms |
| Medium | 35 ms |
| Hard | 0–15 ms |

## 6.4 Imperfect perception

Add bounded deterministic noise after delay.

Noise applies to planning observations, not low-level orientation feedback.

Potential noise:

- Ball position
- Ball velocity
- Human velocity
- Predicted bounce timing

Do not add high-frequency white noise every tick.

Sample noise at perception/prediction refresh and smoothly hold/interpolate it.

## 6.5 Commitment

Once the AI commits to an action, it should not constantly reconsider.

Examples:

- Challenge commitment
- Shot approach
- Retreat
- Kickoff
- Jump
- Dodge

Use:

```ts
minimumCommitmentTime
maximumCommitmentTime
abortConditions
```

Emergency goal threats may override commitment.

---

# 7. Difficulty Configuration

Use one typed parameter set.

```ts
export interface AiDifficultyParameters {
  reactionDelaySeconds: number;
  ownStateDelaySeconds: number;

  perceptionPositionNoise: number;
  perceptionVelocityNoise: number;
  predictionTimeNoise: number;

  tacticalHz: number;
  predictionHz: number;
  controlHz: number;

  planningHorizonSeconds: number;
  candidateCount: number;

  shotAccuracy: number;
  shotPowerPreference: number;
  defensiveUrgency: number;
  challengeAggression: number;

  boostConservation: number;
  maximumBoostBurstSeconds: number;
  boostPadAwarenessRadius: number;
  boostPadDetourToleranceSeconds: number;
  boostPadRespawnPlanningSeconds: number;
  boostDenialAggression: number;
  boostRouteCandidateCount: number;

  powerslideSkill: number;
  dodgeSkill: number;
  aerialSkill: number;
  recoverySkill: number;

  decisionTemperature: number;
  mistakeFrequency: number;
  commitmentSeconds: number;

  maximumAerialHeight: number;
  maximumAerialTime: number;

  kickoffProfile: AiKickoffProfile;
}
```

Recommended starting values:

```ts
export const EASY_AI: AiDifficultyParameters = {
  reactionDelaySeconds: 0.28,
  ownStateDelaySeconds: 0.08,

  perceptionPositionNoise: 0.65,
  perceptionVelocityNoise: 0.80,
  predictionTimeNoise: 0.18,

  tacticalHz: 4,
  predictionHz: 4,
  controlHz: 30,

  planningHorizonSeconds: 1.8,
  candidateCount: 8,

  shotAccuracy: 0.35,
  shotPowerPreference: 0.45,
  defensiveUrgency: 0.55,
  challengeAggression: 0.38,

  boostConservation: 0.72,
  maximumBoostBurstSeconds: 0.45,
  boostPadAwarenessRadius: 22,
  boostPadDetourToleranceSeconds: 0.45,
  boostPadRespawnPlanningSeconds: 0.25,
  boostDenialAggression: 0.08,
  boostRouteCandidateCount: 4,

  powerslideSkill: 0.35,
  dodgeSkill: 0.20,
  aerialSkill: 0.00,
  recoverySkill: 0.35,

  decisionTemperature: 0.30,
  mistakeFrequency: 0.18,
  commitmentSeconds: 0.55,

  maximumAerialHeight: 0,
  maximumAerialTime: 0,

  kickoffProfile: "simple"
};

export const MEDIUM_AI: AiDifficultyParameters = {
  reactionDelaySeconds: 0.15,
  ownStateDelaySeconds: 0.035,

  perceptionPositionNoise: 0.30,
  perceptionVelocityNoise: 0.35,
  predictionTimeNoise: 0.09,

  tacticalHz: 8,
  predictionHz: 8,
  controlHz: 60,

  planningHorizonSeconds: 2.6,
  candidateCount: 16,

  shotAccuracy: 0.62,
  shotPowerPreference: 0.62,
  defensiveUrgency: 0.72,
  challengeAggression: 0.58,

  boostConservation: 0.60,
  maximumBoostBurstSeconds: 0.75,
  boostPadAwarenessRadius: 60,
  boostPadDetourToleranceSeconds: 0.80,
  boostPadRespawnPlanningSeconds: 1.25,
  boostDenialAggression: 0.28,
  boostRouteCandidateCount: 8,

  powerslideSkill: 0.65,
  dodgeSkill: 0.52,
  aerialSkill: 0.15,
  recoverySkill: 0.68,

  decisionTemperature: 0.18,
  mistakeFrequency: 0.08,
  commitmentSeconds: 0.42,

  maximumAerialHeight: 3.0,
  maximumAerialTime: 0.65,

  kickoffProfile: "normal"
};

export const HARD_AI: AiDifficultyParameters = {
  reactionDelaySeconds: 0.075,
  ownStateDelaySeconds: 0.01,

  perceptionPositionNoise: 0.12,
  perceptionVelocityNoise: 0.16,
  predictionTimeNoise: 0.035,

  tacticalHz: 12,
  predictionHz: 12,
  controlHz: 120,

  planningHorizonSeconds: 3.5,
  candidateCount: 28,

  shotAccuracy: 0.82,
  shotPowerPreference: 0.75,
  defensiveUrgency: 0.88,
  challengeAggression: 0.72,

  boostConservation: 0.48,
  maximumBoostBurstSeconds: 1.10,
  boostPadAwarenessRadius: 120,
  boostPadDetourToleranceSeconds: 1.15,
  boostPadRespawnPlanningSeconds: 2.50,
  boostDenialAggression: 0.48,
  boostRouteCandidateCount: 16,

  powerslideSkill: 0.88,
  dodgeSkill: 0.78,
  aerialSkill: 0.48,
  recoverySkill: 0.88,

  decisionTemperature: 0.10,
  mistakeFrequency: 0.035,
  commitmentSeconds: 0.32,

  maximumAerialHeight: 6.0,
  maximumAerialTime: 1.15,

  kickoffProfile: "fast"
};
```

These values require calibration.

---

# 8. Randomness

Use a seeded PRNG.

```ts
interface AiRandom {
  nextFloat(): number;
  range(min: number, max: number): number;
  chance(probability: number): boolean;
}
```

Rules:

- Same seed plus same observations produces same decisions.
- Do not use `Math.random()` inside AI.
- Store random seed in failed test output.
- Randomness selects among plausible actions.
- Randomness does not create impossible inputs.
- Mistakes are bounded and recoverable.

---

# 9. Observation Model

## 9.1 Car observation

AI requires:

```ts
export interface CarObservation {
  id: CarId;

  position: Vec3Data;
  rotation: QuaternionData;

  linearVelocity: Vec3Data;
  angularVelocity: Vec3Data;

  forward: Vec3Data;
  right: Vec3Data;
  up: Vec3Data;

  speed: number;
  forwardSpeed: number;

  grounded: boolean;
  wheelContactCount: number;

  boostAmount: number;

  firstJumpUsed: boolean;
  secondJumpAvailable: boolean;
  dodgeState: string;
}
```

## 9.2 Ball observation

```ts
export interface BallObservation {
  position: Vec3Data;
  linearVelocity: Vec3Data;
  angularVelocity: Vec3Data;
  speed: number;
  grounded: boolean;
}
```

## 9.3 Arena description

```ts
export interface AiArenaDescription {
  fieldBounds: {
    halfWidth: number;
    halfLength: number;
    interiorHeight: number;
  };

  goals: {
    player: AiGoalDescription;
    opponent: AiGoalDescription;
  };

  surfaces: readonly AiSurfaceDescription[];

  boostPads: readonly AiBoostPadObservation[];
}
```

Boost pads are mandatory in the standard arena.

Shared defaults:

```text
Kickoff boost: 33
Small pad: +12 boost, 4-second respawn
Full pad: fill to 100, 10-second respawn
Standard layout: 12 small and 4 full pads
```

The AI receives public pad observations only. It does not import stadium internals or physics runtime objects.

```ts
export interface AiBoostPadObservation {
  id: BoostPadId;
  type: "small" | "full";

  position: Vec3Data;

  active: boolean;
  respawnSecondsRemaining: number;

  pickupAmount: number;
}
```

Pad state is subject to the same perception delay and uncertainty rules as other external world facts.

The AI may know the standard deterministic respawn duration after observing a pickup. It must not react to a human pickup before that event reaches its delayed perception model.

---

# 10. Physics Prediction Service

## 10.1 Purpose

Predict future ball states without changing live physics.

Required contract:

```ts
export interface PhysicsPredictionService {
  predictBall(
    request: BallPredictionRequest
  ): BallPredictionResult;

  estimateCarReachability(
    request: CarReachabilityRequest
  ): CarReachabilityResult;
}
```

## 10.2 Ball prediction

```ts
export interface BallPredictionRequest {
  initialState: BallObservation;
  horizonSeconds: number;
  sampleIntervalSeconds: number;
  arenaId: string;
}
```

```ts
export interface BallPredictionSample {
  time: number;
  position: Vec3Data;
  velocity: Vec3Data;
  angularVelocity: Vec3Data;

  event?: "floor-bounce" | "wall-bounce" | "ceiling-bounce";
}
```

```ts
export interface BallPredictionResult {
  sourceTick: number;
  samples: readonly BallPredictionSample[];
  confidence: number;
}
```

## 10.3 Prediction implementation options

Preferred:

- Reuse the physics module's ball-world simulation in an isolated prediction world.
- Clone only the ball and fixed arena collision.
- Do not clone cars.
- Step at 120 Hz.
- Sample at requested interval.
- Pool prediction world resources.

Fallback:

- Analytical gravity plus swept collision approximation.
- Must share ball bounce constants with physics.

Do not simulate prediction in the live world and restore transforms.

## 10.4 Prediction invalidation

Refresh prediction when:

- Prediction update interval elapses.
- Ball receives a car hit.
- Ball receives a strong wall hit.
- Ball velocity changes beyond threshold.
- Match resets.

## 10.5 Prediction uncertainty

AI applies difficulty-specific timing/position uncertainty after physics prediction.

Physics prediction itself should remain accurate and deterministic.

---

# 11. Car Reachability Estimation

The AI needs to know whether it can reach a future ball sample.

Do not run a full Rapier clone for every candidate initially.

Use a calibrated approximate model. Use a simplified kinematic heuristic (e.g., distance divided by current speed, plus a flat turn-penalty constant). Never write iterative trajectory solvers, complex quadratic equations, or recursive loops to find exact intercept times, as this will hang the main thread and crash the browser at 120Hz.

Inputs:

```ts
export interface CarReachabilityRequest {
  car: CarObservation;
  targetPosition: Vec3Data;
  targetTime: number;

  allowBoost: boolean;
  allowJump: boolean;
  allowDodge: boolean;
}
```

Output:

```ts
export interface CarReachabilityResult {
  reachable: boolean;
  estimatedArrivalTime: number;
  estimatedArrivalSpeed: number;
  estimatedBoostCost: number;
  requiredTurnAngle: number;
  maneuverClass:
    | "drive"
    | "powerslide-turn"
    | "jump"
    | "dodge"
    | "aerial"
    | "unreachable";
  confidence: number;
}
```

Approximate arrival:

```text
turn time
+ acceleration time
+ distance travel time
+ jump/aerial setup time
```

Calibrate using Playwright-measured car scenarios from the physics module.

Store lookup tables for:

- Time to travel distance from rest
- Time to travel distance from current speed
- Turn time by speed and angle
- Powerslide turn time
- Jump reach height over time
- Aerial reach envelope
- Dodge acceleration gain

---

# 12. AI World Model

Build derived facts from delayed observations and predictions.

```ts
export interface AiWorldModel {
  controlledCar: AiCarState;
  humanCar: AiCarState;
  ball: AiBallState;

  ballPrediction: BallPredictionResult;
  boostPads: readonly AiBoostPadObservation[];
  selectedBoostPad: AiBoostPadObservation | null;

  ownGoal: AiGoalDescription;
  targetGoal: AiGoalDescription;

  ballThreat: BallThreatAssessment;
  possession: PossessionAssessment;

  ownIntercept: InterceptEstimate | null;
  humanIntercept: InterceptEstimate | null;

  scoreContext: ScoreContext;
}
```

Derived facts:

- Ball moving toward own goal
- Ball moving toward opponent goal
- Ball central or near wall
- Ball height
- Ball time to own goal plane
- AI time to intercept
- Human time to intercept
- Who is goal-side
- Who is closer
- Who has a better approach angle
- Whether AI is facing useful direction
- Whether AI is airborne or recovering
- Whether boost is scarce
- Whether current action is still valid

---

# 13. Possession Estimation

Possession is not just nearest-car distance.

Calculate:

```ts
interface PossessionAssessment {
  likelyOwner: "ai" | "human" | "neutral";
  aiControlScore: number;
  humanControlScore: number;
  confidence: number;
}
```

Factors:

- Estimated intercept time
- Approach angle
- Current velocity toward ball
- Whether car is goal-side
- Ball controllability
- Ball height
- Boost
- Recovery state
- Opponent challenge proximity

Example score:

```text
control =
  - interceptTimeWeight * interceptTime
  + approachQualityWeight * approachQuality
  + goalSideWeight * goalSide
  + velocityAlignmentWeight * alignment
  + boostWeight * availableBoost
  - recoveryPenalty
```

Use hysteresis to prevent possession flicker.

---

# 14. Threat Assessment

```ts
interface BallThreatAssessment {
  level: "none" | "low" | "medium" | "high" | "critical";
  timeToGoalPlane: number | null;
  predictedGoalEntry: Vec3Data | null;
  requiresImmediateChallenge: boolean;
  requiresGoalLineDefence: boolean;
  confidence: number;
}
```

Threat factors:

- Predicted trajectory enters own goal volume
- Time until goal
- Ball speed
- Ball height
- AI intercept feasibility
- Human proximity and orientation
- AI current position
- Ball behind AI
- Open goal

Critical threat overrides most commitments.

---

# 15. Tactical States

```ts
export type AiTacticalState =
  | "DISABLED"
  | "KICKOFF"
  | "RECOVER"
  | "EMERGENCY_SAVE"
  | "GOAL_LINE_DEFEND"
  | "SHADOW_DEFEND"
  | "CHALLENGE"
  | "RETREAT"
  | "INTERCEPT"
  | "SHOOT"
  | "CONTROL_TOUCH"
  | "COLLECT_BOOST"
  | "CLEAR"
  | "WAIT"
  | "CELEBRATION_IDLE";
```

Priority:

```text
Disabled
-> Recovery
-> Emergency save
-> Kickoff
-> Goal-line defence
-> Clear
-> Challenge
-> Shoot
-> Intercept
-> Shadow defend
-> Retreat
-> Collect boost
-> Control touch
-> Wait
```

Do not implement as one unconditional priority list only.

Each state has:

- Entry utility
- Exit utility
- Minimum commitment
- Emergency abort conditions
- Validity constraints

---

# 16. Utility-Based Tactical Planner

For each valid state, calculate a utility score.

```ts
interface TacticalCandidate {
  state: AiTacticalState;
  utility: number;
  reasons: readonly AiDecisionReason[];
  minimumCommitmentSeconds: number;
}
```

Choose:

```text
highest adjusted utility
```

Adjustment includes:

- Current-state hysteresis
- Difficulty-specific decision noise
- Commitment penalty for switching
- Emergency overrides

Example state utilities:

## Emergency save

High when:

- Ball predicted into own goal
- Time to goal short
- AI can intercept or block
- Human has strong attacking angle

## Shoot

High when:

- AI reaches ball first
- Approach can send ball toward target goal
- Ball height is controllable
- AI is not exposing immediate own-goal risk

## Challenge

High when:

- Human has possession
- AI is goal-side
- AI can arrive close to human's touch time
- Delay increases danger

## Shadow defend

High when:

- Human possession likely
- Immediate challenge is poor
- AI can stay between ball and own goal

## Retreat

High when:

- AI is ahead of ball toward opponent goal
- Human likely wins next touch
- Own goal exposed
- AI approach angle is poor

## Collect boost

High when:

- Boost is low enough to reduce future options.
- A safe active or soon-respawning pad is reachable.
- Detour cost is acceptable.
- No emergency save or high-value immediate shot overrides it.
- Route exits toward a useful attacking or defensive lane.

## Clear

High when:

- Ball near own goal
- AI can hit it safely away
- Shot is not practical

---

# 17. Commitment and State Switching

Store:

```ts
interface TacticalCommitment {
  state: AiTacticalState;
  enteredAt: number;
  minimumUntil: number;
  targetId: string | null;
  abortReason?: string;
}
```

Switch only when:

- Minimum commitment elapsed, or
- Current plan invalid, or
- Emergency threat appears, or
- Target is no longer reachable, or
- Major collision invalidates trajectory

Add a switching margin:

```text
newUtility must exceed currentUtility by threshold
```

Recommended threshold:

| Difficulty | Utility margin |
|---|---:|
| Easy | 0.18 |
| Medium | 0.12 |
| Hard | 0.08 |

---

# 18. Intercept Planning

## 18.1 Candidate generation

Sample future ball prediction.

For each sample:

1. Check time horizon.
2. Check ball height.
3. Estimate car reachability.
4. Calculate approach point.
5. Calculate desired outgoing ball direction.
6. Score the candidate.
7. Reject unsafe candidates.

## 18.2 Contact approach point

To hit the ball toward desired direction:

```ts
approachPoint =
  ballPosition
  - desiredOutgoingDirection * contactOffset;
```

Initial:

```text
contactOffset = ballRadius + carNoseOffset
```

Add lateral/vertical adjustment for shot type.

## 18.3 Candidate scoring

```text
score =
  reachability
  + shotQuality
  + goalSafety
  + arrivalSpeedQuality
  + approachAlignment
  + possessionValue
  - boostCost
  - turnCost
  - collisionRisk
  - ownGoalRisk
  - wallAwkwardness
  - predictionUncertainty
```

## 18.4 Candidate types

```ts
type InterceptType =
  | "ground-touch"
  | "ground-shot"
  | "clear"
  | "block"
  | "wall-touch"
  | "jump-touch"
  | "aerial-touch";
```

Easy:

- Ground touch
- Ground shot
- Clear
- Block

Medium:

- Adds simple jump touch
- Limited wall touch

Hard:

- Adds limited aerial touch
- Better wall reads
- Faster future intercepts

---

# 19. Shot Planning

## 19.1 Target goal

Use a target region inside the opponent goal.

Do not always aim at exact goal centre.

Candidate target points:

- Centre
- Left third
- Right third
- Lower-left
- Lower-right

## 19.2 Goal-target selection

Prefer target farthest from human defender.

But apply difficulty accuracy and noise.

Easy:

- Large random error
- Often aims centre
- May hit posts

Medium:

- Uses defender position
- Moderate target variation

Hard:

- Targets open side
- Avoids obvious blocks
- Still imperfect

## 19.3 Shot opportunity

A shot is valid when:

- AI can reach ball first or nearly first
- Contact approach exists
- Desired direction intersects goal opening
- Ball height is within maneuver skill
- Own-goal risk acceptable

## 19.4 Shot power

Power comes from:

- Arrival speed
- Boost approach
- Dodge timing
- Contact point

AI does not request a direct shot impulse.

## 19.5 Dodge shot

Use dodge when:

- Aligned sufficiently
- Contact time inside dodge window
- Dodge direction sends nose through ball
- Miss risk acceptable
- Difficulty dodge skill passes confidence threshold

---

# 20. Control Touches

Sometimes the best action is not maximum power.

Use `CONTROL_TOUCH` when:

- Ball is slow.
- AI has time.
- Hard shot angle is poor.
- Human is far.
- A softer touch creates a better next intercept.
- Shooting immediately risks an own goal or easy counter.

Control-touch behaviour:

- Lower arrival speed
- Avoid boost near contact
- No dodge
- Approach behind ball
- Follow after touch

Easy rarely performs deliberate control touches.

Medium occasionally does.

Hard uses them when clearly advantageous.

---

# 21. Defensive Positioning

## 21.1 Goal-side principle

Prefer positions between ball and own goal.

Goal-side target:

```ts
target =
  ballPosition
  + normalize(ownGoalCentre - ballPosition) * shadowDistance;
```

Clamp inside playable arena.

## 21.2 Shadow distance

Recommended:

| Difficulty | Shadow distance |
|---|---:|
| Easy | 8–12 m |
| Medium | 6–10 m |
| Hard | 4–8 m |

Adjust for ball speed and threat.

## 21.3 Goal-line defence

Use when:

- Ball threat high.
- Challenge path poor.
- AI can protect goal mouth.
- Human likely controls next touch.

Target a point between predicted ball entry and goal centre.

Do not park motionless directly inside goal unless necessary.

## 21.4 Avoiding own goal

When clearing:

- Prefer side wall or opponent half.
- Reject contact normals that send ball toward own goal.
- Apply stronger safety penalty near own goal.

Easy may still make occasional poor clears.

---

# 22. Challenge Logic

Challenge when:

- AI is goal-side.
- Human's next touch is dangerous.
- AI arrival time is close enough.
- Challenge path does not expose immediate open net.
- AI has a useful 50/50 angle.

Avoid challenge when:

- AI is badly wrong-side.
- Human can easily push past.
- Ball is safely moving away.
- AI is recovering.
- Retreat yields better defence.

Challenge aggression differs by difficulty.

Hard should not instantly challenge every possession.

---

# 23. 50/50 Planning

For contested ball:

- Approach through ball toward safe direction.
- Keep nose aligned with desired force direction.
- Use boost only if it changes arrival materially.
- Dodge near contact only when alignment is good.
- Prefer outcome away from own goal.

Predict human arrival approximately.

Do not predict future human input.

Use current human orientation, speed, and likely straight-line intercept.

Human-like uncertainty:

- Do not perfectly counter every human dodge.
- Commit before seeing the exact final touch.
- Respect reaction delay.

---

# 24. Clearing

`CLEAR` differs from `SHOOT`.

Clear objective:

```text
Remove immediate danger first.
```

Preferred directions:

1. Opponent half
2. Side wall away from own goal
3. High central clearance if safe
4. Corner away from human

Avoid:

- Direct pass across own goal
- Weak touch into centre
- Driving ball deeper into own corner without purpose

---

# 25. Retreat and Rotation

Use `RETREAT` when:

- AI has overrun ball.
- Human wins next intercept.
- AI is ahead of play.
- Own goal exposed.
- Current shot is invalid.

Retreat target:

- Goal-side lane
- Central defensive channel
- Avoid direct collision with human when possible

AI should turn efficiently:

- Normal turn for small angle
- Brake-turn for medium angle
- Powerslide for large angle at suitable speed
- Reverse briefly only when faster than turning around

---

# 26. Recovery Planner

Recovery has priority when car cannot execute normal plan.

Detect:

- Airborne without planned aerial
- Upside down
- Sideways landing
- Wall contact
- Collision spin
- Facing away after impact
- No wheel support
- Dodge recovery phase

Recovery goals:

1. Orient wheels toward expected surface.
2. Reduce harmful angular velocity.
3. Preserve useful momentum.
4. Land facing likely next play.
5. Resume tactical planning after stable support.

## 26.1 Air recovery

- Use pitch/yaw/roll to align up vector with landing surface normal.
- Aim forward vector toward own-goal-safe direction.
- Avoid unnecessary boost.

## 26.2 Wall recovery

- Align wheels to wall.
- Drive down or along wall toward playable position.
- Jump off only when it improves recovery.

## 26.3 Ground recovery

If sideways:

- Powerslide
- Countersteer
- Avoid full throttle until heading stabilises

Difficulty:

- Easy recovers slowly and imperfectly.
- Medium usually lands wheels-down.
- Hard actively preserves momentum.

---

# 27. Kickoff Planner

Kickoff begins when game flow enters countdown.

AI may preselect kickoff plan but cannot move before GO.

## Easy kickoff

- Full throttle toward ball.
- Moderate boost burst.
- No complex dodge.
- Slightly imperfect alignment.

## Medium kickoff

- Full throttle.
- Boost.
- Timed front or diagonal dodge.
- Aim through ball toward opponent side.

## Hard kickoff

- Fast kickoff sequence.
- Boost management.
- Timed diagonal dodge.
- Small corrective steer.
- Still uses legal inputs and reaction model.

Kickoff state remains committed until:

- Ball contact
- Ball leaves centre region
- Timeout
- AI is bumped off route

Do not implement an exact professional speed-flip before physics controls are proven.

---

# 28. Boost Pads and Boost Management

Boost pads are part of tactical navigation, not merely emergency refills.

Shared economy:

```text
Kickoff boost: 33
Small pad: +12
Small respawn: 4 seconds
Full pad: fill to 100
Full respawn: 10 seconds
```

The AI must balance:

- Current play value
- Boost need
- Detour cost
- Goal exposure
- Pad availability
- Human arrival
- Respawn timing
- Route continuity
- Denial value

## 28.1 Tactical state

Use `COLLECT_BOOST` when:

- Boost is meaningfully low.
- No emergency defensive action is required.
- A reachable pad improves future play.
- Detour does not concede an obvious goal.
- Pad is expected active on arrival.
- Current shot/challenge value is lower than refill value.

`COLLECT_BOOST` should not activate merely because boost is below 100.

## 28.2 Boost-pad planner

```ts
export interface BoostPadPlan {
  padId: BoostPadId;
  padType: "small" | "full";

  targetPosition: Vec3Data;

  estimatedArrivalTime: number;
  expectedAvailableOnArrival: boolean;
  expectedBoostAfterPickup: number;

  detourTime: number;
  routeExitQuality: number;
  defensiveRisk: number;
  humanContestRisk: number;
  denialValue: number;

  utility: number;
}
```

Planner:

1. Read delayed pad observations.
2. Generate active pads and soon-respawning pads.
3. Estimate AI arrival.
4. Estimate human arrival when strategically relevant.
5. Reject unavailable-on-arrival pads.
6. Reject unsafe detours.
7. Score route value.
8. Select a pad with commitment and fallback.

## 28.3 Availability on arrival

For an active pad:

```text
available on arrival = true
unless human likely collects it first
```

For inactive pad:

```text
available on arrival =
  respawnSecondsRemaining <= estimatedArrivalTime - safetyMargin
```

Safety margin:

| Difficulty | Margin |
|---|---:|
| Easy | 0.30 s |
| Medium | 0.15 s |
| Hard | 0.06 s |

Easy should rarely wait for inactive pads.

Medium may route through a pad that respawns shortly before arrival.

Hard may time a route accurately but still obey perception delay.

## 28.4 Pad utility

Example:

```text
utility =
  boostNeedValue
  + padAmountValue
  + routeExitQuality
  + tacticalLocationValue
  + denialValue
  - detourTimeCost
  - ownGoalExposure
  - humanContestRisk
  - predictionUncertainty
```

Full pads have higher amount value but usually larger detour cost.

Small-pad chains can be superior to one full-pad detour.

## 28.5 Route chaining

Medium and Hard may plan through multiple small pads.

```ts
interface BoostRoute {
  padIds: BoostPadId[];
  estimatedDuration: number;
  expectedBoostGain: number;
  exitPosition: Vec3Data;
  exitFacing: Vec3Data;
  utility: number;
}
```

Limit route depth:

| Difficulty | Maximum pad chain |
|---|---:|
| Easy | 1 |
| Medium | 2 |
| Hard | 3 |

Do not use a general expensive travelling-salesperson solver.

Generate a bounded set of nearby route candidates.

## 28.6 Full-pad choice

Prefer full pad when:

- Boost is very low.
- Detour is safe.
- It supports defence or a strong attack.
- AI can arrive before human.
- Small-pad route is insufficient.
- Match context justifies commitment.

Avoid full-pad obsession.

The AI must not abandon a critical save to collect full boost.

## 28.7 Small-pad choice

Prefer small pads when:

- Pad lies close to current route.
- AI needs only moderate boost.
- Rotating toward defence.
- A full pad is contested.
- Maintaining pressure is valuable.
- Chain offers good exit alignment.

## 28.8 Boost denial

Denial means collecting a pad that is useful to the human while remaining tactically sound.

Hard may consider denial.

Medium considers obvious low-risk denial.

Easy mostly ignores denial.

Never collect a pad solely to deny when doing so exposes an open goal.

## 28.9 Contested pads

Estimate:

```text
aiArrivalTime
humanArrivalTime
```

If human likely arrives first:

- Choose alternate pad.
- Continue current play.
- Challenge only when the ball situation also justifies it.

Do not ram the human only because a pad is contested.

If arrivals are close:

- Treat pad availability as uncertain.
- Hard may choose a route with a useful fallback target.
- Easy may commit and arrive late.

## 28.10 Pickup confirmation

Do not assume collection from route geometry.

Confirm through delayed `boost-pad-collected` event or changed boost observation.

On collection by AI:

- Update boost model.
- Clear pad target.
- Continue to route exit or replan.

On collection by human:

- Mark pad inactive after reaction delay.
- Invalidate plans relying on it.
- Choose fallback.

## 28.11 Boost spending

Reserve boost for:

- Emergency save
- Critical challenge
- Valuable shot
- Recovery under threat
- Kickoff
- Reaching a pad only when the boost spent is meaningfully lower than the expected gain

Avoid:

- Boost at speed cap
- Boost through large turns
- Long wasteful chases
- Boosting toward a pad when net gain is negligible
- Spending 15 boost to collect a 12 pad without tactical route value

## 28.12 Desired reserves

Recommended normal reserve:

| Difficulty | Reserve |
|---|---:|
| Easy | 25 |
| Medium | 18 |
| Hard | 10 |

Reserves are lower than the no-pad design because boost can be replenished.

Emergency states may ignore reserve.

## 28.13 Kickoff

Cars begin with 33.

After kickoff contact:

- Reassess ball.
- Consider nearby small-pad route during retreat.
- Do not immediately abandon kickoff to collect a full pad.

## 28.14 Pad memory

Store delayed known state:

```ts
interface AiBoostPadMemory {
  padId: BoostPadId;
  believedActive: boolean;
  believedRespawnTime: number | null;
  lastObservedAt: number;
  confidence: number;
}
```

Easy:

- Mostly reacts to visibly active nearby pads.
- Limited respawn memory.

Medium:

- Tracks all observed pickups.
- Uses basic respawn planning.

Hard:

- Tracks timers accurately after delayed observation.
- Plans routes and denial.
- Still cannot see a pickup before perception delay.

## 28.15 Required scenarios

- Collect nearby small pad while rotating.
- Collect full pad when critically low and safe.
- Ignore distant full pad during emergency save.
- Prefer two small pads over unsafe full-pad detour.
- Replan after human takes target pad.
- Wait/route for soon-respawning pad on Hard.
- Avoid inactive pad that will respawn too late.
- Resolve contested pad uncertainty.
- Preserve positive net boost gain.
- Reset pad memory at kickoff.
- Use 33 kickoff boost correctly.

# 29. Ground Maneuver Controller

Input target:

```ts
interface GroundManeuverTarget {
  targetPosition: Vec3Data;
  targetFacing?: Vec3Data;
  desiredArrivalSpeed: number;
  arrivalTime?: number;
  allowBoost: boolean;
  allowPowerslide: boolean;
  allowDodge: boolean;
}
```

Controller outputs:

- Throttle
- Steer
- Powerslide
- Boost
- Jump/dodge request

Calculate local target angle.

```ts
targetAngle =
  atan2(
    dot(targetDirection, carRight),
    dot(targetDirection, carForward)
  );
```

Steer:

- Proportional to angle
- Reduced at high speed when small correction
- Full steer for large angle

Throttle:

- Full when far and aligned
- Reduced near target
- Brake when arrival speed too high
- Reverse only if target behind and short

Powerslide:

- Large turn angle
- Sufficient speed
- Skill threshold
- Predicted turn-time improvement

---

# 30. Input Smoothing

Human-like control should not flicker.

Apply:

```ts
interface AiInputSmoothing {
  throttleRate: number;
  steerRate: number;
  pitchRate: number;
  yawRate: number;
  rollRate: number;
}
```

Buttons use explicit decisions and minimum hold times.

Recommended:

- Boost minimum hold: 3–6 ticks
- Powerslide minimum hold: 4–10 ticks
- Jump press: exact edge
- Dodge direction held through trigger window

Do not smooth jump edges into failure.

---

# 31. Jump Planning

Use jump when:

- Ball intercept requires height.
- Car is grounded.
- Contact timing valid.
- Target height within skill.
- AI is not in an unsafe defensive situation unless saving.

Jump plan:

```ts
interface JumpPlan {
  jumpStartTime: number;
  holdDuration: number;
  secondJumpTime?: number;
  dodgeDirection?: { x: number; y: number };
  expectedContactTime: number;
}
```

Easy:

- Basic tap/hold.
- No aerial.

Medium:

- Simple jump touch.
- Occasional second-jump hit.

Hard:

- Better hold duration.
- Limited aerial or dodge contact.

Cancel plan if prediction changes significantly before jump commitment.

After jump begins, maintain commitment unless impossible or emergency recovery needed.

---

# 32. Limited Aerial Planning

Hard AI only by default.

Medium aerial skill remains near zero and may perform only low jump-boost touches.

Aerial conditions:

- Ball height below maximum.
- Time to contact within maximum aerial time.
- Boost sufficient.
- Ground intercept unavailable or worse.
- Own goal risk acceptable.
- Predicted contact confidence high.

Aerial controller:

- Orient nose toward intercept.
- Boost in short bursts.
- Correct pitch/yaw/roll.
- Stop boosting when overshooting.
- Prepare landing after contact or miss.

Do not attempt ceiling shots, air dribbles, flip resets, or advanced freestyle mechanics.

---

# 33. Wall Behaviour

Initial AI wall competence:

Easy:

- Avoids wall play.
- Retreats or waits for ball to descend.

Medium:

- Drives onto lower wall for obvious touches.
- Jumps off rarely.

Hard:

- Predicts simple wall bounce.
- Drives on wall.
- Performs limited jump-off contact.
- Recovers from wall.

Reject wall intercept when:

- Contact point too high.
- Orientation path uncertain.
- Own goal exposed.
- Prediction confidence low.

---

# 34. Humanisation Model

Humanisation must improve fairness without making AI irrational.

Components:

- Reaction delay
- Prediction uncertainty
- Aim error
- Tactical decision noise
- Commitment
- Input smoothing
- Boost conservatism
- Maneuver skill gates
- Occasional bounded mistake

## 34.1 Mistake types

Allowed:

- Slight late challenge
- Slightly poor shot target
- Overturn
- Underuse boost
- Missed dodge timing
- Choose safe clear instead of optimal shot
- Retreat too early
- Misread difficult wall bounce
- Awkward recovery

Avoid:

- Randomly driving into own goal
- Reversing controls
- Ignoring stationary ball for long periods
- Stopping completely without tactical reason
- Repeated identical failure loops
- Deliberately throwing a close game

## 34.2 Mistake cooldown

Prevent clusters of artificial mistakes.

```text
After one injected mistake, apply cooldown.
```

Recommended:

| Difficulty | Cooldown |
|---|---:|
| Easy | 2.0 s |
| Medium | 4.0 s |
| Hard | 7.0 s |

---

# 35. Score and Time Awareness

AI may adjust style based on score and time.

Use modest adjustments only.

Examples:

Trailing late:

- Slightly more challenge aggression
- Lower boost reserve
- More shot preference

Leading late:

- Slightly more defensive positioning
- Safer clears
- Avoid reckless aerials

Overtime:

- Medium urgency
- Do not become suicidal
- Prioritise not conceding open net

Easy should have less score-aware adaptation.

Hard may adapt more strongly.

---

# 36. Anti-Stall Behaviour

Detect low-progress loops:

- Circling ball without contact
- Repeatedly reversing near wall
- Stationary waiting with no tactical reason
- Same failed target selected repeatedly
- Ball trapped in corner

Store progress:

```ts
interface AiProgressTracker {
  distanceToTargetHistory: number[];
  lastBallTouchTime: number;
  lastMeaningfulPlanChange: number;
  repeatedFailureCount: number;
}
```

If stalled:

1. Invalidate current plan.
2. Increase alternative candidate utility.
3. Choose retreat, wait, or simpler touch.
4. Avoid repeating same failed wall/aerial plan.

---

# 37. Collision Response in Planning

On AI car collision:

- Immediately flag plan uncertain.
- Enter recovery if orientation/support invalid.
- Replan after reaction delay unless emergency.

On human-ball contact:

- Invalidate ball prediction.
- Refresh after reaction delay.
- Emergency threat may use immediate coarse response with reduced accuracy.

On AI-ball contact:

- Record touch.
- Recalculate possession.
- Continue follow-up only if plan remains valid.

---

# 38. Match-State Integration

AI outputs neutral input in:

```text
MAIN_MENU
MATCH_SETUP
SETTINGS
MATCH_LOADING
KICKOFF_SETUP
COUNTDOWN_3
COUNTDOWN_2
COUNTDOWN_1
GOAL_LATCHED
GOAL_CELEBRATION
KICKOFF_RESET
OVERTIME_INTRO
MATCH_ENDING
MATCH_RESULTS
PAUSED
```

AI may output gameplay input in:

```text
COUNTDOWN_GO
PLAYING
ZERO_SECOND_PLAY
OVERTIME_PLAYING
```

At `COUNTDOWN_GO`, release according to game-flow control timing.

On kickoff reset:

- Clear tactical state
- Clear perception history
- Clear plans
- Reset random substreams if required
- Select kickoff profile
- Do not reset match-level seed entirely unless specified

---

# 39. AI Debug State

```ts
export interface AiDebugState {
  enabled: boolean;
  difficulty: AiDifficulty;

  tacticalState: AiTacticalState;
  previousTacticalState: AiTacticalState;

  stateEnteredAt: number;
  commitmentUntil: number;

  selectedIntercept?: AiInterceptDebug;
  selectedShotTarget?: Vec3Data;
  selectedBoostPadId?: BoostPadId;
  selectedBoostRoute?: readonly BoostPadId[];
  defensiveTarget?: Vec3Data;
  recoveryTarget?: Vec3Data;

  possession: PossessionAssessment;
  threat: BallThreatAssessment;

  ownInterceptTime?: number;
  humanInterceptTime?: number;

  currentInput: CarInput;

  candidateUtilities: readonly TacticalCandidate[];
  rejectedCandidates: readonly RejectedAiCandidate[];

  reactionDelaySeconds: number;
  activeMistake?: AiMistakeDebug;
}
```

---

# 40. Debug Visualisation

Physics/AI lab must show:

- Current tactical state
- Delayed perceived ball position
- Actual ball position
- Ball prediction path
- Candidate intercept samples
- Selected intercept
- AI target position
- Shot direction
- Goal target point
- Defensive shadow point
- Own and human estimated intercept times
- Reachability radius
- Car desired facing
- Utility scores
- Commitment timer
- Boost reserve
- Active/inactive boost-pad state
- Selected boost pad and route
- AI and human estimated pad arrival times
- Reaction-delay buffer
- Rejected plan reasons

Colour scheme may be chosen, but labels must be clear.

Debug geometry is native resolution or excluded from PSX post-process when necessary for readability.

---

# 41. AI Telemetry

```ts
export interface AiTelemetryFrame {
  tick: number;
  simulationTime: number;
  difficulty: AiDifficulty;

  perceived: {
    aiCar: CarObservation;
    humanCar: CarObservation;
    ball: BallObservation;
  };

  actual?: {
    aiCar: CarObservation;
    humanCar: CarObservation;
    ball: BallObservation;
  };

  tacticalState: AiTacticalState;
  selectedTarget?: Vec3Data;
  selectedInterceptTime?: number;

  possession: PossessionAssessment;
  threat: BallThreatAssessment;

  input: CarInput;

  boostReserve: number;
  selectedBoostPadId?: BoostPadId;
  expectedBoostGain?: number;
  currentPlanAge: number;

  decisionReasons: readonly string[];
  mistake?: string;
}
```

Export:

- JSON
- CSV
- Scenario summary
- State-duration report
- Goal and touch report

---

# 42. Browser AI Test API

Expose only in development/test builds.

```ts
declare global {
  interface Window {
    __AI_TEST__?: BrowserAiTestApi;
  }
}
```

Required:

```ts
export interface BrowserAiTestApi {
  ready(): boolean;

  setEnabled(enabled: boolean): void;
  setDifficulty(difficulty: AiDifficulty): void;
  getDifficulty(): AiDifficulty;

  setSeed(seed: number): void;

  resetScenario(id: AiScenarioId): void;
  runScenario(
    id: AiScenarioId,
    options?: AiScenarioOptions
  ): AiScenarioResult;

  advanceTicks(count: number): void;
  advanceSeconds(seconds: number): void;

  getDebugState(): AiDebugState;
  getTelemetry(): AiTelemetryFrame[];
  clearTelemetry(): void;

  overridePerceptionDelay(seconds: number | null): void;
  overrideTacticalState(state: AiTacticalState | null): void;

  getCurrentInput(): CarInput;
  getScenarioMetrics(): Record<string, number>;
}
```

Test overrides must never be used by production runtime.

---

# 43. Scenario Catalogue

```ts
export type AiScenarioId =
  | "kickoff-centre"
  | "open-shot-stationary-ball"
  | "open-shot-moving-ball"
  | "basic-intercept"
  | "late-intercept"
  | "human-possession-shadow"
  | "human-possession-challenge"
  | "emergency-save"
  | "goal-line-block"
  | "safe-clear"
  | "avoid-own-goal"
  | "retreat-after-overrun"
  | "recover-sideways"
  | "recover-upside-down"
  | "recover-from-wall"
  | "car-car-bump-recovery"
  | "simple-wall-bounce"
  | "jump-touch"
  | "hard-low-aerial"
  | "boost-conservation"
  | "boost-pad-small-route"
  | "boost-pad-full-route"
  | "boost-pad-contested"
  | "boost-pad-respawn-timing"
  | "boost-pad-human-denial"
  | "boost-pad-emergency-override"
  | "zero-second-defence"
  | "overtime-attack"
  | "corner-stall"
  | "full-match-one-minute";
```

Scenario definition:

```ts
export interface AiScenarioDefinition {
  id: AiScenarioId;
  arenaPreset: string;

  initialAiCar: CarSerializableState;
  initialHumanCar: CarSerializableState;
  initialBall: BallSerializableState;

  difficulty: AiDifficulty;
  seed: number;

  scriptedHumanInput: InputSequenceSegment[];
  durationTicks: number;

  expectedBehaviours: readonly AiExpectedBehaviour[];
  forbiddenBehaviours: readonly AiForbiddenBehaviour[];
  metrics: readonly AiScenarioMetricDefinition[];
}
```

---

# 44. Playwright Behaviour Tests

## 44.1 Neutral states

In countdown, pause, celebration, and results:

```text
AI input must be neutral.
```

## 44.2 Kickoff

Assert:

- AI remains still before GO.
- AI accelerates after GO.
- AI generally approaches centre ball.
- Medium/Hard may boost and dodge.
- Easy does not perform complex kickoff.
- AI does not steer toward own goal.

## 44.3 Open shot

Place ball stationary with open opponent goal.

Assert:

- AI selects shoot/intercept.
- AI reaches ball.
- AI touches ball.
- Ball travels generally toward opponent goal.
- Hard accuracy exceeds Medium.
- Medium exceeds Easy statistically across seeds.

## 44.4 Emergency save

Ball predicted toward AI goal.

Assert:

- AI enters emergency state.
- AI target lies on useful interception path.
- AI attempts save before unrelated attack.
- AI does not retreat away from goal.

## 44.5 Shadow defence

Human carries ball with no immediate shot.

Assert:

- AI remains goal-side.
- AI does not blindly dive every refresh.
- AI distance stays within configured shadow band.

## 44.6 Retreat

AI starts ahead of ball toward opponent goal while human wins possession.

Assert:

- AI rotates back.
- AI moves toward defensive side.
- AI does not continue chasing opponent goal.

## 44.7 Recovery

Spawn AI sideways/upside down.

Assert:

- Tactical state becomes recover.
- Inputs orient wheels toward surface.
- AI returns to grounded playable state.
- Hard recovers faster than Easy on average.

## 44.8 Boost conservation

Give AI limited boost and distant low-value ball.

Assert:

- AI does not exhaust boost immediately.
- Emergency state may violate reserve.
- Boost never activates at speed cap without directional need.

## 44.9 Boost-pad routing

Run scenarios with active and inactive small/full pads.

Assert:

- AI chooses a safe useful pad when boost is low.
- AI ignores a full pad when an emergency save is required.
- AI does not target a pad that respawns after expected arrival.
- Hard times soon-respawning pads more accurately than Easy.
- AI replans after the human collects its target pad.
- Pad routing does not produce negative boost gain without positional value.
- Kickoff reset restores AI pad memory to all-active and boost to 33.

## 44.10 Own-goal avoidance

Present two clear options:

- Strong touch toward own goal
- Weaker safe side clearance

Assert safe option receives higher utility.

## 44.11 Reaction delay

Create unexpected human hit.

Measure tick before AI tactical response.

Assert delay falls inside difficulty range.

Hard responds earlier than Medium; Medium earlier than Easy.

---

# 45. Statistical Difficulty Tests

Some humanisation behaviour is probabilistic but seeded.

Run each scenario over multiple seeds.

Metrics:

- Goal conversion rate
- Save rate
- Average intercept error
- Average reaction time
- Boost waste
- Pad collection count by type
- Average net boost gained per pad route
- Failed/inactive pad arrival count
- Unsafe boost detour count
- Recovery time
- Own-goal rate
- Miss rate
- Possession challenge frequency

Expected ordering:

```text
Hard generally stronger than Medium.
Medium generally stronger than Easy.
```

Do not require every individual seed to preserve ordering.

Suggested sample:

```text
20–50 seeds per statistical test
```

Keep CI subset smaller and run full suite manually or nightly.

---

# 46. Full-Match Evaluation

Run automated one-minute matches against scripted human profiles.

Human profiles:

```ts
type ScriptedHumanProfile =
  | "idle"
  | "slow-chaser"
  | "straight-attacker"
  | "defensive"
  | "erratic"
  | "competent";
```

Measure:

- Goals for/against
- Touches
- Shots
- Saves
- Time in each tactical state
- Stalls
- Own goals
- Boost remaining
- Small/full pads collected
- Boost-route detour time
- Average decision changes per second
- Invalid inputs
- NaN/errors
- Time spent recovered versus unstable

Expected:

Easy:

- Beats idle.
- Competitive with slow chaser.
- Loses often to competent profile.

Medium:

- Reliably beats idle and slow chaser.
- Competitive with competent profile.

Hard:

- Strong against all scripted profiles.
- Still makes mistakes and can lose.

---

# 47. AI Invariants

Assert every tick:

- Input axes within `[-1, 1]`.
- Buttons are booleans.
- No NaN.
- No direct physics writes by AI.
- Tactical state valid.
- Target vectors finite.
- Candidate utilities finite.
- Boost decision cannot consume unavailable boost.
- Selected boost pad ID must exist in the arena observation.
- AI cannot collect or reactivate a pad directly.
- Expected pad availability must account for respawn time.
- Jump edge not spammed every tick.
- AI neutral when disabled.
- AI does not call test-only interfaces.
- Prediction result source tick is not from the future.
- Selected intercept lies within arena bounds unless wall play.
- Goal orientation is correct.
- Own goal and target goal are not swapped.
- Random seed deterministic.
- Commitment timer monotonic within plan.
- Perception buffer bounded.

---

# 48. Performance Targets

One AI opponent only.

Targets:

```text
Average AI update under 0.5 ms
Tactical refresh under 1.5 ms
Prediction refresh under 2.0 ms amortised
No large garbage allocation per tick
```

Use:

- Reused arrays
- Object pools
- Cached prediction samples
- Bounded candidates
- Stable typed structures
- No recursive search
- No pathfinding graph over every arena triangle

If prediction is expensive:

- Refresh less often.
- Reuse until invalidated.
- Reduce candidate samples.
- Never reduce physics tick rate.

---

# 49. Calibration Workflow

Use this order:

1. Low-level steering toward a static point
2. Arrival speed control
3. Powerslide turning
4. Basic moving-ball intercept
5. Open shot
6. Defensive retreat
7. Shadow defence
8. Challenge
9. Clear
10. Recovery
11. Kickoff
12. Boost-pad routing and boost management
13. Contested-pad and respawn planning
14. Jump touch
15. Limited aerial
16. Humanisation
17. Difficulty separation
18. Full matches

Loop:

```text
Run scenario
-> inspect target and prediction
-> compare actual path
-> identify one failure
-> adjust one parameter group
-> rerun focused scenario
-> rerun regressions
-> run short match
-> record result
```

Do not tune tactical utilities before low-level target following works.

---

# 50. AI Calibration Log

```md
## YYYY-MM-DD — Defensive challenge timing

### Problem
Medium AI dives too early and leaves goal open.

### Hypothesis
Challenge aggression outweighs shadow utility when intercept advantage is small.

### Scenarios
- human-possession-shadow
- human-possession-challenge
- full-match-one-minute

### Parameters before
- challengeAggression:
- shadowDistance:
- switchingMargin:

### Parameters after
...

### Metrics
- premature challenge count:
- saves:
- goals conceded:
- average goal-side distance:

### Playtest
- More human-like:
- Too passive:
- Unexpected behaviour:

### Decision
Accepted / Reverted / Revise
```

---

# 51. Human Playtest Rubric

Rate 1–5.

Fairness:

- Opponent obeys same rules.
- Opponent does not react impossibly fast.
- Opponent mistakes feel believable.
- Losses feel understandable.
- Wins feel earned.

Human likeness:

- Opponent does not constantly twitch.
- Opponent commits to decisions.
- Opponent sometimes hesitates or misreads.
- Opponent recovers naturally.
- Opponent has recognisable intent.

Attack:

- Finds ball rather than chasing old position.
- Creates meaningful shots.
- Uses boost sensibly.
- Can make soft and hard touches.
- Does not attack recklessly every time.

Defence:

- Returns goal-side.
- Challenges at plausible times.
- Attempts saves.
- Clears danger.
- Does not camp permanently in goal.

Difficulty:

- Easy is forgiving but functional.
- Medium is the default enjoyable challenge.
- Hard is demanding but not unfair.
- Difficulty changes behaviour, not car stats.

---

# 52. Common Failure Modes

## AI chases current ball position

Check:

- Prediction not used.
- Selected sample time always zero.
- Intercept reachability ignored.
- Prediction invalidated incorrectly.

## AI constantly changes direction

Check:

- Tactical planner running too frequently.
- No commitment.
- No switching margin.
- Perception noise resampled every tick.
- Target candidate order unstable.

## AI never challenges

Check:

- Defensive penalties too strong.
- Human intercept estimate always too optimistic.
- Goal-side test incorrect.
- Challenge utility threshold too high.

## AI challenges everything

Check:

- Aggression too high.
- Shadow utility weak.
- Own-goal exposure omitted.
- Commitment ends too quickly.
- Possession estimate flickers.

## AI shoots toward own goal

Check:

- Goal metadata swapped.
- Desired outgoing direction reversed.
- Contact approach point sign wrong.
- Team side assumptions hard-coded incorrectly.

## AI misses stationary ball

Check:

- Car target controller.
- Car forward-axis convention.
- Arrival speed.
- Contact offset.
- Steering sign.
- Target updates too slowly.

## AI ignores boost pads

Check:

- Pad observations not included in world model.
- Collect-boost utility never valid.
- Detour penalty too high.
- Pad availability prediction incorrect.
- Pad target invalidated every tactical refresh.

## AI camps a boost pad

Check:

- Waiting utility too high.
- Respawn planning window too large.
- Goal exposure missing.
- No plan timeout.
- Pad unavailable-on-arrival test wrong.

## AI wastes boost

Check:

- No reserve.
- Speed-cap awareness missing.
- Boost held through turns.
- Target invalidation fails.
- Burst maximum ignored.

## AI is robotic

Check:

- Reaction delay too low.
- Aim perfect.
- No input smoothing.
- No commitment.
- No bounded mistakes.
- Tactical state changes too often.

## AI appears stupid

Check:

- Noise too high.
- Mistakes clustered.
- Prediction horizon too short.
- Low-level controller failing.
- Tactical state correct but maneuver wrong.
- Difficulty limits stacked excessively.

## AI gets stuck in corner

Check:

- Anti-stall missing.
- Same target reselected.
- Wall candidate invalid.
- Reverse/turn controller oscillation.
- No plan timeout.

---

# 53. Phased Implementation Plan

## Phase 0 — Contracts and harness

Implement:

- Public types
- AI module shell
- Seeded PRNG
- Test API
- Telemetry
- Neutral input states

Exit:

- AI initialises.
- AI outputs valid neutral input.
- Same seed is deterministic.

## Phase 1 — Low-level target driving

Implement:

- Ground target
- Steering
- Throttle
- Brake
- Arrival speed
- Basic powerslide

Tests:

- Static point
- Moving point
- Turn-around
- Stop at target

Exit:

- Car reliably reaches field positions.

## Phase 2 — Perception and prediction

Implement:

- Observation buffer
- Reaction delay
- Stable noise
- Ball prediction
- Prediction invalidation

Tests:

- Delay
- Repeatability
- Bounce prediction
- Collision invalidation

Exit:

- Debug prediction matches ball acceptably.

## Phase 3 — Reachability and intercepts

Implement:

- Car reachability estimates
- Candidate samples
- Candidate scoring
- Ground intercept

Tests:

- Basic moving ball
- Late intercept
- Unreachable sample rejection

Exit:

- AI meets moving ball predictively.

## Phase 4 — Shooting

Implement:

- Goal target points
- Approach point
- Arrival speed
- Dodge shot gate
- Accuracy by difficulty

Tests:

- Stationary shot
- Moving shot
- Defender-aware target

Exit:

- AI can score open goals.

## Phase 5 — Defence

Implement:

- Threat assessment
- Goal side
- Retreat
- Shadow
- Challenge
- Goal-line block
- Clear

Tests:

- Human possession
- Emergency save
- Own-goal avoidance

Exit:

- AI protects its goal and does not blindly chase.

## Phase 6 — Recovery

Implement:

- Air orientation
- Sideways landing
- Upside-down recovery
- Wall recovery
- Collision invalidation

Exit:

- AI resumes useful play after disruption.

## Phase 7 — Kickoff, boost pads, and boost economy

Implement:

- Easy/Medium/Hard kickoff profiles
- 33 kickoff boost
- Required 12-small/4-full pad observations
- Collect-boost tactical state
- Pad selection and route scoring
- Respawn timing
- Contested-pad uncertainty
- Finite boost reserve
- Burst management
- Emergency override

Exit:

- Kickoffs are legal and distinct.
- AI collects useful pads and ignores unsafe detours.
- AI replans when a pad is taken.
- AI does not waste all boost immediately.

## Phase 8 — Jump touches

Implement:

- Jump reach model
- Hold duration
- Second jump touch
- Plan commitment

Exit:

- Medium and Hard perform reliable low touches.

## Phase 9 — Limited aerial

Hard only:

- Low aerial candidate
- Orientation
- Boost path
- Landing recovery

Exit:

- Hard can reach selected low airborne balls.
- It does not spam aerial attempts.

## Phase 10 — Humanisation and difficulties

Implement:

- Noise
- Mistakes
- Decision temperature
- Commitment tuning
- Score/time adaptation

Exit:

- Easy/Medium/Hard visibly differ.
- No hidden stat differences.
- Medium is enjoyable default.

## Phase 11 — Full-match calibration

Run:

- Scripted profiles
- Statistical seeds
- Human playtests
- Performance tests
- Long matches

Exit:

- No stalls.
- No frequent own goals.
- Difficulty ordering holds statistically.
- Human-like fairness averages at least 4/5.

---

# 54. Definition of Done

Architecture:

- [ ] AI outputs only `CarInput`
- [ ] No direct physics mutation
- [ ] Public observation interfaces only
- [ ] Seeded deterministic randomness
- [ ] Separate perception, planning, and control
- [ ] Debug state and telemetry
- [ ] Playwright test API

Perception and prediction:

- [ ] Reaction delay
- [ ] Stable bounded noise
- [ ] Ball prediction
- [ ] Prediction invalidation
- [ ] Reachability estimation
- [ ] Intercept candidates

Tactics:

- [ ] Kickoff
- [ ] Recover
- [ ] Emergency save
- [ ] Goal-line defend
- [ ] Shadow defend
- [ ] Challenge
- [ ] Retreat
- [ ] Intercept
- [ ] Shoot
- [ ] Control touch
- [ ] Clear
- [ ] Wait
- [ ] Commitment and hysteresis

Maneuvers:

- [ ] Steering
- [ ] Throttle/brake
- [ ] Powerslide
- [ ] Boost spending
- [ ] Small-pad routing
- [ ] Full-pad routing
- [ ] Respawn-aware planning
- [ ] Contested-pad replanning
- [ ] Boost denial with safety limits
- [ ] Jump
- [ ] Dodge
- [ ] Recovery
- [ ] Limited Hard aerial

Difficulty:

- [ ] Easy
- [ ] Medium
- [ ] Hard
- [ ] Same car statistics
- [ ] Different reaction and planning quality
- [ ] Believable mistakes
- [ ] Statistical strength ordering

Testing:

- [ ] Kickoff tests
- [ ] Intercept tests
- [ ] Shot tests
- [ ] Defence tests
- [ ] Recovery tests
- [ ] Boost-spending tests
- [ ] Boost-pad routing, respawn, contest, denial, and emergency-override tests
- [ ] Reaction-delay tests
- [ ] Own-goal avoidance
- [ ] Difficulty statistics
- [ ] Full one-minute matches
- [ ] Long-run stability
- [ ] Performance budget

Playability:

- [ ] Easy is forgiving
- [ ] Medium is enjoyable default
- [ ] Hard is challenging
- [ ] Opponent intent is readable
- [ ] Opponent is not omniscient
- [ ] Opponent makes recoverable mistakes
- [ ] Opponent does not stall frequently
- [ ] Opponent uses the complete game loop correctly

---

# 55. Deferred Features

Do not block initial implementation on:

- Multiple AI personalities
- Team play beyond 1v1
- Demolitions
- Advanced air dribbles
- Ceiling shots
- Flip resets
- Wave-dash optimisation
- Professional speed flips
- Machine learning
- Behaviour trees authored in an editor
- Recorded human imitation
- Dynamic difficulty during a match
- Multiple arenas with different navigation
- Taunts or celebration personality
- Named opponent characters

---

# 56. Recommended Source Structure

```text
src/ai/
├─ index.ts
├─ OpponentAiModule.ts
├─ AiTypes.ts
├─ AiDifficulty.ts
├─ AiRandom.ts
├─ AiTelemetry.ts
│
├─ perception/
│  ├─ AiPerception.ts
│  ├─ PerceptionHistory.ts
│  ├─ PerceptionNoise.ts
│  └─ AiWorldModel.ts
│
├─ prediction/
│  ├─ PhysicsPredictionService.ts
│  ├─ BallPredictionInterpreter.ts
│  ├─ CarReachabilityEstimator.ts
│  └─ PredictionInvalidation.ts
│
├─ tactics/
│  ├─ TacticalPlanner.ts
│  ├─ TacticalState.ts
│  ├─ UtilityScoring.ts
│  ├─ PossessionAssessment.ts
│  ├─ ThreatAssessment.ts
│  └─ CommitmentController.ts
│
├─ planning/
│  ├─ InterceptPlanner.ts
│  ├─ ShotPlanner.ts
│  ├─ DefensivePlanner.ts
│  ├─ ClearPlanner.ts
│  ├─ KickoffPlanner.ts
│  ├─ RecoveryPlanner.ts
│  ├─ BoostPadPlanner.ts
│  ├─ BoostRoutePlanner.ts
│  └─ AerialPlanner.ts
│
├─ control/
│  ├─ ManeuverController.ts
│  ├─ GroundTargetController.ts
│  ├─ InputSmoothing.ts
│  ├─ JumpDodgeController.ts
│  ├─ AerialController.ts
│  └─ BoostController.ts
│
├─ humanisation/
│  ├─ HumanisationModel.ts
│  ├─ MistakeModel.ts
│  └─ ScoreContextAdjustment.ts
│
├─ debug/
│  ├─ AiDebugState.ts
│  ├─ AiDebugRenderer.ts
│  └─ AiTelemetryExport.ts
│
└─ testing/
   ├─ BrowserAiTestApi.ts
   ├─ AiScenarioRunner.ts
   ├─ AiScenarioDefinitions.ts
   └─ ScriptedHumanProfiles.ts
```

---

# 57. Final Architecture

```text
Game flow enables opponent input
            |
            v
   Immutable physics observations
            |
            v
 Delayed human-like perception
            |
            v
  Ball prediction and reachability
            |
            v
 Tactical utility planner
 ├─ attack
 ├─ defend
 ├─ challenge
 ├─ retreat
 ├─ recover
 ├─ collect boost
 └─ kickoff
            |
            v
 Selected intercept or position target
            |
            v
 Maneuver controller
 ├─ steer
 ├─ throttle/brake
 ├─ powerslide
 ├─ boost
 ├─ jump
 ├─ dodge
 └─ limited aerial
            |
            v
       Standard CarInput
            |
            v
 Existing shared physics module
```

Difficulty is produced by:

```text
Reaction time
+ perception uncertainty
+ prediction horizon
+ candidate count
+ tactical quality
+ shot accuracy
+ maneuver skill
+ boost discipline
+ boost-pad routing quality
+ respawn and contest awareness
+ bounded mistakes
```

Difficulty is not produced by:

```text
Faster car
Stronger hits
Infinite boost
Teleporting
Hidden physics access
Perfect future knowledge
```

The intended result is an opponent that visibly thinks ahead, makes plausible choices, commits to them, sometimes gets them wrong, and gives the player a fair and enjoyable 1v1 match.
