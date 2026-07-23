import { RL_CONSTANTS } from "@/physics/PhysicsConstants";

export const MATCH_FLOW_CONTRACT_VERSION = "1.1";

export const PLAYER_CAR_ID = "car-player";
export const OPPONENT_CAR_ID = "car-opponent";

/** game-flow spec section 27: countdown timing, in fixed 120Hz ticks. */
export const COUNTDOWN_STEP_TICKS = Math.round(1.0 * RL_CONSTANTS.physicsHz);
export const COUNTDOWN_GO_TICKS = Math.round(0.75 * RL_CONSTANTS.physicsHz);

/** game-flow spec section 4: 2.2s goal celebration before reset. */
export const GOAL_CELEBRATION_TICKS = Math.round(2.2 * RL_CONSTANTS.physicsHz);

/** game-flow spec section 32: 1.5s overtime intro. */
export const OVERTIME_INTRO_TICKS = Math.round(1.5 * RL_CONSTANTS.physicsHz);

export const DEFAULT_MATCH_DURATION_MINUTES = 3;

/**
 * game-flow spec section 29 dead-ball condition:
 * `ballHasFloorContact && ballVerticalSpeed <= 1.0`. Physics does not
 * currently expose a dedicated floor-contact flag for the ball (only for
 * cars, via suspension), so this is approximated from the ball's own
 * serialisable state: resting height (position.y within this tolerance of
 * the floor-contact height) and a low vertical speed. See
 * docs/physics-deviations.md Phase 7 section.
 */
export const BALL_FLOOR_CONTACT_HEIGHT_TOLERANCE = 0.05;
export const BALL_FLOOR_CONTACT_MAX_VERTICAL_SPEED = 1.0;
