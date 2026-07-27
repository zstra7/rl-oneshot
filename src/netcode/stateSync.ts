import type { MatchAuthorityState } from "@/game-flow/MatchFlowTypes";
import type { WorldNetSnapshot } from "@/physics/WorldSnapshot";

/**
 * S2 (online state-sync netcode): the host-authoritative snapshot the guest
 * converges to. It bundles the full physics world (S1) with the match-flow
 * decisions only the host is allowed to make — score, clock, phase, and the
 * kickoff-variant counter — so the two screens can never disagree about a
 * goal or the time remaining.
 *
 * The wire form is JSON inside a single typed packet on the same unreliable
 * DataChannel as inputs. At ~20-30Hz a snapshot is a few KB; correctness and
 * simplicity beat the byte-squeezing a hand-rolled binary layout would buy,
 * and every field here is a plain number/boolean/string so `JSON` round-trips
 * it losslessly.
 */
export type { MatchAuthorityState };

export interface StateSyncSnapshot {
  /** The host's authoritative simulation tick this snapshot was taken at. */
  readonly tick: number;
  readonly world: WorldNetSnapshot;
  readonly flow: MatchAuthorityState;
}

/**
 * A minimal structural check so a corrupt or hostile peer can never crash the
 * guest by sending a malformed snapshot — it's dropped, and the last good
 * snapshot (plus local prediction) carries the guest until the next one.
 */
export function isStateSyncSnapshot(value: unknown): value is StateSyncSnapshot {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const snap = value as Partial<StateSyncSnapshot>;
  if (typeof snap.tick !== "number" || typeof snap.world !== "object" || snap.world === null) {
    return false;
  }
  if (typeof snap.flow !== "object" || snap.flow === null) {
    return false;
  }
  const world = snap.world as Partial<WorldNetSnapshot>;
  return Array.isArray(world.cars) && typeof world.ball === "object" && world.ball !== null && Array.isArray(world.pads);
}
