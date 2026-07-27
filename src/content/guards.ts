import type { GuardDef } from "../types";

// Pathfinding+Guard follow-up: first-cut values, meant to be tuned by
// playtesting like every other piece of combat balance in this project
// (e.g. the knife/gun round-scaling constants in modes/ZombieSurvival.ts).
export const GUARDS: GuardDef[] = [
  {
    id: "guard",
    name: "Guard",
    // Lower than the zombie's 100 -- a guard's threat is meant to come
    // from ranged harassment while it closes distance via pathfinding, not
    // from being a tough wall to melee through once actually reached.
    health: 60,
    // Slightly faster than the zombie's 1.6 -- it's actively pathing
    // toward the player rather than only closing in once already sighted.
    moveSpeed: 1.8,
    fireRange: 10,
    // Low -- roughly 17 hits to kill the player outright (100 / 6), so
    // this enemy should not be a major threat on its own.
    damage: 6,
    fireCooldownMin: 2, // "max once per 2s" per spec
    fireCooldownMax: 3.2, // some variance so firing doesn't feel robotic
    // Noticeably imperfect (per spec, "around 0.3-0.4") but still a real
    // threat over a sustained engagement.
    missChance: 0.35,
  },
];
