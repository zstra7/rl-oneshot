/** Retro audio module spec section 13. */
export type AudioCooldownKey = string;

/**
 * Tracks per-key cooldowns so rapid duplicate events (multi-contact
 * solver spam, held navigate keys) don't spam sounds. `canPlay` also
 * merges repeated events within the cooldown window by keeping the
 * strongest one — a caller passes the new event's `strength`, and if a
 * stronger one already "won" the current window, the weaker follow-up is
 * suppressed even though `canPlay` would otherwise allow a fresh key.
 */
export class AudioCooldownRegistry {
  private readonly lastPlayedAt = new Map<AudioCooldownKey, number>();
  private readonly windowStrength = new Map<AudioCooldownKey, number>();

  public canPlay(key: AudioCooldownKey, now: number, cooldownSeconds: number, strength = 1): boolean {
    const last = this.lastPlayedAt.get(key);
    if (last === undefined || now - last >= cooldownSeconds) {
      this.lastPlayedAt.set(key, now);
      this.windowStrength.set(key, strength);
      return true;
    }

    const currentStrength = this.windowStrength.get(key) ?? 0;
    if (strength > currentStrength) {
      // A stronger event arrives inside the same cooldown window: it
      // "wins" the merge, but does not restart the cooldown timer itself
      // (spec: "merge repeated impacts... by keeping the strongest").
      this.windowStrength.set(key, strength);
      return true;
    }

    return false;
  }

  public get size(): number {
    return this.lastPlayedAt.size;
  }

  public clear(): void {
    this.lastPlayedAt.clear();
    this.windowStrength.clear();
  }
}
