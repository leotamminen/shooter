# shooter

Lightweight browser FPS, box-based levels, data-driven content. Three.js/Vite/TS.

## Architecture rules (non-negotiable)

- `core/` never references `content/` or `modes/` directly — it only consumes typed interfaces.
- All game content (weapons, enemies, maps, sounds) lives in `content/*.ts` as typed data, never hardcoded in logic.
- New game modes are built hardcoded first; a `GameMode` interface is only extracted once a second mode proves the shape is right.
- No physics engine — manual collision only; player is represented as a radius/circle (not a box), since later systems (pickup range, melee range) will want a "distance from player" concept anyway.
- Single-responsibility per file: one class/system per file, file name matches it; split by responsibility, not by line count — a file mixing unrelated concerns must be split regardless of length; if a file's job needs "and" to describe, it's two files.
- Shared/reusable logic (math helpers, raycasting, state machines) goes in `core/utils/`, never duplicated inline.

## Workflow rule

`git init` at project start if not already a repo. Commit at the end of every checkpoint with a message naming which checkpoint was completed. This applies to every future session, not just this one.

## Folder structure

Full intended tree for the whole project, annotated with which checkpoint introduces each file. This is documentation only — files are created when the checkpoint that needs them is reached, not before. This tree is the single source of truth for where future files go.

```
src/
  main.ts                       [1]
  content/
    weapons.ts                  [1, populated at 5]
    enemies.ts                  [1, populated at 5]
    maps.ts                     [1, populated at 5]
    sounds.ts                   [1, populated across 2/4/9]
  core/
    Scene.ts                    [1]
    PlayerController.ts         [1]
    MapLoader.ts                [1, getSpawnPosition() added at 5]
    WeaponSystem.ts             [2]
    InteractSystem.ts           [3]
    EnemyAI.ts                  [4]
    AudioSystem.ts              [2]
    PlayerState.ts              [4.5, player health/lifecycle — see decisions log]
    RunManager.ts               [4.8, registry of reset() hooks + score reset, run on new-run start]
    utils/
      Raycast.ts                [1]
      StateMachine.ts           [4]
      Health.ts                 [4.5]
      Lookup.ts                 [5, generic findById<T>() for content arrays]
  modes/
    GameMode.ts                 [8]
    ZombieSurvival.ts           [7]
    ShootingRange.ts            [8]
  state/
    GameState.ts                [1]
  ui/
    HUD.ts                      [3.5, gameplay overlay: crosshair/ammo/reload/interact prompts]
                                 [9 adds separate menu screens here: mode select, loadout, enemy select]
  types/
    index.ts                    [1]
```

## Checkpoints

1. Vite+TS+Three.js scaffold, box room, PointerLockControls, WASD + manual radius-vs-wall collision
2. Hitscan shooting (mouse1, raycast) + ammo/reload state + weapon fire sound (AudioSystem)
3. E-interact raycast
3.5. HUD (crosshair, ammo display, reload/interact prompts)
4. One hardcoded zombie: state machine + line-of-sight raycast + zombie sounds
4.5. Enemy health-label occlusion fix + player death handling (alive/dead state)
4.6. Points system (score for hits and kills, displayed in HUD)
4.7. Death screen (score, respawn/main menu buttons) + full HUD suppression on death
4.8. Run reset system (RunManager: score/pointsBalance, weapon ammo, and enemy health/state all reset together on Respawn/Main Menu)
5. content/ files (weapons.ts, enemies.ts, maps.ts, sounds.ts) + id-lookup; move zombie/weapon/map from hardcoded to data-driven
6. Map schema extended with entities (doors, buttons, pickups)
7. ZombieSurvival mode, hardcoded, as its own module in modes/
8. Shooting Range mode added → GameMode interface extracted now that two real modes exist
9. Menus (mode select, loadout, enemy select) + ambience/music

## Current status

Checkpoint 5 complete. The fire sound (`public/sounds/pistol_fire.wav`) and the zombie growl/death sounds (`public/sounds/zombie_growl.wav`, `zombie_death.wav`) are all synthesized placeholders (Node-generated tones), not real recordings — swap them for real audio in a later checkpoint (9, ambience/music, is the natural point to revisit all placeholder audio).

Note: the original checkpoint 4 scope (state machine + line-of-sight + sounds) didn't explicitly cover damage/kill mechanics, and no later checkpoint claimed them either, so they were added at checkpoint 4 rather than left to silently expand checkpoint 7's scope. Player death is now fully playable end-to-end: health hits 0 → `playerState` flips to `"dead"` → pointer lock releases → HUD shows a death panel (score + Respawn/Main Menu buttons) → clicking either starts a new run (score/pointsBalance reset to 0, weapon ammo restored, the zombie restored to full health and idle) and restores full health, alive state, and spawn position, and gameplay resumes with no page reload. What's still deferred: "Main Menu" is currently just an alias for "Respawn" (checkpoint 9 gives it real behavior). See the decisions log and "Future mechanics" below.

