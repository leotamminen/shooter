import type { Weapon } from "../types";

export const WEAPONS: Weapon[] = [
  {
    id: "pistol",
    name: "M1911",
    damage: 10,
    fireRate: 0.3,
    magSize: 12,
    reloadTime: 1.5,
    startingReserveAmmo: 48,
    cost: 500,
    fireSoundId: "pistol_fire",
  },
];
