import type { AudioModule } from "@/audio/AudioTypes";
import type { TeamId } from "@/core/TeamTypes";
import type { RenderFrameContext, RenderFrameModule } from "@/core/GameModule";
import { OPPONENT_CAR_ID, PLAYER_CAR_ID } from "@/game-flow/MatchFlowConstants";
import type { MatchFlowController } from "@/game-flow/MatchFlowController";
import type { MatchState } from "@/game-flow/MatchFlowTypes";
import type { PhysicsFacade } from "@/physics/PhysicsFacade";
import type { CarId } from "@/physics/PhysicsTypes";
import * as V from "@/physics/Vec3Math";

const JUMP_VERTICAL_VELOCITY_THRESHOLD = 1.5;
const BALL_HIT_VELOCITY_DELTA_THRESHOLD = 6;
const PAD_NEAR_PLAYER_DISTANCE = 18;

const COUNTDOWN_VALUE_BY_STATE: Partial<Record<MatchState, 3 | 2 | 1 | "GO">> = {
  COUNTDOWN_3: 3,
  COUNTDOWN_2: 2,
  COUNTDOWN_1: 1,
  COUNTDOWN_GO: "GO"
};

/**
 * Retro audio module spec section 18: "Physics events should be converted
 * into normalised audio events by an adapter" — this is that adapter. It
 * observes existing physics/game-flow state each render frame (the same
 * "diff public observations, don't add new engine events" approach
 * `VfxModule` uses) and calls `audio.consumeEvent(...)`; the audio module
 * itself never reaches into physics/game-flow directly (spec section 3:
 * "the audio module does not own deciding whether a collision occurred").
 * Deliberately duplicates a little detection logic already present in
 * `VfxModule` (boost consumption, ball-impact velocity delta) rather than
 * introducing a cross-module dependency between VFX and audio — see
 * docs/audio-deviations.md.
 */
export class AudioEventAdapter implements RenderFrameModule {
  private readonly previousGrounded = new Map<CarId, boolean>();
  private readonly previousDodgeActive = new Map<CarId, boolean>();
  private readonly previousBoostAmount = new Map<CarId, number>();
  private readonly previousPadActive = new Map<string, boolean>();
  private previousBallVelocity: V.Vec3Like = { x: 0, y: 0, z: 0 };
  private previousMatchState: MatchState | null = null;
  private previousPlayerScore = 0;
  private previousOpponentScore = 0;

  public constructor(
    private readonly physics: PhysicsFacade,
    private readonly gameFlow: Pick<MatchFlowController, "getSessionState">,
    private readonly audio: AudioModule
  ) {}

  public updateRenderFrame(context: RenderFrameContext): void {
    for (const carId of [PLAYER_CAR_ID, OPPONENT_CAR_ID] as const) {
      this.detectJumpAndDodge(carId);
      this.detectBoostState(carId);
    }
    this.detectBallHit();
    this.detectBoostPadEvents();
    this.detectMatchStateEvents();

    this.audio.update({
      frameDeltaSeconds: context.frameDeltaSeconds,
      matchPaused: this.gameFlow.getSessionState().matchState === "PAUSED",
      // Page Visibility, not `document.hasFocus()`: focus flickers on
      // unrelated events (devtools, alt-tab to another window while the
      // tab stays visible, automated/headless browser focus quirks) and
      // would spuriously kill continuous voices; visibility change is the
      // actual "tab backgrounded" signal games should react to.
      windowFocused: typeof document === "undefined" ? true : document.visibilityState === "visible"
    });
  }

  private detectJumpAndDodge(carId: CarId): void {
    const car = this.physics.getCarState(carId);

    const wasGrounded = this.previousGrounded.get(carId) ?? car.grounded;
    if (wasGrounded && !car.grounded && car.linearVelocity.y > JUMP_VERTICAL_VELOCITY_THRESHOLD) {
      this.audio.consumeEvent({ type: "audio:jump", carId });
    }
    this.previousGrounded.set(carId, car.grounded);

    const wasDodging = this.previousDodgeActive.get(carId) ?? false;
    const isDodging = car.dodgeState === "active";
    if (isDodging && !wasDodging) {
      this.audio.consumeEvent({ type: "audio:dodge", carId });
    }
    this.previousDodgeActive.set(carId, isDodging);
  }

  private detectBoostState(carId: CarId): void {
    const car = this.physics.getCarState(carId);
    const previous = this.previousBoostAmount.get(carId) ?? car.boostAmount;
    const consuming = previous - car.boostAmount > 0.05;
    this.previousBoostAmount.set(carId, car.boostAmount);

    this.audio.consumeEvent({
      type: "audio:boost-state",
      carId,
      active: consuming,
      boostAmount: car.boostAmount
    });
  }

  private detectBallHit(): void {
    const ball = this.physics.getBallState();
    const delta = V.length(V.sub(ball.linearVelocity, this.previousBallVelocity));
    this.previousBallVelocity = ball.linearVelocity;

    if (delta < BALL_HIT_VELOCITY_DELTA_THRESHOLD) {
      return;
    }

    const intensity = Math.min(1, delta / 30);
    this.audio.consumeEvent({
      type: "audio:ball-hit",
      tick: 0,
      intensity,
      relativeSpeed: delta,
      position: ball.position
    });
  }

  private detectBoostPadEvents(): void {
    const player = this.physics.getCarState(PLAYER_CAR_ID);

    for (const pad of this.physics.getBoostPadStates()) {
      const wasActive = this.previousPadActive.get(pad.id) ?? pad.active;
      const distance = V.length(V.sub(pad.position, player.position));
      const nearPlayer = distance <= PAD_NEAR_PLAYER_DISTANCE;

      if (wasActive && !pad.active) {
        this.audio.consumeEvent({
          type: "audio:boost-pad-pickup",
          padId: pad.id,
          padType: pad.type,
          nearPlayer
        });
      } else if (!wasActive && pad.active) {
        this.audio.consumeEvent({
          type: "audio:boost-pad-respawn",
          padId: pad.id,
          padType: pad.type,
          nearPlayer
        });
      }
      this.previousPadActive.set(pad.id, pad.active);
    }
  }

  private detectMatchStateEvents(): void {
    const session = this.gameFlow.getSessionState();
    const state = session.matchState;
    const enteredState = state !== this.previousMatchState;

    if (enteredState) {
      const countdownValue = COUNTDOWN_VALUE_BY_STATE[state];
      if (countdownValue !== undefined) {
        this.audio.consumeEvent({ type: "audio:countdown", value: countdownValue });
      }
      if (state === "GOAL_CELEBRATION") {
        const playerScored = session.playerScore > this.previousPlayerScore;
        const opponentScored = session.opponentScore > this.previousOpponentScore;
        const scoringTeam: TeamId = playerScored && !opponentScored ? "player" : "opponent";
        this.audio.consumeEvent({ type: "audio:goal", scoringTeam });
      }
      if (state === "OVERTIME_INTRO") {
        this.audio.consumeEvent({ type: "audio:overtime" });
      }
      if (state === "MATCH_RESULTS") {
        this.audio.consumeEvent({ type: "audio:match-end", winner: session.winner });
      }
    }

    this.previousMatchState = state;
    this.previousPlayerScore = session.playerScore;
    this.previousOpponentScore = session.opponentScore;
  }

  public dispose(): void {
    this.previousGrounded.clear();
    this.previousDodgeActive.clear();
    this.previousBoostAmount.clear();
    this.previousPadActive.clear();
  }
}
