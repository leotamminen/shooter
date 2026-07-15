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
    // Checkpoint 21: first-guess fire-kick strength, tuned by eye in-browser
    // -- a small, snappy kick befitting a semi-auto pistol, clearly weaker
    // than the MAC-10's below.
    kickStrength: 0.3,
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
    // Checkpoint 21: noticeably larger than the pistol's 0.3 -- individually
    // small per-shot at this fireRate, but stacks fast under full-auto fire
    // (see WeaponSystem.fire()'s onFire() call and ImpulseOffset's own
    // summed-magnitude clamp). First-guess value, tuned by eye in-browser.
    kickStrength: 0.8,
  },
  // Knife (checkpoint 16): the first melee weapon -- no magSize/reloadTime/
  // startingReserveAmmo (all now optional on Weapon), meleeRange present
  // instead, which is what marks this as melee rather than ranged.
  //
  // damage: 100 is NOT an arbitrary choice -- it is deliberately exactly
  // equal to content/enemies.ts's zombie EnemyDef.health (100). Round N's
  // scaled zombie health is enemyDef.health * N (see
  // modes/ZombieSurvival.ts's healthForRound()), so with knife damage also
  // at exactly 100, round N always takes exactly N knife hits to kill a
  // zombie -- that's the explicit design goal, not a coincidence. If either
  // number ever changes, the other must change with it, or this property
  // breaks silently. See CLAUDE.md's checkpoint-16 decisions log.
  //
  // cost: 0 is a placeholder -- Weapon.cost is a required field, but no
  // wall_buy links to "knife" (none is planned; the knife is always
  // available, not purchasable), so this value is never actually read.
  //
  // fireRate here means the melee attack's cooldown (also its effective
  // duration) -- V triggers one instant attack, then this many seconds
  // must pass before V can trigger another. Was 0.5 (an earlier
  // mid-checkpoint correction from an original 0.8 "swing while held"
  // framing), raised to 1 after manual testing found 0.5 still read as too
  // fast -- see CLAUDE.md's checkpoint-16 decisions log.
  {
    id: "knife",
    name: "Knife",
    damage: 100,
    fireRate: 1,
    meleeRange: 2,
    cost: 0,
    fireSoundId: "melee_hit",
  },
];
