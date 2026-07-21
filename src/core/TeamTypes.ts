/**
 * Shared team identifier (game-flow spec section 4: "player at negative Z,
 * opponent at positive Z"). Lives in `@/core` (no dependencies) so both
 * `@/physics` and `@/game-flow` can depend on it without violating the
 * architecture rule that physics may not import `@/game-flow`.
 */
export type TeamId = "player" | "opponent";

export function otherTeam(team: TeamId): TeamId {
  return team === "player" ? "opponent" : "player";
}
