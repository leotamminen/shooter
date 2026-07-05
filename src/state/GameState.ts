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

  addScore(amount: number): void {
    this.score += amount;
    this.pointsBalance += amount;
  }

  // Keyed by enemy id so multiple simultaneous enemies (checkpoint 7+) don't
  // need a rewrite here.
  enemyHealth: Record<string, EnemyHealthEntry> = {};
}
