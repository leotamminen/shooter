// Development-only toggles. None of these are meant to ship in the
// finished game -- set to false (or delete this file and its call sites)
// before any real release build.
export const SHOW_DEV_COORDINATES = true;

// core/EnemyAI.ts's update() checks this and skips all movement/attack
// logic when true, leaving each instance idle wherever it currently is
// (health/damage/death are unaffected -- those are driven externally via
// mesh.userData.onHit, never from anything update() itself does). If
// core/GuardAI.ts (not built yet) ever exists, its update() should get the
// identical check -- this flag is meant to freeze every enemy type, not
// just EnemyAI specifically.
export const FREEZE_ENEMIES = false;

// core/PlayerController.ts's update() checks this and skips its collision
// resolution entirely when true -- free movement through walls/doors/
// decorations, movement speed/controls otherwise unchanged.
export const NOCLIP = true;
