export interface Weapon {
  id: string;
  name: string; // player-facing display text, e.g. "M1911" (id stays the lookup key)
  damage: number;
  fireRate: number; // seconds between shots
  magSize: number;
  reloadTime: number; // seconds
  startingReserveAmmo: number;
  fireSoundId: string; // references SoundDef.id
  model?: string; // path to .glb, added when 3D models exist
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
    | "objective";
  position: [number, number, number];
  linkedTo?: string; // e.g. a door linked to the button that opens it
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
