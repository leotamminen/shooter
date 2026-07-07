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
  // MAC-10 (checkpoint 15): the first full-auto weapon. No new firing
  // mechanics needed -- WeaponSystem.update() already fires repeatedly at
  // weapon.fireRate for as long as mouse1 is held (this is what already
  // makes the pistol "semi-auto-feeling" at fireRate 0.3; a much smaller
  // fireRate is the same mechanism read as full-auto). damage is
  // deliberately lower than the pistol's per-shot 10 -- the standard
  // SMG-vs-pistol tradeoff of lower per-hit damage offset by much higher
  // fire rate. fireRate/reloadTime are first-cut values, tuned by manual
  // verification (Task 2) rather than derived from a formula.
  {
    id: "mac10",
    name: "MAC-10",
    damage: 8,
    fireRate: 0.08,
    magSize: 30,
    reloadTime: 1.2,
    startingReserveAmmo: 240,
    cost: 1200,
    fireSoundId: "pistol_fire",
  },
];