The weapon (M1911), enemy (zombie), map (`test-grid`), and sound definitions are now all data in `content/*.ts`, looked up by id from `main.ts` (the composition root) via `findById()` — `core/` still has zero imports from `content/`. The zombie's mesh/geometry and its spawn position in the scene are still hardcoded in `main.ts`, since map entities don't have an "enemy" type yet (checkpoint 6/7 territory). See the decisions log for the `SoundDef.positional`/`AudioSystem` note below — it was already correctly implemented before this checkpoint, not a gap introduced or closed here.

## Decisions log

- No physics engine: manual collision, chosen for full control and zero dependency weight.
- Hitscan only, no projectile physics, for simplicity.
- Player collision is radius-based, not box-based: simpler wall resolution, reusable later as a general distance-from-player check.
- Audio via Three.js native AudioListener/PositionalAudio, no external library.
- Weapon fire sound is non-positional (`SoundDef.positional: false`): heard the same regardless of player position since it's always the local player firing; positional audio is deferred to checkpoint 4 (zombie growls), the first sound that actually needs a 3D source.
- Placeholder fire sound is a synthesized WAV (short decaying sine click), generated programmatically since no real audio asset was available — flagged for replacement, not meant to ship.
- `MapLoader.loadMap()` exposes raw wall meshes (`walls: THREE.Mesh[]`) alongside `wallBoxes` (checkpoint 2): a `Box3` isn't raycastable, so `WeaponSystem` needed the actual scene objects to hit-test against. `InteractSystem` (checkpoint 3) reuses the same `walls` array for its own raycast, combined with whatever interactables are in range — one shared list of "things that can occlude or receive a ray," no duplicate wall representation.
- Interactable objects are tagged via `mesh.userData.interactable = true`, not by name/convention matching, so `InteractSystem`'s check is a plain property lookup regardless of what the object is named.
- Line-of-sight blocking for interact/hitscan comes for free from raycasting against a combined target list (walls + interactables) and taking the nearest hit — no separate occlusion check needed.
- `Weapon.name` added as a separate field from `Weapon.id` — id is the data lookup key, name is player-facing display text.
- HUD (`ui/HUD.ts`) is a plain DOM overlay, not part of the Three.js scene: absolutely positioned, `pointer-events: none` so it never steals clicks from the canvas (pointer lock, firing, interact all still work). It reads only from `GameState`; `WeaponSystem`/`InteractSystem` write their relevant fields to `GameState` every frame. This replaces the checkpoint-2/3 `console.log` observability, which has been removed now that the same information is visible on screen.
- The 1-second delay before showing "Press R to reload" is tracked inside `HUD.ts` itself (a local `emptySince` timestamp), not in `WeaponSystem` or `GameState` — it's presentation timing, not a gameplay rule, so it belongs with the thing that renders it.
- Damage sources use a generic `userData.onHit(damage)` callback on the target mesh, the same pattern as `userData.interactable` — `WeaponSystem` calls whatever hook exists on the object it hit and never imports `EnemyAI`. Any future damageable object (barrels, other enemies) plugs into `WeaponSystem` for free by setting this one field.
- The floating enemy health label (current/max, projected above the enemy's head via `camera.project()`) is a debug/test aid for verifying damage and state transitions, not a final UI choice — it should be replaced with a real health bar, hidden, or otherwise redesigned once the game is closer to presentable. Noted here so it isn't mistaken for a deliberate design decision later. Checkpoint 4.5 fixed a bug where it showed through walls (it's now hidden whenever a wall occludes the enemy or the enemy is behind the camera), but its status as a placeholder is unchanged.
- `core/utils/Health.ts` centralizes "clamp damage at 0, fire a callback exactly once on crossing to zero" as a plain function (`applyDamage(current, amount, onZero?) → number`), not a class — it doesn't own any state itself, the caller still stores the returned value. This is the same reuse reasoning as `Raycast.ts`/`StateMachine.ts`: both the enemy's own health (in `EnemyAI`) and the player's health (in `PlayerState`) route through it instead of duplicating "clamp and detect zero" twice.
- `GameState.playerState` is a string union (`"alive" | "dead"`), not a boolean, because a future `"downed"` value (perk-gated revive, not built yet) sits between them — a boolean would force a breaking type change later. See "Future mechanics" below.
- Player health/lifecycle logic lives in its own file, `core/PlayerState.ts`, rather than in `PlayerController` or `WeaponSystem`: those two are movement-only and firing-only per the single-responsibility rule, and "what happens when health hits zero" isn't either of those things. `PlayerController` and `WeaponSystem` only read `gameState.playerState` to decide whether to no-op; only `PlayerState.applyDamage()` (called by whatever deals the damage, e.g. `EnemyAI`) is allowed to change it.
- Score (`gameState.score`) is awarded from inside `EnemyAI.takeDamage()` — the same method that already routes through `applyDamage()` — rather than from `WeaponSystem`'s generic `onHit` call site: `WeaponSystem` fires the hook on anything with `userData.onHit` (currently only the zombie) and has no notion of "this hit was worth points," so scoring stays with the thing that knows it died, not the thing that pulled the trigger. +10 is applied unconditionally on every processed hit; +50 is applied inside the same `applyDamage()` call's `onZero` callback, so a killing shot stacks both in one `takeDamage()` invocation rather than the two being alternatives.
- `score` is a permanent total, never decreased; `pointsBalance` is the future spendable currency for wall-buys etc. They start identical (both incremented together via `GameState.addScore()`, a single mutator so they can't drift out of sync by accident) but will diverge once spending exists (checkpoint 6+, spending only decrements `pointsBalance`). Do not conflate them later.
- **Superseded at checkpoint 4.8** (was: "`PlayerState.respawn()` deliberately does not touch `score`/`pointsBalance` — only checkpoint 7's round/mode logic should ever decide whether score resets, not the respawn action itself"): a run ends when the player dies, and pressing Respawn or Main Menu starts a new run, which resets `score`/`pointsBalance` to 0. `PlayerState.respawn()` itself is unchanged — it still only resets health/lifecycle (`playerHealth` back to `PLAYER_MAX_HEALTH`, `playerState` back to `"alive"`) and still never touches `score`/`pointsBalance` directly. The reset is orchestrated one level up, by `RunManager.startNewRun()`, which resets score before calling `respawn()`. Position reset remains a separate call to `PlayerController.setSpawn()` from `main.ts`, since `PlayerState` has no reason to know about camera/world position.
- `core/RunManager.ts` is a small registry (`registerResettable(fn)` + `startNewRun()`), not a god-object: it holds no per-type knowledge of weapons, enemies, or anything else. Systems register their own `reset()` closure with it once during their own construction — the same generic-hook pattern already used for `userData.onHit` and `Health.ts`'s `onZero` callback. `startNewRun()` calls every registered `reset()`, then `GameState.resetScore()`, then `PlayerState.respawn()` last, in that order.
- `GameState.resetScore()` was added alongside the existing `addScore()` mutator, for the same reason `addScore()` exists: `score` and `pointsBalance` must never drift out of sync, so both fields are only ever touched together through one of these two methods, never assigned directly by a caller.
- `EnemyAI.die()` now sets `mesh.visible = false` instead of removing the mesh from the scene graph, so `EnemyAI.reset()` (registered with `RunManager`) can bring the zombie back — full health, idle state, spawn position — without recreating geometry/material. This also anticipates checkpoint 7, where "dead, awaiting respawn" and "not yet spawned" need to be distinguishable states once there's more than one enemy.
- `core/utils/Raycast.ts`'s `cast()` now filters intersections down to `object.visible` ones, since three.js's `Raycaster.intersectObjects` does not skip invisible objects on its own. This is what actually excludes a dead (hidden) enemy from `WeaponSystem`'s hitscan, `EnemyAI`'s own line-of-sight check, and `HUD`'s occlusion check — all three get it for free from the one shared utility, with no per-caller "is this thing dead" check needed.
- `PlayerState` takes an optional `onDeath` callback (invoked from inside the same `applyDamage()` zero-crossing that flips `playerState` to `"dead"`) rather than importing `PlayerController` directly. `main.ts` wires it to `playerController.controls.unlock()` — releasing pointer lock is what makes the death panel's buttons clickable, but `PlayerState` has no business knowing about pointer-lock/DOM concerns, so it's handed in as a hook instead of reaching across.
- HUD's death panel is the one part of the HUD tree with `pointer-events: auto` (everything else stays `none`, per the checkpoint-3.5 decision) — it's only visible while dead, so enabling clicks on it never risks stealing input from gameplay.
- On death, `HUD` doesn't just let the death panel visually cover the crosshair/ammo/interact prompt — it actively hides the crosshair (`display: none`) and clears the other elements' text content, skipping their normal per-frame update methods entirely while `playerState !== "alive"`. This was an explicit requirement (elements must not render at all, not just be behind the death screen), and matters in practice because those elements have no background — without this they'd visibly show through/around the semi-transparent death panel.
- `core/utils/Lookup.ts`'s `findById<T extends { id: string }>(list, id)` is the one shared lookup for every content array (`WEAPONS`, `ENEMIES`, `SOUNDS`, `MAPS`) — same reuse rule as `Raycast.ts`/`StateMachine.ts`/`Health.ts`, so there's no per-content-type lookup function. It throws (naming the missing id) rather than returning `undefined`, since a silent `undefined` would surface later as a confusing null-reference error far from the actual mistake (a typo'd id in `main.ts`).
- Player spawn position moved from standalone `SPAWN_X`/`SPAWN_Z` constants in `main.ts` into `MapDef.entities` as a `{ type: "spawn", position: [...] }` entry (checkpoint 5), read back out via `MapLoader.getSpawnPosition()`, which throws if a map has no spawn entity rather than silently defaulting to the origin. This reuses `MapEntity`'s existing type (already had `"spawn"` in its union since checkpoint 1) instead of adding a second, parallel way to declare spawn data.
- `Weapon.startingReserveAmmo` was added so `WeaponSystem`'s starting/reset reserve ammo is weapon data, not a `main.ts` constant passed in alongside the `Weapon` object — this also meant dropping the separate `reserveAmmo` constructor parameter `WeaponSystem` used to take, since it would otherwise be a second, redundant way to say the same number.
- `EnemyDef` gained `sightRange`, `meleeRange`, and `growlInterval` (joining the existing `meleeDamage`/`attackInterval`) so all of `EnemyAI`'s combat tuning is per-enemy-type data instead of file-level constants — a second enemy type (checkpoint 7+) can now redefine any of these without touching `EnemyAI.ts`. The debug health-label's `LABEL_HEIGHT_OFFSET` and the scoring constants (`SCORE_PER_HIT`/`SCORE_PER_KILL`) stayed as `EnemyAI.ts` constants: they're rendering/scoring-system concerns, not enemy combat stats, and weren't part of what checkpoint 5 asked to move.
- `SoundDef.positional` was already correctly consumed by `AudioSystem` before checkpoint 5 (positional sounds get a `THREE.PositionalAudio` pool played via `playAt()`, attached to the emitting object; non-positional sounds get a `THREE.Audio` pool played via `play()`) — this was built at checkpoint 4 for the zombie growl/death sounds. Checkpoint 5 only moved the `SoundDef` instances themselves into `content/sounds.ts`; there was no `AudioSystem` gap to close or log here.

## Future mechanics (documented, not built)

Ideas that came up while implementing checkpoint 4.5 but are deliberately out of scope until a later checkpoint gives them a real home. Listed so they're designed-for-later, not forgotten.

- **Downed/revive state for the player**: a third `playerState` value (e.g. `"downed"`) between `"alive"` and `"dead"`, gated behind a perk that doesn't exist yet. The string-union type was chosen specifically so adding this later doesn't require touching every call site that currently checks `=== "alive"` as a boolean-like condition.
- **Equivalent downed ("crawler") state for enemies**: an enemy that, below some health threshold, becomes slower and weaker instead of dying outright — reusing the same state-union pattern as the player's.
- **Perk system framework**: not designed yet. The downed/revive mechanic above depends on it existing first.
- **Post-death flow beyond "YOU DIED" + Respawn/Main Menu**: spectate mode, a "you survived N rounds" summary screen. Depends on game-mode/wave logic that doesn't exist until checkpoint 7 (`ZombieSurvival`), so it can't be designed concretely yet.
- **Full "Main Menu" behavior**: the button currently just calls the same respawn logic as "Respawn" — checkpoint 9 gives it a real mode-select/loadout screen to return to instead.
- **Round-based score reset within a still-alive run**: checkpoint 4.8 decided run-level reset (score/pointsBalance zero on every new run, started by death → Respawn/Main Menu). Whether score should *also* reset between waves/rounds within one ongoing run (once `ZombieSurvival`'s round structure exists in checkpoint 7) is still open — not the same question, not yet decided.
- **Spending points**: weapon wall-buys and paid interacts, drawing from `pointsBalance` (not `score`), extending `MapEntity`'s existing `"button"`/`"pickup"` types with a cost field. Not designed yet — depends on the map-entity work in checkpoint 6 and the content-driven weapons from checkpoint 5 both being in place first.
- **Round/time-based zombie spawning with a max-concurrent-alive cap**: not designed yet, depends on checkpoint 7's `ZombieSurvival` mode.
- **Spawn point selection that avoids spawning zombies in the player's line of sight**: not designed yet, same checkpoint-7 dependency.
- **Multiple simultaneous enemies reusing `reset()`/`registerResettable()`**: checkpoint 4.8's single-zombie reset mechanism was deliberately built generic (id-keyed `gameState.enemyHealth`, per-instance `reset()` closures) so checkpoint 7's multi-enemy spawning can register more instances the same way, not require a rewrite.
- **Future entities hooking into `RunManager`**: doors, weapon wall-buys, pickups (checkpoint 6+) are expected to call `runManager.registerResettable()` the same way `WeaponSystem`/`EnemyAI` do, once they exist.
