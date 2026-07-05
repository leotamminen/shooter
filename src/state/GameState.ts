export interface EnemyHealthEntry {
  current: number;
  max: number;
  position: { x: number; y: number; z: number };
}

// String union, not a boolean: a future "downed" value sits between these
// two (perk-gated revive state), so a boolean would force a breaking change
// later. Not building "downed" yet — see CLAUDE.md's future-mechanics section.
export type PlayerLifeState = "alive" | "dead";

export class GameState {
  paused = true;

  weaponName = "";
  currentAmmo = 0;
  reserveAmmo = 0;
  isReloading = false;

  canInteract = false;

  playerHealth = 100;
  playerState: PlayerLifeState = "alive";

  // Keyed by enemy id so multiple simultaneous enemies (checkpoint 7+) don't
  // need a rewrite here.
  enemyHealth: Record<string, EnemyHealthEntry> = {};
}
