// Development-only toggles. None of these are meant to ship in the
// finished game -- set to false (or delete this file and its call sites)
// before any real release build.

// NOCLIP hotkey follow-up: the single master switch for every runtime dev
// hotkey (starting with the N-key NOCLIP toggle below) -- checked fresh on
// every keypress, not cached at startup, so flipping this constant to false
// before a real release fully disables player-accessible dev controls with
// no code deleted. Display-only dev tools (SHOW_DEV_COORDINATES, this
// file's other flags) are unaffected by this switch -- it only gates
// runtime *input* that could change behavior mid-session.
export const DEV_MODE = true;

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
// NOCLIP hotkey follow-up: `let`, not `const` -- toggleNoclip() below
// mutates this binding in place from inside its own module, so main.ts's
// N-key handler (gated on DEV_MODE) can flip it live at runtime without
// reaching into this module's internals. A runtime toggle only changes the
// in-memory value, never this file on disk -- every fresh page load still
// starts from this declared default.
export let NOCLIP = true;

// Importers call this, never `NOCLIP = ...` directly -- keeps every write
// to the binding funneled through one place, the same "one sanctioned
// mutator" discipline this project already applies to GameState's
// score/pointsBalance fields.
export function toggleNoclip(): void {
  NOCLIP = !NOCLIP;
}
