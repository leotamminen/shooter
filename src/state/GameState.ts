export interface EnemyHealthEntry {
  current: number;
  max: number;
  position: { x: number; y: number; z: number };
}

// String union, not a boolean: a future "downed" value sits between these
// two (perk-gated revive state), so a boolean would force a breaking change
// later. Not building "downed" yet — see CLAUDE.md's future-mechanics section.
export type PlayerLifeState = "alive" | "dead";

export const PLAYER_MAX_HEALTH = 100;

export class GameState {
  paused = true;

  weaponName = "";
  currentAmmo = 0;
  reserveAmmo = 0;
  isReloading = false;

  canInteract = false;

  playerHealth = PLAYER_MAX_HEALTH;
  playerState: PlayerLifeState = "alive";

  // score is a permanent total, never decreased. pointsBalance is the real
  // spendable currency (spendPoints() below is the only decrementer) — they
  // start identical and only diverge once the player actually spends. Do not
  // conflate them.
  score = 0;
  pointsBalance = 0;

  addScore(amount: number): void {
    this.score += amount;
    this.pointsBalance += amount;
  }

  resetScore(): void {
    this.score = 0;
    this.pointsBalance = 0;
  }

  // The only mutator that ever decrements pointsBalance — addScore() only
  // ever increases both score and pointsBalance together, so this is where
  // the two numbers can finally diverge. score (the permanent total) is
  // never touched here.
  spendPoints(amount: number): boolean {
    if (this.pointsBalance < amount) return false;
    this.pointsBalance -= amount;
    return true;
  }

  // Keyed by enemy id so multiple simultaneous enemies (checkpoint 7+) don't
  // need a rewrite here.
  enemyHealth: Record<string, EnemyHealthEntry> = {};

  // Snapshot of the active GameMode's getSummaryLines(), taken once at the
  // moment playerState transitions to "dead" (see main.ts's onDeath wiring),
  // not read live every frame — this is what keeps the death panel's numbers
  // from shifting under the player while it's displayed. Deliberately a
  // plain string array, not a mode-specific field, so HUD stays ignorant of
  // which GameMode is active.
  deathSummaryLines: string[] = [];

  // Checkpoint 20: per-entity hover text, written every frame by
  // InteractSystem from whatever interactable the player is currently
  // looking at (or null when not looking at one). ui/HUD.ts reads this
  // instead of a hardcoded generic string, matching this project's
  // established "HUD reads only GameState" rule (see decisions log) —
  // InteractSystem, not MapEntitySystem, is the one direct writer, since
  // it's the system that already knows what the player is looking at each
  // frame.
  interactPromptText: string | null = null;

  // Checkpoint 20: a transient, HUD-owned on-screen message for
  // blocked/failed interactions (insufficient points, a gated terminal,
  // etc.). Gameplay code calls showFeedback() to set it; ui/HUD.ts owns
  // clearing it back to null after a fixed display duration (see
  // ui/HUD.ts's updateFeedbackMessage()), the same "HUD owns presentation
  // timing, not gameplay logic" pattern already used for the reload-prompt
  // delay.
  feedbackMessage: string | null = null;

  showFeedback(text: string): void {
    this.feedbackMessage = text;
  }
}
