export interface Weapon {
  id: string;
  name: string; // player-facing display text, e.g. "M1911" (id stays the lookup key)
  damage: number;
  fireRate: number; // seconds between shots (ranged) or between swings (melee) -- same field, same "cooldown between uses" semantics either way
  magSize?: number; // ranged only (checkpoint 16 made this optional so a melee weapon, which has none, can share this same interface/content array rather than a parallel type/system)
  reloadTime?: number; // ranged only, seconds
  startingReserveAmmo?: number; // ranged only
  cost: number; // pointsBalance price at a "wall_buy" MapEntity linked to this weapon's id -- still required even for melee weapons not linked from any wall_buy (see content/weapons.ts's knife entry for why)
  fireSoundId: string; // references SoundDef.id
  model?: string; // path to .glb, added when 3D models exist
  meleeRange?: number; // melee only (checkpoint 16) -- presence of this field IS the ranged-vs-melee discriminator: a Weapon with meleeRange set is melee, one without is ranged. No separate "kind"/"type" tag, to avoid two fields that could disagree with each other.
}

export interface EnemyDef {
  id: string;
  health: number;
  speed: number;
  meleeDamage: number;
  attackInterval: number; // seconds between melee attacks
  sightRange: number;
  meleeRange: number;
  growlInterval: number; // seconds between growls while chasing
  growlSoundId: string; // references SoundDef.id
  deathSoundId: string; // references SoundDef.id
  model?: string;
}

export interface MapEntity {
  id: string;
  type:
    | "door"
    | "button"
    | "pickup"
    | "spawn"
    | "enemy_spawn"
    | "target"
    | "objective"
    | "wall_buy"
    | "terminal"
    | "password_lock";
  position: [number, number, number];
  linkedTo?: string; // a related entity's id (e.g. button -> door), or for
  // "wall_buy", a Weapon id in content/weapons.ts, or for "terminal", a
  // TerminalDef id in content/terminals.ts, or for "password_lock", the
  // linked door's MapEntity id (same pattern "button" already uses)
  cost?: number; // "button" only (checkpoint 12): pointsBalance price to open
  // the linked door; absent/undefined means free, same as every button
  // before this checkpoint. Unrelated to "wall_buy"'s price, which comes
  // from Weapon.cost, not this field.
  terminalId?: string; // "password_lock" only (checkpoint 17): a TerminalDef
  // id in content/terminals.ts, the terminal whose password this lock
  // checks against. Separate from linkedTo because a password lock has two
  // distinct relationships (which door, which terminal) -- unlike
  // button/wall_buy, which only ever have one.
}

export interface MapDef {
  id: string;
  name: string; // player-facing display text, e.g. "Corridors" (id stays the lookup key)
  grid: number[][]; // 0 = floor, 1 = wall
  entities: MapEntity[];
  supportedModes?: string[]; // checkpoint 17: if present, ui/MainMenu.ts's
  // Map group only allows selecting this map when the currently-selected
  // mode's id is in this list (mirrors the Enemy group's existing
  // mode-based graying). undefined (test-grid, corridors) means
  // mode-agnostic, selectable under any mode -- unchanged from before this
  // checkpoint.
}

// A tiny fake filesystem for the checkpoint-17 hacking-terminal minigame
// (ui/Terminal.ts navigates it with ls/cd/cat). Deliberately a plain
// recursive tree, not a flat path-keyed map -- "cd" needs a real directory
// to descend into and a real parent to pop back to.
export interface TerminalFile {
  name: string;
  content: string;
}

export interface TerminalDirectory {
  name: string;
  files: TerminalFile[];
  directories: TerminalDirectory[];
}

export interface TerminalDef {
  id: string;
  password: string; // checked by ui/PasswordLock.ts against the linked
  // "password_lock" MapEntity's input. Also (via template-literal
  // interpolation, not a second hardcoded copy) appears inside root's file
  // tree somewhere, so the player can find it in-fiction via cat.
  root: TerminalDirectory;
}

export interface SoundDef {
  id: string;
  path: string; // e.g. "/sounds/pistol_fire.ogg"
  volume: number;
  positional: boolean;
  loop: boolean;
}

export interface Loadout {
  weaponIds: string[];
}
