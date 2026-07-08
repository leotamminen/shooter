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
    | "wall_buy";
  position: [number, number, number];
  linkedTo?: string; // a related entity's id (e.g. button -> door), or for
  // "wall_buy", a Weapon id in content/weapons.ts
  cost?: number; // "button" only (checkpoint 12): pointsBalance price to open
  // the linked door; absent/undefined means free, same as every button
  // before this checkpoint. Unrelated to "wall_buy"'s price, which comes
  // from Weapon.cost, not this field.
}

export interface MapDef {
  id: string;
  name: string; // player-facing display text, e.g. "Corridors" (id stays the lookup key)
  grid: number[][]; // 0 = floor, 1 = wall
  entities: MapEntity[];
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
