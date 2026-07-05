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

  // score is a permanent total, never decreased. pointsBalance is the future
  // spendable currency for wall-buys etc — they start identical but will
  // diverge once spending exists (checkpoint 6+). Do not conflate them later.
  score = 0;
  pointsBalance = 0;

  // Mirrored from ZombieSurvival.currentRound every time it changes, so HUD
  // can read it like every other stat (systems write to GameState, HUD only
  // reads). roundsSurvived is a separate snapshot taken once at the moment
  // of death (see main.ts's onDeath wiring) — kept distinct from the live
  // currentRound so the death panel can't change mid-display if a round
  // happens to advance in the background while the death panel is up.
  currentRound = 1;
  roundsSurvived = 1;

  addScore(amount: number): void {
    this.score += amount;
    this.pointsBalance += amount;
  }

  resetScore(): void {
    this.score = 0;
    this.pointsBalance = 0;
  }

  // Keyed by enemy id so multiple simultaneous enemies (checkpoint 7+) don't
  // need a rewrite here.
  enemyHealth: Record<string, EnemyHealthEntry> = {};
}
