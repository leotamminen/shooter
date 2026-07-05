import type { EnemyDef } from "../types";

export const ENEMIES: EnemyDef[] = [
  {
    id: "zombie",
    health: 100,
    speed: 1.6,
    meleeDamage: 10,
    attackInterval: 1,
    sightRange: 15,
    meleeRange: 1.5,
    growlInterval: 3,
    growlSoundId: "zombie_growl",
    deathSoundId: "zombie_death",
  },
];
