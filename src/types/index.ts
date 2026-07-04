export interface Weapon {
  id: string;
  damage: number;
  fireRate: number; // seconds between shots
  magSize: number;
  reloadTime: number; // seconds
  fireSoundId: string; // references SoundDef.id
  model?: string; // path to .glb, added when 3D models exist
}

export interface EnemyDef {
  id: string;
  health: number;
  speed: number;
  growlSoundId: string; // references SoundDef.id
  deathSoundId: string; // references SoundDef.id
  model?: string;
}

export interface MapEntity {
  type: "door" | "button" | "pickup" | "spawn" | "objective";
  position: [number, number, number];
  linkedTo?: string; // e.g. a door linked to the button that opens it
}

export interface MapDef {
  id: string;
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
