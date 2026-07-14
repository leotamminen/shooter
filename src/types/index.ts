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
    | "password_lock"
    | "computer_part"
    | "decoration";
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
  // id in content/terminals.ts, the terminal this lock is checked against
  // (see secretField below for which of that terminal's fields). Separate
  // from linkedTo because a password lock has two distinct relationships
  // (which door, which terminal) -- unlike button/wall_buy, which only
  // ever have one. Not read at all when secretField is "vaultPin".
  requiresPart?: string; // "terminal" only (checkpoint 19): a computer_part
  // entity's id. When set, interacting with this terminal before that part
  // has been collected (its mesh is still visible) shows a short flavor
  // message instead of opening the Terminal overlay.
  secretField?: "password" | "vaultPin" | "username"; // "password_lock"
  // only (checkpoint 19, corrected same checkpoint): which value this lock
  // checks the player's input against. "password" (the default when this
  // field is absent) checks the linked terminal's static
  // TerminalDef.password -- unchanged checkpoint-17 behavior. "vaultPin"
  // checks Campaign's live, per-run vault pin instead of anything on a
  // TerminalDef -- unchanged checkpoint-19 behavior, previously gated by a
  // now-removed checksVaultPin boolean. "username" checks the linked
  // terminal's TerminalDef.username -- new this correction, used by Room
  // 3's identity lock. A literal union, not a generalized "secret source"
  // abstraction, since there are exactly three known cases.
  promptLabel?: string; // "password_lock" only (checkpoint 19, corrected
  // same checkpoint): the overlay's prompt text. Defaults to
  // ui/PasswordLock.ts's own generic label when absent -- Room 1's and the
  // vault's locks don't set this.
  variant?: "crate" | "debris" | "desk" | "chair" | "outlet"; // "decoration"
  // only (checkpoint 20, "desk"/"chair" added in the same checkpoint's
  // addendum, "outlet" added by the boot-sequence follow-up): a cosmetic
  // hint controlling which prop shape gets built -- "crate"/"debris"/
  // "outlet" are a single sized/colored cube (outlet reuses
  // PASSWORD_LOCK_SIZE for its dimensions rather than either decoration
  // size), "desk"/"chair" are a small THREE.Group of several boxes (see
  // MapEntitySystem.ts's createDeskDecoration()/createChairDecoration()).
  // No gameplay meaning either way. Absent defaults to "crate".
  rotationY?: number; // checkpoint 20 (corrected same checkpoint): a
  // generic Y-axis facing, in DEGREES (not radians -- friendlier for a
  // hand-edited content file), defaulting to 0 (unchanged facing) when
  // absent. createTerminal() and, as of the checkpoint-20 addendum,
  // createDeskDecoration()/createChairDecoration() read this -- every
  // other create*() method's geometry is a horizontally symmetric cube, so
  // a Y-rotation would have zero visible effect on it today. The field
  // itself is generic and available to any future entity type once its
  // geometry is genuinely asymmetric; see CLAUDE.md's decisions log.
  outletPosition?: [number, number, number]; // "terminal" only, and only
  // meaningful alongside requiresPart (checkpoint 20 boot-sequence
  // follow-up): the world position of the wall outlet this terminal's
  // connecting cable should route to once it powers on. Kept in sync by
  // hand with the matching "outlet" decoration entity's own position --
  // both are manually positioned in content/maps.ts, the same as
  // everything else in this room right now.
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
  password?: string; // checked by ui/PasswordLock.ts against the linked
  // "password_lock" MapEntity's input, when that lock's secretField is
  // "password" (the default -- see MapEntity.secretField). Also (via
  // template-literal interpolation, not a second hardcoded copy) appears
  // inside root's file tree somewhere, so the player can find it
  // in-fiction via cat. Optional as of checkpoint 19 -- room2_terminal has
  // no password to guard (its only purpose is the "whoami" command).
  username?: string; // read by ui/Terminal.ts's "whoami" command, and by a
  // "password_lock" whose secretField is "username" (checkpoint 19,
  // corrected same checkpoint -- see Room 3's identity lock). Only
  // room2_terminal sets this; room1_terminal leaves it undefined.
  unlockedCommands?: string[]; // checkpoint 19 (corrected same checkpoint):
  // names from content/terminalCommands.ts's RESTRICTED_COMMANDS that THIS
  // specific terminal allows -- the mechanism a future checkpoint will use
  // to make e.g. "ping" actually work in one particular room's terminal,
  // without touching ui/Terminal.ts or content/terminalCommands.ts's
  // BLOCKED_COMMANDS at all. No current TerminalDef sets this; no
  // restricted command has real behavior yet even when unlocked.
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
